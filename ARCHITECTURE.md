# System Architecture — Ollama Management Server

**As-built**, reflecting the code in this repo (not the aspirational roadmap). For
product scope see [BLUEPRINT.md](BLUEPRINT.md); for operations see
[OPERATIONS.md](OPERATIONS.md).

---

## 1. Overview

A self-hosted FastAPI application that sits in front of an Ollama GPU inference
server and adds authentication, access control, telemetry, request logging,
analytics, and a chat Playground. A separate **LiteLLM** service provides the
OpenAI-compatible API, virtual API keys, and spend tracking; this app proxies
LiteLLM's *admin* API so operators manage everything from one portal.

---

## 2. Request flow

```
Browser / API clients
        │  HTTPS + WebSocket
        ▼
┌──────────────────────────────┐
│ Nginx (:443)                 │  TLS termination
└──────────────┬───────────────┘
               │ proxy_pass
               ▼
┌──────────────────────────────────────────────────────────┐
│ FastAPI backend (:8000, single uvicorn worker)            │
│                                                            │
│  Middleware (outermost → innermost):                       │
│    CORS  →  RateLimiter  →  RequestLogger  →  routers       │
│                                                            │
│  Routers:                                                  │
│    /api/auth          JWT login (+ brute-force throttle)   │
│    /api/gpu   /ws/gpu       GPU telemetry (WebSocket 1 Hz)  │
│    /api/system /ws/system   CPU/RAM/disk telemetry         │
│    /api/models  /api/chat   list/pull/delete + chat (SSE)  │
│    /ollama/*          reverse proxy (IP allowlist only)    │
│    /api/access        IP allow rules                       │
│    /api/analytics /api/logs request-log analytics          │
│    /api/settings /api/alerts SMTP + GPU alert history      │
│    /api/users         user CRUD + password change          │
│    /api/gateway/*     → LiteLLM admin API (keys/models/spend)│
│    /{path}            SPA fallback → frontend/dist/index.html│
└───────┬─────────────────────────────┬──────────────────────┘
        │ httpx                        │ httpx (admin key)
        ▼                              ▼
   Ollama (:11434)               LiteLLM (:4000) ── Postgres (:5432)
   GPU 0 | GPU 1 | GPU 2          OpenAI-compatible API, keys, spend
```

**Auth model:** all `/api/*` routes require a JWT bearer token
(`auth.get_current_user`). `/ollama/*` is gated by the **IP allowlist only**, not
JWT. The Playground deliberately uses the JWT-gated `/api/chat` rather than
`/ollama/*` so it stays behind the same login as the rest of the UI.

---

## 3. Components (backend/)

| Module | Responsibility |
|--------|----------------|
| `main.py` | App assembly: lifespan (init DB, seed admin, start scheduler + telemetry loops), middleware, router registration, SPA + cert serving |
| `auth.py` | bcrypt hashing, JWT issue/verify, `seed_admin`, per-IP login throttle |
| `proxy.py` | `/ollama/*` streaming reverse proxy + CIDR allowlist (`ip_rules`) |
| `models.py` | List / pull (SSE) / delete models; `/api/chat` streaming chat |
| `gpu.py` · `gpu_monitor.py` | pynvml/nvidia-smi telemetry + WebSocket broadcast; health checks + SMTP alerts |
| `system.py` | psutil CPU/RAM/disk telemetry + WebSocket broadcast |
| `logger.py` | Request-logging middleware → `request_logs` |
| `rate_limiter.py` | In-memory sliding-window limiter (per IP / per key) |
| `analytics.py` | Aggregations over `request_logs` (summary, timeseries, heatmap, latency) |
| `gateway.py` | Thin proxy to LiteLLM admin API + spend reports from its Postgres |
| `settings.py` | SMTP config (DB-backed) + GPU alert history |
| `users.py` | User CRUD, role checks, self password change |
| `scheduler.py` | APScheduler jobs (log rotation, VRAM snapshot, GPU health) |
| `config.py` · `db/database.py` | Pydantic settings; SQLite connection (WAL) + schema init |

**Frontend** (`frontend/src`): React 18 + Vite SPA, Tailwind v3, recharts, sonner
toasts. Pages map 1:1 to sidebar nav. Telemetry via `useGPU`/`useSystem` WebSocket
hooks; HTTP via an axios instance (`api.js`) that injects the JWT and redirects to
`/login` on 401. Built to `frontend/dist`, served by the backend.

---

## 4. Data stores

**SQLite** (`backend/db/schema.sql`) — local operational data:
`users`, `ip_rules`, `request_logs`, `settings`, `gpu_alerts`, `scheduler_jobs`.
Tables present but **not yet wired**: `api_keys` (no `get_current_principal`),
`prompt_templates` (no endpoints).

**LiteLLM Postgres** — virtual API keys, budgets, and per-request spend logs. Read
read-only by `gateway.py` for the analytics/report pages. Authoritative for anything
billing-related.

No ORM; raw `sqlite3` via a context manager. No migration framework — schema is
additive (`CREATE TABLE IF NOT EXISTS`).

---

## 5. Real-time telemetry

Two `asyncio` broadcast loops start at app lifespan and push JSON to all connected
WebSocket clients every second: `/ws/gpu` (per-GPU VRAM, util, temp) and `/ws/system`
(CPU, memory, disk). Clients auto-reconnect every 2 s on drop. History is currently
client-side only (a 60-point in-memory sparkline); nothing is persisted for charting.

---

## 6. Known limitations (drive the roadmap)

- **Rate limiting is in-memory** — per-process, lost on restart, not multi-instance.
- **Local API-key enforcement is not implemented** — `api_keys` columns are unused;
  per-key model/rate limits live entirely in LiteLLM.
- **Single uvicorn worker** — vertical scale only; WebSocket fan-out is per-process.
- **No persisted GPU history**, no smart router, no benchmarking, no prompt-template
  UI — all roadmap (see BLUEPRINT.md).
- **P95 latency** in analytics is an approximation.

---

## 7. Roadmap hooks

The schema and module layout anticipate: wiring local API-key principals
(`get_current_principal`), a `router.py` for smart model routing, model benchmarking
(`/api/models/benchmark`), prompt-template endpoints, persisted GPU history, and
multi-node fan-out. None are built yet; they are intentionally out of the current
scope.
