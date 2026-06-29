"""
LiteLLM Gateway proxy — portal-side admin for the headless LiteLLM engine.

The portal is the only UI; LiteLLM runs faceless. These endpoints are JWT-admin
auth'd (get_current_user) and inject the LiteLLM master key server-side, so the
master key never reaches the browser. Thin pass-through to LiteLLM's admin API.
"""
import asyncio
import csv
import io
from typing import Any

import psycopg2
import psycopg2.extras
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.config import get_settings
from backend.http_client import get_http

router = APIRouter(prefix="/api/gateway", tags=["gateway"])


async def _litellm(method: str, path: str, *, json: dict | None = None,
                   params: dict | None = None) -> Any:
    """One call into LiteLLM's admin API with the master key. Never leaks it out."""
    cfg = get_settings()
    headers = {"Authorization": f"Bearer {cfg.litellm_master_key}"}
    try:
        resp = await get_http().request(
            method, f"{cfg.litellm_base_url}{path}",
            headers=headers, json=json, params=params, timeout=30,
        )
    except Exception as e:  # gateway down / unreachable
        raise HTTPException(status_code=502, detail=f"LiteLLM unreachable: {e}")
    if resp.status_code >= 400:
        raise HTTPException(status_code=resp.status_code,
                            detail=f"LiteLLM: {resp.text[:300]}")
    return resp.json()


# ── Keys ────────────────────────────────────────────────────────────────────

class GatewayKeyCreate(BaseModel):
    key_alias: str | None = None
    models: list[str] = []          # [] = all models
    max_budget: float | None = None
    duration: str | None = None     # e.g. "30d", "24h"; None = no expiry


@router.get("/keys")
async def list_keys(user=Depends(get_current_user)):
    """All virtual keys with alias, models, budget, spend, expiry."""
    # ponytail: size capped at 100 by LiteLLM. Paginate if you ever exceed 100 keys.
    data = await _litellm("GET", "/key/list", params={"return_full_object": "true", "size": 100})
    keys = data.get("keys", data) if isinstance(data, dict) else data
    # Trim to what the portal table needs; keep the masked key_name (never the hash).
    out = []
    for k in keys:
        if not isinstance(k, dict):
            continue
        out.append({
            "token": k.get("token"),        # hashed id — used to revoke; not the secret
            "key_name": k.get("key_name"),   # masked display value (sk-...XXXX)
            "alias": k.get("key_alias"),
            "models": k.get("models", []),
            "spend": k.get("spend", 0) or 0,
            "max_budget": k.get("max_budget"),
            "expires": k.get("expires"),
            "tpm_limit": k.get("tpm_limit"),
            "rpm_limit": k.get("rpm_limit"),
        })
    return out


@router.post("/keys", status_code=201)
async def create_key(body: GatewayKeyCreate, user=Depends(get_current_user)):
    """Mint a virtual key. Plaintext key returned once (LiteLLM shows it once)."""
    payload: dict[str, Any] = {}
    if body.key_alias:
        payload["key_alias"] = body.key_alias
    if body.models:
        payload["models"] = body.models
    if body.max_budget is not None:
        payload["max_budget"] = body.max_budget
    if body.duration:
        payload["duration"] = body.duration
    data = await _litellm("POST", "/key/generate", json=payload)
    return {"key": data.get("key"), "alias": data.get("key_alias"),
            "models": data.get("models", []), "max_budget": data.get("max_budget"),
            "expires": data.get("expires")}


class GatewayKeyUpdate(BaseModel):
    token: str                          # hashed id from list
    models: list[str] | None = None     # replace allowed models ([] = all)
    max_budget: float | None = None


@router.patch("/keys")
async def update_key(body: GatewayKeyUpdate, user=Depends(get_current_user)):
    """Edit an existing key's models / budget. Updates by token (the only id the
    portal has, since the plaintext key is shown once)."""
    # The edit form submits the full intended state, so this is authoritative:
    # models always set; max_budget passed as-is (null = clear to unlimited).
    payload: dict[str, Any] = {"key": body.token, "max_budget": body.max_budget}
    if body.models is not None:
        payload["models"] = body.models
    await _litellm("POST", "/key/update", json=payload)
    return {"ok": True}


@router.delete("/keys", status_code=204)
async def delete_key(token: str, user=Depends(get_current_user)):
    """Revoke a key by its token (the hashed id from list, since the plaintext
    key is only shown once at creation)."""
    await _litellm("POST", "/key/delete", json={"keys": [token]})


# ── Spend / models (read-only for now) ──────────────────────────────────────

@router.get("/spend")
async def spend(user=Depends(get_current_user)):
    """Aggregated gateway spend from /spend/logs: totals + per-model + recent rows.
    Aggregating here keeps the browser dumb and the master key server-side."""
    logs = await _litellm("GET", "/spend/logs")
    if not isinstance(logs, list):
        logs = []
    # hash → alias, so rows show a friendly key name
    alias = {}
    try:
        kl = await _litellm("GET", "/key/list", params={"return_full_object": "true", "size": 100})
        for k in (kl.get("keys", []) if isinstance(kl, dict) else []):
            if k.get("token"):
                alias[k["token"]] = k.get("key_alias")
    except HTTPException:
        pass

    total_spend = total_tokens = 0.0
    per_model: dict[str, dict] = {}
    per_key: dict[str, dict] = {}
    for r in logs:
        s = r.get("spend") or 0
        t = r.get("total_tokens") or 0
        total_spend += s
        total_tokens += t
        m = r.get("model") or "unknown"
        pm = per_model.setdefault(m, {"model": m, "spend": 0.0, "requests": 0, "tokens": 0})
        pm["spend"] += s
        pm["requests"] += 1
        pm["tokens"] += t
        # per key/bearer — label by alias, fall back to a short hash
        kh = r.get("api_key") or ""
        label = alias.get(kh) or (kh[:8] if kh else "—")
        pk = per_key.setdefault(kh, {"key": label, "spend": 0.0, "requests": 0, "tokens": 0})
        pk["spend"] += s
        pk["requests"] += 1
        pk["tokens"] += t

    recent = [{
        "time": r.get("startTime"),
        "model": r.get("model"),
        "key": alias.get(r.get("api_key")) or (r.get("api_key", "")[:8] if r.get("api_key") else "—"),
        "spend": r.get("spend") or 0,
        "tokens": r.get("total_tokens") or 0,
        "status": (r.get("metadata") or {}).get("status", ""),
    } for r in sorted(logs, key=lambda x: x.get("startTime") or "", reverse=True)[:25]]

    return {
        "total_spend": round(total_spend, 6),
        "total_requests": len(logs),
        "total_tokens": int(total_tokens),
        "by_model": sorted(per_model.values(), key=lambda x: x["spend"], reverse=True),
        "by_key": sorted(per_key.values(), key=lambda x: x["requests"], reverse=True),
        "recent": recent,
    }


@router.get("/models")
async def models(user=Depends(get_current_user)):
    """Configured gateway models + their provider + db id (id present = removable)."""
    data = await _litellm("GET", "/model/info")
    rows = data.get("data", data) if isinstance(data, dict) else data
    out = []
    for m in rows:
        if not isinstance(m, dict):
            continue
        lp = m.get("litellm_params", {}) or {}
        out.append({
            "id": (m.get("model_info") or {}).get("id"),
            "model_name": m.get("model_name"),
            "provider": (lp.get("model", "") or "").split("/")[0],
            "backing_model": lp.get("model"),
        })
    return out


class GatewayModelCreate(BaseModel):
    model_name: str                 # friendly name clients call (e.g. "claude-opus-4-8")
    model: str                      # litellm path (e.g. "anthropic/claude-opus-4-8", "openrouter/...")
    api_base: str | None = None     # for Ollama models (http://127.0.0.1:11434)
    api_key: str | None = None      # provider key for a new provider (openrouter/grok/kimi);
                                    # LiteLLM encrypts it into the DB. Omit if the key is in
                                    # LiteLLM's env (OpenAI/Anthropic already are).


@router.post("/models", status_code=201)
async def add_model(body: GatewayModelCreate, user=Depends(get_current_user)):
    """Add a model at runtime (persists in DB; no restart). Provider key is optional:
    pass it for a new provider (stored encrypted), or omit to use LiteLLM's env key.
    NOTE: pass the REAL key value, not an os.environ/ ref — refs don't resolve for DB models."""
    lp: dict[str, Any] = {"model": body.model}
    if body.api_base:
        lp["api_base"] = body.api_base
    if body.api_key:
        lp["api_key"] = body.api_key
    await _litellm("POST", "/model/new", json={"model_name": body.model_name, "litellm_params": lp})
    return {"ok": True}


@router.delete("/models", status_code=204)
async def remove_model(id: str, user=Depends(get_current_user)):
    """Remove a model by its db id (from the list)."""
    await _litellm("POST", "/model/delete", json={"id": id})


_EMBED_HINTS = ("embed", "bge-", "nomic", "mxbai")


@router.post("/models/import-ollama")
async def import_ollama(user=Depends(get_current_user)):
    """Register every model on the Ollama host that isn't already in the gateway.
    Embedding models → ollama/ (embeddings); everything else → ollama_chat/ (chat)."""
    cfg = get_settings()
    info = await _litellm("GET", "/model/info")
    rows = info.get("data", info) if isinstance(info, dict) else info
    existing = {m.get("model_name") for m in rows if isinstance(m, dict)}

    try:
        resp = await get_http().get(f"{cfg.ollama_host}/api/tags", timeout=30)
        tags = resp.json().get("models", [])
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Ollama unreachable: {e}")

    added = []
    for t in tags:
        name = t.get("name")
        if not name or name in existing:
            continue
        prefix = "ollama/" if any(h in name.lower() for h in _EMBED_HINTS) else "ollama_chat/"
        await _litellm("POST", "/model/new", json={
            "model_name": name,
            "litellm_params": {"model": f"{prefix}{name}", "api_base": cfg.ollama_host},
        })
        added.append(name)
    return {"added": added, "count": len(added)}


# ── Historical reporting (queries LiteLLM's daily rollup tables directly) ────────

_DAILY = '"LiteLLM_DailyUserSpend"'
_TOKENS = "(prompt_tokens + completion_tokens)"


def _report_query(start: str, end: str) -> dict:
    """Read-only aggregate over LiteLLM_DailyUserSpend for [start, end] (YYYY-MM-DD).
    Pre-rolled daily, so this stays fast over long ranges. Joins token→alias."""
    cfg = get_settings()
    conn = psycopg2.connect(cfg.litellm_db_url, connect_timeout=5)
    try:
        cur = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
        rng = (start, end)
        cur.execute(
            f"SELECT date::text AS date, SUM(spend) AS spend, SUM(api_requests) AS requests, "
            f"SUM({_TOKENS}) AS tokens FROM {_DAILY} WHERE date >= %s AND date <= %s "
            f"GROUP BY date ORDER BY date", rng)
        daily = [dict(r) for r in cur.fetchall()]
        cur.execute(
            f"SELECT COALESCE(t.key_alias, LEFT(d.api_key, 8)) AS key, SUM(d.spend) AS spend, "
            f"SUM(d.api_requests) AS requests, SUM({_TOKENS.replace('prompt_tokens','d.prompt_tokens').replace('completion_tokens','d.completion_tokens')}) AS tokens "
            f"FROM {_DAILY} d LEFT JOIN \"LiteLLM_VerificationToken\" t ON t.token = d.api_key "
            f"WHERE d.date >= %s AND d.date <= %s GROUP BY key ORDER BY requests DESC", rng)
        by_key = [dict(r) for r in cur.fetchall()]
        cur.execute(
            f"SELECT model, SUM(spend) AS spend, SUM(api_requests) AS requests, "
            f"SUM({_TOKENS}) AS tokens FROM {_DAILY} WHERE date >= %s AND date <= %s "
            f"GROUP BY model ORDER BY spend DESC", rng)
        by_model = [dict(r) for r in cur.fetchall()]
    finally:
        conn.close()

    def _f(rows):  # Decimal → float for JSON
        for r in rows:
            r["spend"] = float(r.get("spend") or 0)
            r["requests"] = int(r.get("requests") or 0)
            r["tokens"] = int(r.get("tokens") or 0)
        return rows

    daily, by_key, by_model = _f(daily), _f(by_key), _f(by_model)
    return {
        "start": start, "end": end,
        "total_spend": round(sum(r["spend"] for r in daily), 6),
        "total_requests": sum(r["requests"] for r in daily),
        "total_tokens": sum(r["tokens"] for r in daily),
        "daily": daily, "by_key": by_key, "by_model": by_model,
    }


@router.get("/report")
async def report(start: str, end: str, user=Depends(get_current_user)):
    """Historical usage for a date range (YYYY-MM-DD): daily series + by key + by model."""
    try:
        return await asyncio.to_thread(_report_query, start, end)
    except psycopg2.Error as e:
        raise HTTPException(status_code=502, detail=f"Report DB error: {e}")


@router.get("/report.csv")
async def report_csv(start: str, end: str, group: str = "key", user=Depends(get_current_user)):
    """CSV export of the report, grouped by key|model|day."""
    data = await asyncio.to_thread(_report_query, start, end)
    rows = {"key": data["by_key"], "model": data["by_model"], "day": data["daily"]}.get(group, data["by_key"])
    label = {"key": "key", "model": "model", "day": "date"}.get(group, "key")
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow([label, "requests", "tokens", "spend_usd"])
    for r in rows:
        w.writerow([r.get(label, ""), r["requests"], r["tokens"], f"{r['spend']:.6f}"])
    buf.seek(0)
    fn = f"gateway-report-{group}-{start}_to_{end}.csv"
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv",
                             headers={"Content-Disposition": f"attachment; filename={fn}"})
