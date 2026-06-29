# CLAUDE.md

This file provides guidance to AI coding assistants (Antigravity, Claude, Cursor, etc.) when working with this repository.

---

## Project Overview

**Ollama Management Server** — a self-hosted, full-stack web application that wraps the Ollama GPU inference server with a complete operational layer. It acts as an authenticating reverse proxy in front of Ollama's native port (:11434), adding GPU monitoring, access control (IP allowlist + API keys), model lifecycle management, request logging, analytics, smart routing, and team collaboration tools.

**Target hardware:** 3-GPU workstation — 2× RTX 3080 Ti (12 GB each) + 1× RTX 3070 (8 GB) = 32 GB total VRAM  
**Ollama host:** `10.0.0.10:11434` (UFW-protected, accessed only via this management layer)

---

## Tech Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Frontend framework | React + Vite | SPA with fast HMR |
| Styling | Tailwind CSS v3 (`tailwindcss@3.4`) + lucide-react icons | Design system |
| Charts | Recharts | GPU graphs, analytics |
| Real-time | WebSocket client | Live GPU telemetry push |
| Backend framework | FastAPI (Python) | REST API + WebSocket server |
| ASGI server | Uvicorn | Production runtime |
| Auth | JWT + bcrypt | Session tokens, password hashing |
| Proxy | httpx | Forwards requests to Ollama :11434 |
| GPU telemetry | pynvml + nvidia-smi fallback | Per-GPU VRAM, util, temperature |
| Task scheduler | APScheduler | Cron jobs (model eviction, log rotation) |
| Database | SQLite | Logs, config, API keys, users |
| Rate limiting | In-memory deque (per-process) | Sliding window throttle — see `rate_limiter.py`. NOT Redis. |
| LLM gateway | LiteLLM (separate service :4000) | API keys, spend tracking, OpenAI-compatible endpoint; portal proxies its admin API via `gateway.py` |
| Reverse proxy | Nginx | TLS termination + static file serving |
| Deployment | systemd service + nginx | Native host process management; no containers |

---

## Commands

```bash
# ── Backend (Python / FastAPI) ─────────────────────────────────────────────
# Install Python dependencies
cd backend && pip install -r requirements.txt

# Start backend dev server (hot reload)
uvicorn backend.main:app --reload --host 0.0.0.0 --port 8000

# Run backend tests
pytest backend/tests/

# ── Frontend (React / Vite) ────────────────────────────────────────────────
# Install frontend dependencies
cd frontend && npm install --legacy-peer-deps

# Start frontend dev server
cd frontend && npm run dev

# Build frontend for production
cd frontend && npm run build

# Lint frontend
cd frontend && npm run lint

# ── Systemd services (native host) ──────────────────────────────────────────
sudo systemctl start ollama-mgmt          # Start FastAPI backend
sudo systemctl stop ollama-mgmt           # Stop backend
sudo systemctl status ollama-mgmt         # Check status
journalctl -u ollama-mgmt -f              # Follow backend logs
sudo systemctl reload nginx               # Reload nginx config

# ── Database ───────────────────────────────────────────────────────────────
# Apply SQLite schema (run once, or after migrations)
sqlite3 backend/db/ollama.db < backend/db/schema.sql
```

---

## Project Structure

```
ollama-manager/
│
├── backend/
│   ├── main.py          # FastAPI app entry point — mounts all routers
│   ├── proxy.py         # Ollama reverse proxy + IP allowlist enforcement
│   ├── gpu.py           # pynvml GPU telemetry + WebSocket push (1s interval)
│   ├── models.py        # Model management: list, pull (SSE), delete, chat (SSE)
│   ├── auth.py          # JWT auth + bcrypt user management + login throttle
│   ├── logger.py        # Request logging middleware (SQLite)
│   ├── scheduler.py     # APScheduler cron tasks
│   ├── gateway.py       # LiteLLM admin-API proxy: keys, models, spend reports
│   ├── analytics.py     # Proxy request-log analytics (summary, timeseries, heatmap)
│   ├── system.py        # CPU/RAM/disk telemetry + WebSocket push
│   ├── settings.py      # SMTP config + GPU alert history
│   ├── gpu_monitor.py   # GPU health checks + SMTP alerting
│   # NOTE: router.py (smart routing) and model benchmarking are roadmap, NOT built yet
│   ├── db/
│   │   ├── schema.sql   # SQLite schema definitions
│   │   └── migrations/  # Version-controlled schema migrations
│   ├── tests/           # pytest test suite
│   └── requirements.txt
│
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Dashboard.jsx      # Live GPU stats page
│   │   │   ├── Models.jsx         # Model manager page
│   │   │   ├── AccessControl.jsx  # IP rules + API key manager
│   │   │   ├── Logs.jsx           # Request log viewer + analytics
│   │   │   ├── Playground.jsx     # Chat UI + model comparison
│   │   │   └── Settings.jsx       # Server config panel
│   │   ├── components/            # Shared UI components
│   │   └── hooks/                 # Custom hooks: useGPU, useModels, …
│   ├── index.html
│   ├── vite.config.js
│   └── package.json
│
├── .agents/
│   └── plans/           # Feature implementation plans (auto-generated by AI)
│
├── .claude/
│   ├── PRD.md           # Product Requirements Document
│   └── commands/        # Slash command definitions for AI workflow
│
├── systemd/
│   └── ollama-mgmt.service  # systemd unit file for the backend
├── nginx/
│   └── ollama-mgmt.conf     # nginx site config (reverse proxy + static files)
├── .env.example         # Environment variable template
├── CLAUDE.md            # ← this file
└── README.md
```

---

## Architecture

All client traffic is routed through the FastAPI Management Server before reaching Ollama:

```
Browser / API Clients / External Tools
           ↓ HTTPS / WebSocket
    Nginx  (:443 → static files)
           ↓ proxy_pass
  FastAPI Management Server (:8000)
    ├── Auth middleware (JWT / API key)
    ├── IP allowlist check
    ├── Rate limiter (in-memory sliding window)
    ├── Request logger (SQLite)
    └── Ollama proxy → :11434
           ↓
     Ollama Native API (:11434)
     RTX 3080 Ti (GPU 0) | RTX 3080 Ti (GPU 1) | RTX 3070 (GPU 2)
```

The server is accessed externally via `https://ollama_dev.example.com`.

The backend is a layered FastAPI app:
- **Routers** handle HTTP/WebSocket endpoints (one file per domain)
- **Middleware** (auth, IP check, rate limit, logging) wraps every inbound request
- **Services** (gpu, models, scheduler) encapsulate business logic
- **DB** layer uses raw SQLite via Python's `sqlite3` (no ORM — keep it simple)

---

## API Endpoints

All `/api/*` endpoints require a JWT `Authorization: Bearer <token>`. `/ollama/*` is
gated by the IP allowlist only (no JWT). The OpenAI-compatible `/v1/chat/completions`
is **served by the separate LiteLLM service (:4000)**, not by this backend — this app
only proxies LiteLLM's *admin* API under `/api/gateway/*`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/gpu/stats` | WebSocket stream: live GPU metrics |
| `GET` | `/api/gpu/history` | Historical GPU utilisation data |
| `GET` | `/api/models` | List installed Ollama models |
| `POST` | `/api/models/pull` | Pull a model (SSE progress) |
| `POST` | `/api/chat` | Stream a chat completion from Ollama (JWT-gated; powers the Playground) |
| `DELETE` | `/api/models/{name}` | Delete a model |
| `POST` | `/api/models/benchmark` | _(roadmap — not implemented)_ |
| `GET` | `/api/access/rules` | List IP allow/deny rules |
| `POST` | `/api/access/rules` | Add IP rule (CIDR supported) |
| `DELETE` | `/api/access/rules/{id}` | Remove an IP rule |
| `GET/POST/PATCH/DELETE` | `/api/gateway/keys` | LiteLLM virtual keys (list/mint/edit/revoke) |
| `GET/POST/DELETE` | `/api/gateway/models` | Gateway model catalogue (incl. cloud providers) |
| `GET` | `/api/gateway/spend` · `/api/gateway/report[.csv]` | Spend + historical reports (from LiteLLM Postgres) |
| `GET` | `/api/logs` | Query request logs with filters |
| `GET` | `/api/analytics/summary` · `/timeseries` · `/heatmap` · `/latency-by-model` | Proxy analytics |
| `POST` | `/v1/chat/completions` | OpenAI-compatible — **served by LiteLLM :4000, not this app** |
| `ANY` | `/ollama/*` | Proxied Ollama API (IP allowlist only) |

> Note: the local `api_keys` SQLite table (`models_allowed`, `rate_limit`) is **not
> wired** — `get_current_principal()` was never implemented, so per-key enforcement
> lives entirely in LiteLLM. Either wire it or drop the table (see roadmap).

---

## Database Schema (SQLite)

```sql
-- backend/db/schema.sql
users           (id, username, password_hash, role, created_at)
api_keys        (id, key_hash, label, user_id, models_allowed, rate_limit, expires_at)
ip_rules        (id, cidr, action, label, priority, created_at)
request_logs    (id, timestamp, ip, api_key_id, model, prompt_tokens, completion_tokens, latency_ms, status)
prompt_templates(id, name, system_prompt, model_default, created_by, created_at)
scheduler_jobs  (id, name, cron_expr, action, last_run, enabled)
```

---

## Code Patterns

### Naming Conventions
- Python files: `snake_case.py` (e.g., `gpu.py`, `auth.py`)
- React components: `PascalCase.jsx` (e.g., `Dashboard.jsx`)
- React hooks: `camelCase` prefixed with `use` (e.g., `useGPU`, `useModels`)
- API route functions: `snake_case` (e.g., `get_gpu_stats`, `pull_model`)
- SQLite columns: `snake_case`

### File Organisation
- One FastAPI router per domain (gpu, models, auth, access, logs, analytics)
- Each router is registered in `main.py` with `app.include_router(...)`
- Frontend pages map 1:1 to sidebar nav items
- Shared UI components go in `frontend/src/components/`

### Error Handling
- FastAPI: raise `HTTPException(status_code=..., detail="...")` for all API errors
- Frontend: show `shadcn/ui` toast notifications for errors (not raw `console.error`)
- Log unhandled exceptions to `request_logs` table with `status = "error"`

### WebSocket (GPU telemetry)
- Backend pushes JSON every 1 second per connected client
- Frontend uses a `useGPU()` hook to manage connection + reconnect logic
- Message format: `{ timestamp, gpus: [{ id, name, vram_used, vram_total, utilization, temperature }] }`

### Auth
- JWT tokens stored in `localStorage` on the frontend
- Every API call sends `Authorization: Bearer <jwt>` header
- API keys are hashed with SHA-256 before storage; the plaintext is shown once at creation

---

## Testing

- **Run tests**: `pytest backend/tests/ -v`
- **Test location**: `backend/tests/`
- **Pattern**: One test file per module (e.g., `test_gpu.py`, `test_auth.py`)
- **Fixtures**: Use `pytest` fixtures in `conftest.py` for DB setup/teardown

---

## Key Files

| File | Purpose |
|------|---------|
| `backend/main.py` | FastAPI app — all routers registered here |
| `backend/proxy.py` | Core Ollama proxy + IP allowlist logic |
| `backend/gpu.py` | pynvml telemetry; WebSocket broadcast loop |
| `backend/auth.py` | JWT validation middleware; user CRUD |
| `backend/db/schema.sql` | Authoritative DB schema |
| `frontend/src/pages/Dashboard.jsx` | Primary landing page — live GPU cards |
| `systemd/ollama-mgmt.service` | systemd unit for the FastAPI backend |
| `.env.example` | All required environment variables |

---

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```env
# Ollama
OLLAMA_HOST=http://10.0.0.10:11434

# Auth
JWT_SECRET=<generate with: openssl rand -hex 32>
JWT_EXPIRE_MINUTES=1440

# Redis (rate limiting)
REDIS_URL=redis://localhost:6379

# SQLite
DB_PATH=./db/ollama.db

# Server
BACKEND_PORT=8000
CORS_ORIGINS=http://localhost:5173,https://your-domain.com
```

---

## On-Demand Context

| Topic | File |
|-------|------|
| Full product spec and phase roadmap | `.claude/PRD.md` |
| Blueprint document (detailed) | `ollama-mgmt-blueprint.docx` |
| Feature implementation plans | `.agents/plans/` |
| Hardware profile (GPU/storage/drivers) | KI: `ollama_multi_gpu_setup` |

---

## Delivery Phases

| Phase | Focus | Key Modules |
|-------|-------|-------------|
| **Phase 1** | Foundation | GPU Monitor, Ollama Proxy, IP Allowlist, Model Manager, JWT Auth |
| **Phase 2** | Ops Layer | API Key Manager, Request Logger, Analytics, Rate Limiter, Scheduler |
| **Phase 3** | Intelligence | Model Benchmarker, Smart Router, OpenAI-compatible API, Token Economy |
| **Phase 4** | Team & Scale | Chat Playground, Multi-user Workspace, Webhooks, Multi-node, Backup |

> Always build Phase N+1 on top of Phase N without breaking existing functionality.

---

## Notes

- Ollama itself runs as a `systemd` service (`ollama.service`) on the host at `10.0.0.10:11434`
- Do **not** expose port 11434 directly — all traffic must go through this management server
- UFW is active on the host; only whitelisted IPs (`10.0.0.40`, `10.0.0.55`, `10.0.0.70`) can currently reach Ollama directly
- VRAM budget: 32 GB total (12 + 12 + 8). Large models (≥ 30B) will span multiple GPUs automatically
- Driver: NVIDIA 580.126.09 / CUDA 13.0
- Python package manager: `pip` (use `venv` or similar). `uv` is an acceptable alternative.
- Keep all new feature plans in `.agents/plans/` — one markdown file per feature
- Run `/prime` (read `CLAUDE.md` + `PRD.md` + relevant plan) at the start of every session
