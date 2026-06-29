import ipaddress

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.config import get_settings
from backend.db.database import get_db
from backend.http_client import get_http

router = APIRouter(tags=["proxy", "access"])


# ── IP Allowlist helpers ───────────────────────────────────────────────────────


def load_allow_rules() -> list[str]:
    with get_db() as db:
        rows = db.execute(
            "SELECT cidr FROM ip_rules WHERE action='allow' ORDER BY priority DESC"
        ).fetchall()
    return [r["cidr"] for r in rows]


def ip_in_allowlist(client_ip: str) -> bool:
    rules = load_allow_rules()
    if not rules:
        return True  # no rules = open (allow all by default)
    try:
        addr = ipaddress.ip_address(client_ip)
        return any(
            addr in ipaddress.ip_network(cidr, strict=False) for cidr in rules
        )
    except ValueError:
        return False


def enforce_ip(request: Request):
    client_ip = request.client.host if request.client else "unknown"
    if not ip_in_allowlist(client_ip):
        raise HTTPException(
            status_code=403, detail=f"IP {client_ip} not in allowlist"
        )


# ── Ollama reverse proxy ──────────────────────────────────────────────────────


@router.api_route(
    "/ollama/{path:path}",
    methods=["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"],
)
async def ollama_proxy(path: str, request: Request, _=Depends(enforce_ip)):
    cfg = get_settings()
    url = f"{cfg.ollama_host}/{path}"
    body = await request.body()
    headers = {
        k: v for k, v in request.headers.items() if k.lower() not in ("host", "content-length")
    }
    resp = await get_http().request(
        method=request.method,
        url=url,
        headers=headers,
        content=body,
        params=dict(request.query_params),
        timeout=None,
    )
    return StreamingResponse(
        resp.aiter_bytes(),
        status_code=resp.status_code,
        headers={
            k: v
            for k, v in resp.headers.items()
            if k.lower() not in ("content-encoding", "transfer-encoding")
        },
    )


# ── IP Rules CRUD ─────────────────────────────────────────────────────────────


class IPRuleSchema(BaseModel):
    cidr: str
    action: str = "allow"
    label: str = ""
    priority: int = 100


@router.get("/api/access/rules")
async def list_rules(user=Depends(get_current_user)):
    with get_db() as db:
        rows = db.execute("SELECT * FROM ip_rules ORDER BY priority DESC").fetchall()
    return [dict(r) for r in rows]


@router.post("/api/access/rules", status_code=201)
async def add_rule(rule: IPRuleSchema, user=Depends(get_current_user)):
    try:
        ipaddress.ip_network(rule.cidr, strict=False)
    except ValueError:
        raise HTTPException(status_code=422, detail=f"Invalid CIDR: {rule.cidr}")
    with get_db() as db:
        cur = db.execute(
            "INSERT INTO ip_rules (cidr, action, label, priority) VALUES (?,?,?,?)",
            (rule.cidr, rule.action, rule.label, rule.priority),
        )
        rule_id = cur.lastrowid
    return {"id": rule_id, **rule.model_dump()}


@router.delete("/api/access/rules/{rule_id}", status_code=204)
async def delete_rule(rule_id: int, user=Depends(get_current_user)):
    with get_db() as db:
        db.execute("DELETE FROM ip_rules WHERE id = ?", (rule_id,))
