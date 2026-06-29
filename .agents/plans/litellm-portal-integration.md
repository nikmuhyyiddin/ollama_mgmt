# Plan: Migrate LiteLLM management into the Ollama Mgmt portal

**Goal:** One UI — the ollama_mgmt portal. LiteLLM keeps running as a **headless gateway engine** (provider routing, /v1/*, enforcement). Its own `/ui` is retired. All admin (keys, spend, models/providers) moves into the existing portal, driven through the portal's FastAPI backend so the LiteLLM **master key never reaches the browser**.

**Non-goal:** Reimplementing LiteLLM's engine (provider routing/spend). That's why we chose it. We migrate the *face*, not the engine.

## Architecture
```
Browser → portal (JWT login)
   ↓ /api/gateway/*           (portal backend, holds master key server-side)
LiteLLM :4000 admin API       (/key/*, /spend/*, /model/info)
   ↓
providers (Ollama / OpenAI / Anthropic)
```
Inference traffic still hits LiteLLM's /v1/* directly (litellm.example.com). Only *management* consolidates into the portal.

## Backend (FastAPI)  — foundation
- `config.py`: add `litellm_base_url` (http://127.0.0.1:4000), `litellm_master_key`.
- `gateway.py` (NEW router, `get_current_user`/admin JWT): thin proxy with one `_litellm()` helper injecting the master key:
  - `GET    /api/gateway/keys`     → `/key/list?return_full_object=true`
  - `POST   /api/gateway/keys`     → `/key/generate`   (models, max_budget, duration, alias)
  - `DELETE /api/gateway/keys`     → `/key/delete`     (by key)
  - `GET    /api/gateway/spend`    → `/spend/logs`     (+ aggregate per key/model)
  - `GET    /api/gateway/models`   → `/model/info`     (list configured models/providers)
  - `POST/DELETE /api/gateway/models` → `/model/new`,`/model/delete` (add/remove provider models) — phase 2
- Register in `main.py`. Add `/api/gateway` to SPA-fallback exclusion prefixes.

## Frontend (React)  — reuse existing shells
- **API Keys page** → repoint from `/api/keys` (custom omk_) to `/api/gateway/keys`. Show alias, models, budget, spend, expiry. Create form: model multiselect + budget + expiry.
- **Analytics page** → add LiteLLM spend (per key / per model / per provider) from `/api/gateway/spend`.
- **Models page** → optional: manage LiteLLM provider models (add OpenAI/Anthropic model) alongside Ollama pulls.
- Sidebar unchanged. No new "Gateway" section — it lives in the pages already there.

## Retire LiteLLM UI
- Set `DISABLE_ADMIN_UI=True` in `/etc/litellm.env` (or block `/ui` + `/sso` at nginx). Keep `litellm.example.com/v1/*` for inference.

## Decommission (after parity)
- Old custom `omk_` key system (`api_keys.py` create/verify) becomes dead once the gateway enforces keys. Keep `verify_api_key` only if any client still uses omk_ keys against the custom /v1; else delete.

## Phases
1. **Foundation** — config + `gateway.py` keys proxy + main.py wire + test. ← start here
2. Repoint API Keys page → gateway keys.
3. Spend into Analytics.
4. Provider/model management + retire LiteLLM /ui.
5. Decommission omk_ keys.
