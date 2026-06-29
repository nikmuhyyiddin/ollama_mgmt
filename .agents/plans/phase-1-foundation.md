# Feature: Phase 1 — Foundation

The following plan should be complete, but validate documentation and codebase patterns before implementing.
Pay special attention to import paths, naming of files, and exact environment variable names.

---

## Feature Description

Bootstrap the entire project from an empty repository into a fully operational **Ollama Management Server — Phase 1**.
After execution the system will be runnable on the bare host (no containers) with:

- Live per-GPU telemetry dashboard (VRAM, utilisation, temperature) via WebSocket
- Authenticated reverse proxy in front of Ollama (JWT login + bcrypt passwords)
- IP allowlist engine (CIDR rules, enforced on every proxied request)
- Model manager (list, pull with SSE progress, delete)
- SQLite persistence (users, IP rules, request logs)
- React + Vite frontend served by nginx
- FastAPI backend managed by a systemd unit

---

## User Story

```
As an Ollama server administrator,
I want a secured web UI with live GPU monitoring and model management,
So that I can safely expose Ollama to my team while maintaining full visibility.
```

---

## Problem Statement

Ollama exposes a raw HTTP API on port 11434 with no authentication, no access control, and no observability.
Anyone able to reach the port can pull, run, or delete models freely. There is no way to see GPU usage at a glance.

---

## Solution Statement

A FastAPI application sits in front of Ollama acting as an authenticating reverse proxy.
All traffic passes through auth + IP checks before reaching Ollama.
A React SPA served by nginx provides a live dashboard and management UI.
Everything runs natively as systemd services on the existing Ubuntu host.

---

## Feature Metadata

- **Feature Type**: New Capability (greenfield)
- **Estimated Complexity**: High
- **Primary Systems Affected**: backend (all Phase 1 modules), frontend (Dashboard + Models + AccessControl pages)
- **Dependencies**: Python 3.x venv, Node.js 18+, nginx, Redis (optional Phase 1 deferral — rate limiting is Phase 2), SQLite3

---

## CONTEXT REFERENCES

### Relevant Codebase Files (READ BEFORE IMPLEMENTING)

> This is a greenfield project. No source files exist yet. The following references are the specification documents.

- `CLAUDE.md` — tech stack, patterns, naming conventions, API endpoint table, DB schema
- `.claude/PRD.md` — product requirements and phase breakdown
- `ollama-mgmt-blueprint.docx` — full system blueprint (extract with `python3 scripts/extract-blueprint.py` or read existing notes)

### New Files to Create

#### Backend
```
backend/
├── main.py              # FastAPI app — registers all routers + middleware
├── config.py            # Settings loaded from .env (pydantic BaseSettings)
├── proxy.py             # Ollama reverse proxy + IP allowlist enforcement
├── gpu.py               # pynvml GPU telemetry + WebSocket broadcast
├── models.py            # Model management: list, pull (SSE), delete
├── auth.py              # JWT generation/validation + user CRUD
├── logger.py            # SQLite request logging middleware
├── db/
│   ├── schema.sql       # Authoritative schema (applied once)
│   └── database.py      # sqlite3 connection helper + migration runner
├── tests/
│   ├── conftest.py      # pytest fixtures (test DB, test client)
│   ├── test_auth.py
│   ├── test_gpu.py
│   ├── test_models.py
│   └── test_proxy.py
└── requirements.txt
```

#### Frontend
```
frontend/
├── index.html
├── vite.config.js
├── package.json
└── src/
    ├── main.jsx
    ├── App.jsx              # Router setup
    ├── api.js               # Axios instance (base URL, auth header injection)
    ├── pages/
    │   ├── Login.jsx
    │   ├── Dashboard.jsx    # Live GPU cards via WebSocket
    │   ├── Models.jsx       # Model list, pull drawer, delete
    │   └── AccessControl.jsx# IP rules table
    ├── components/
    │   ├── Sidebar.jsx
    │   ├── GPUCard.jsx
    │   ├── ModelRow.jsx
    │   └── ProtectedRoute.jsx
    └── hooks/
        ├── useGPU.js        # WebSocket connection + reconnect
        └── useAuth.js       # JWT state, login/logout
```

#### Infrastructure
```
systemd/
└── ollama-mgmt.service   # systemd unit for the FastAPI backend

nginx/
└── ollama-mgmt.conf      # nginx site: proxy_pass :8000, serve /dist

.env.example              # All required env vars with comments
scripts/
└── setup.sh              # One-shot setup: venv, pip install, npm build, nginx symlink, systemd enable
```

### Relevant Documentation (READ BEFORE IMPLEMENTING)

- [FastAPI Main Concepts](https://fastapi.tiangolo.com/tutorial/)
  - Sections: Path operations, Middleware, WebSockets, Background tasks, Depends
  - Why: Core framework for backend
- [FastAPI WebSockets](https://fastapi.tiangolo.com/advanced/websockets/)
  - Why: Pattern for GPU telemetry push endpoint
- [FastAPI SSE (via StreamingResponse)](https://fastapi.tiangolo.com/advanced/custom-response/#streamingresponse)
  - Why: Model pull progress streaming
- [python-jose JWT](https://python-jose.readthedocs.io/en/latest/)
  - Why: JWT creation and validation
- [passlib bcrypt](https://passlib.readthedocs.io/en/stable/lib/passlib.hash.bcrypt.html)
  - Why: Password hashing
- [pynvml docs](https://pypi.org/project/pynvml/)
  - Why: Per-GPU VRAM, temperature, utilisation
- [httpx async client](https://www.python-httpx.org/async/)
  - Why: Async proxy forwarding to Ollama :11434
- [Pydantic BaseSettings](https://docs.pydantic.dev/latest/concepts/pydantic_settings/)
  - Why: .env loading; `pip install pydantic-settings`
- [React Router v6](https://reactrouter.com/en/main/start/overview)
  - Why: SPA routing (Dashboard, Models, AccessControl)
- [shadcn/ui installation (Vite)](https://ui.shadcn.com/docs/installation/vite)
  - Why: Component library for cards, tables, drawers, toasts
- [Recharts quickstart](https://recharts.org/en-US/guide)
  - Why: GPU utilisation sparklines
- [Nginx proxy_pass](https://nginx.org/en/docs/http/ngx_http_proxy_module.html#proxy_pass)
  - Why: Forward `/api/*` and `/ws/*` to FastAPI; serve `/dist` as static

---

## Patterns to Follow

### Backend — naming
```python
# Router functions: verb_noun snake_case
async def get_gpu_stats(...)
async def pull_model(...)
async def list_ip_rules(...)

# Router files: noun.py  (gpu.py, models.py, auth.py, proxy.py)
# Pydantic models: PascalCase ending in Schema or Model
class UserCreateSchema(BaseModel): ...
class GPUStatSchema(BaseModel): ...
```

### Backend — error handling
```python
from fastapi import HTTPException

# Always raise HTTPException with a human-readable detail string
raise HTTPException(status_code=403, detail="IP address not in allowlist")
raise HTTPException(status_code=401, detail="Invalid or expired token")
```

### Backend — auth dependency pattern
```python
# In auth.py — reusable dependency
def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    ...

# In any protected router
@router.get("/api/models")
async def list_models(user=Depends(get_current_user)):
    ...
```

### Backend — SQLite connection pattern
```python
# database.py — always use context managers, never leave connections open
import sqlite3, contextlib

DB_PATH = os.getenv("DB_PATH", "./db/ollama.db")

@contextlib.contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
```

### Backend — WebSocket broadcast pattern
```python
# gpu.py
from fastapi import WebSocket
import asyncio, json

connected_clients: list[WebSocket] = []

async def gpu_broadcast_loop():
    while True:
        stats = read_gpu_stats()   # pynvml call
        payload = json.dumps(stats)
        dead = []
        for ws in connected_clients:
            try:
                await ws.send_text(payload)
            except Exception:
                dead.append(ws)
        for ws in dead:
            connected_clients.remove(ws)
        await asyncio.sleep(1)

@router.websocket("/ws/gpu")
async def gpu_ws(websocket: WebSocket):
    await websocket.accept()
    connected_clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()   # keep alive
    except Exception:
        connected_clients.remove(websocket)
```

### Backend — SSE pull progress pattern
```python
# models.py  — stream Ollama pull progress to client
from fastapi.responses import StreamingResponse
import httpx, json

async def _stream_pull(model_name: str):
    async with httpx.AsyncClient() as client:
        async with client.stream("POST", f"{OLLAMA_HOST}/api/pull",
                                 json={"name": model_name}, timeout=None) as r:
            async for line in r.aiter_lines():
                if line:
                    yield f"data: {line}\n\n"

@router.post("/api/models/pull")
async def pull_model(body: PullModelSchema, user=Depends(get_current_user)):
    return StreamingResponse(_stream_pull(body.name), media_type="text/event-stream")
```

### Frontend — Axios instance
```js
// src/api.js
import axios from 'axios'

const api = axios.create({ baseURL: import.meta.env.VITE_API_URL || '' })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

export default api
```

### Frontend — useGPU hook pattern
```js
// src/hooks/useGPU.js
import { useState, useEffect } from 'react'

export function useGPU() {
  const [gpuData, setGpuData] = useState([])

  useEffect(() => {
    let ws
    const connect = () => {
      ws = new WebSocket(`ws://${location.host}/ws/gpu`)
      ws.onmessage = e => setGpuData(JSON.parse(e.data).gpus)
      ws.onclose = () => setTimeout(connect, 2000)  // auto-reconnect
    }
    connect()
    return () => ws?.close()
  }, [])

  return gpuData
}
```

### Frontend — error toast pattern
```jsx
import { toast } from 'sonner'   // shadcn/ui toast provider

try {
  await api.delete(`/api/models/${name}`)
  toast.success(`Model ${name} deleted`)
} catch (err) {
  toast.error(err.response?.data?.detail || 'Unexpected error')
}
```

---

## IMPLEMENTATION PLAN

### Step A: Project Scaffold

Create directory structure, virtual environment, requirements, and package.json.

### Step B: Backend — Config & Database

`config.py` (BaseSettings from .env) → `db/schema.sql` → `db/database.py` (connection helper + schema bootstrap).

### Step C: Backend — Auth Module

`auth.py`: bcrypt password hashing, JWT creation/validation, `/api/auth/login` endpoint, `get_current_user` dependency, seed default admin user on startup.

### Step D: Backend — GPU Telemetry

`gpu.py`: pynvml init, `read_gpu_stats()`, background broadcast loop, `/ws/gpu` WebSocket endpoint.

### Step E: Backend — Ollama Proxy + IP Allowlist

`proxy.py`: load IP rules from SQLite, CIDR match check, `ANY /ollama/*` wildcard proxy using httpx, IP enforcement middleware.

### Step F: Backend — Model Manager

`models.py`: list models (`GET /api/models`), pull with SSE (`POST /api/models/pull`), delete (`DELETE /api/models/{name}`).

### Step G: Backend — Access Control API

IP rules CRUD (list, add, delete) as a sub-section of `proxy.py` or a separate `access.py` router.

### Step H: Backend — Request Logger Middleware

`logger.py`: FastAPI middleware that logs every request to `request_logs` table (IP, model, latency, status).

### Step I: Backend — main.py

Wire all routers, start the GPU broadcast loop as a background task on startup.

### Step J: Frontend Scaffold

`npm create vite@latest frontend -- --template react`, install shadcn/ui, Recharts, Axios, React Router.

### Step K: Frontend — Auth Flow

`useAuth.js` hook, `Login.jsx` page, `ProtectedRoute.jsx`, JWT stored in `localStorage`.

### Step L: Frontend — Dashboard Page

`Dashboard.jsx`: `useGPU()` hook → render 3× `GPUCard.jsx` (VRAM bar, utilisation%, temperature, sparkline).

### Step M: Frontend — Models Page

`Models.jsx`: table of installed models (name, size, quantisation), pull drawer with SSE progress bar, delete button.

### Step N: Frontend — Access Control Page

`AccessControl.jsx`: IP rules table with add/delete, display current request IP.

### Step O: Infrastructure — systemd + nginx

`systemd/ollama-mgmt.service` unit, `nginx/ollama-mgmt.conf` site config, `scripts/setup.sh` installer.

---

## STEP-BY-STEP TASKS

> Execute every task in order. Each has a `VALIDATE` command you must run before moving to the next.

---

### TASK 1 — CREATE project directory structure

- **IMPLEMENT**: Create all directories listed in "New Files to Create" above
  ```bash
  mkdir -p backend/db backend/tests frontend scripts systemd nginx
  ```
- **VALIDATE**: `ls -la` confirms directories exist

---

### TASK 2 — CREATE `backend/requirements.txt`

- **IMPLEMENT**: Write the following exact content:
  ```
  fastapi==0.115.0
  uvicorn[standard]==0.30.6
  httpx==0.27.2
  pynvml==11.5.0
  python-jose[cryptography]==3.3.0
  passlib[bcrypt]==1.7.4
  pydantic-settings==2.4.0
  python-multipart==0.0.9
  pytest==8.3.3
  httpx==0.27.2
  pytest-asyncio==0.24.0
  ```
- **GOTCHA**: `python-multipart` is required by FastAPI for form data (login form).
- **VALIDATE**: `cat backend/requirements.txt | wc -l` returns ≥ 10

---

### TASK 3 — CREATE Python virtual environment and install deps

- **IMPLEMENT**:
  ```bash
  python3 -m venv backend/.venv
  backend/.venv/bin/pip install --upgrade pip
  backend/.venv/bin/pip install -r backend/requirements.txt
  ```
- **VALIDATE**: `backend/.venv/bin/python -c "import fastapi, pynvml, jose; print('OK')"` prints `OK`

---

### TASK 4 — CREATE `.env.example` and `.env`

- **IMPLEMENT**: Create `.env.example` at project root:
  ```env
  # Ollama
  OLLAMA_HOST=http://172.16.50.17:11434

  # Auth
  JWT_SECRET=change-me-generate-with-openssl-rand-hex-32
  JWT_EXPIRE_MINUTES=1440

  # SQLite
  DB_PATH=./db/ollama.db

  # Server
  BACKEND_HOST=0.0.0.0
  BACKEND_PORT=8000
  CORS_ORIGINS=http://localhost:5173
  ```
- Copy to `.env` and set a real `JWT_SECRET`: `openssl rand -hex 32`
- **VALIDATE**: `cat .env | grep JWT_SECRET` shows a 64-char hex string

---

### TASK 5 — CREATE `backend/config.py`

- **IMPLEMENT**:
  ```python
  from pydantic_settings import BaseSettings
  from functools import lru_cache

  class Settings(BaseSettings):
      ollama_host: str = "http://127.0.0.1:11434"
      jwt_secret: str
      jwt_expire_minutes: int = 1440
      db_path: str = "./db/ollama.db"
      backend_host: str = "0.0.0.0"
      backend_port: int = 8000
      cors_origins: str = "http://localhost:5173"

      class Config:
          env_file = ".env"

  @lru_cache()
  def get_settings() -> Settings:
      return Settings()
  ```
- **VALIDATE**: `cd backend && ../.venv/bin/python -c "from config import get_settings; s=get_settings(); print(s.ollama_host)"` prints the Ollama URL

---

### TASK 6 — CREATE `backend/db/schema.sql`

- **IMPLEMENT**: Full SQLite schema:
  ```sql
  CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'viewer',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS api_keys (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      key_hash TEXT UNIQUE NOT NULL,
      label TEXT,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      models_allowed TEXT,          -- JSON array or '*'
      rate_limit INTEGER,           -- requests per minute
      expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS ip_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cidr TEXT NOT NULL,
      action TEXT NOT NULL DEFAULT 'allow',  -- 'allow' | 'deny'
      label TEXT,
      priority INTEGER NOT NULL DEFAULT 100,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS request_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      timestamp TEXT NOT NULL DEFAULT (datetime('now')),
      ip TEXT,
      api_key_id INTEGER REFERENCES api_keys(id) ON DELETE SET NULL,
      model TEXT,
      prompt_tokens INTEGER,
      completion_tokens INTEGER,
      latency_ms INTEGER,
      status TEXT
  );

  CREATE TABLE IF NOT EXISTS prompt_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      system_prompt TEXT,
      model_default TEXT,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS scheduler_jobs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      cron_expr TEXT NOT NULL,
      action TEXT NOT NULL,
      last_run TEXT,
      enabled INTEGER NOT NULL DEFAULT 1
  );
  ```
- **VALIDATE**: `sqlite3 /tmp/test.db < backend/db/schema.sql && sqlite3 /tmp/test.db ".tables"` lists all 6 tables

---

### TASK 7 — CREATE `backend/db/database.py`

- **IMPLEMENT**:
  ```python
  import sqlite3, contextlib, os
  from backend.config import get_settings

  def get_db_path() -> str:
      return get_settings().db_path

  def init_db():
      """Apply schema.sql to create tables if they don't exist."""
      db_path = get_db_path()
      os.makedirs(os.path.dirname(db_path) if os.path.dirname(db_path) else ".", exist_ok=True)
      schema = open(os.path.join(os.path.dirname(__file__), "schema.sql")).read()
      with sqlite3.connect(db_path) as conn:
          conn.executescript(schema)

  @contextlib.contextmanager
  def get_db():
      conn = sqlite3.connect(get_db_path(), check_same_thread=False)
      conn.row_factory = sqlite3.Row
      conn.execute("PRAGMA journal_mode=WAL")
      try:
          yield conn
          conn.commit()
      except Exception:
          conn.rollback()
          raise
      finally:
          conn.close()
  ```
- **GOTCHA**: Use `PRAGMA journal_mode=WAL` to allow concurrent reads while the broadcaster writes GPU logs.
- **VALIDATE**: `cd backend && ../.venv/bin/python -c "from db.database import init_db; init_db(); print('DB OK')"`

---

### TASK 8 — CREATE `backend/auth.py`

- **IMPLEMENT**:
  ```python
  from datetime import datetime, timedelta
  from fastapi import APIRouter, Depends, HTTPException, status
  from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
  from jose import JWTError, jwt
  from passlib.context import CryptContext
  from pydantic import BaseModel
  from backend.config import get_settings
  from backend.db.database import get_db

  router = APIRouter(tags=["auth"])
  pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
  oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")

  class Token(BaseModel):
      access_token: str
      token_type: str = "bearer"

  def hash_password(plain: str) -> str:
      return pwd_ctx.hash(plain)

  def verify_password(plain: str, hashed: str) -> bool:
      return pwd_ctx.verify(plain, hashed)

  def create_token(data: dict) -> str:
      cfg = get_settings()
      expires = datetime.utcnow() + timedelta(minutes=cfg.jwt_expire_minutes)
      return jwt.encode({**data, "exp": expires}, cfg.jwt_secret, algorithm="HS256")

  def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
      cfg = get_settings()
      try:
          payload = jwt.decode(token, cfg.jwt_secret, algorithms=["HS256"])
          return payload
      except JWTError:
          raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED,
                              detail="Invalid or expired token")

  def seed_admin():
      """Create default admin user if no users exist."""
      with get_db() as db:
          row = db.execute("SELECT id FROM users LIMIT 1").fetchone()
          if not row:
              db.execute(
                  "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                  ("admin", hash_password("admin"), "admin")
              )

  @router.post("/api/auth/login", response_model=Token)
  async def login(form: OAuth2PasswordRequestForm = Depends()):
      with get_db() as db:
          row = db.execute("SELECT * FROM users WHERE username = ?",
                           (form.username,)).fetchone()
      if not row or not verify_password(form.password, row["password_hash"]):
          raise HTTPException(status_code=401, detail="Incorrect username or password")
      token = create_token({"sub": row["username"], "role": row["role"], "id": row["id"]})
      return Token(access_token=token)
  ```
- **GOTCHA**: Default credentials are `admin` / `admin` — note this prominently in the UI and README. Production deployments MUST change the password immediately.
- **VALIDATE**: `cd backend && ../.venv/bin/python -c "from auth import hash_password, verify_password; assert verify_password('test', hash_password('test')); print('Auth OK')"`

---

### TASK 9 — CREATE `backend/gpu.py`

- **IMPLEMENT**:
  ```python
  import asyncio, json, time
  from fastapi import APIRouter, WebSocket, WebSocketDisconnect
  from typing import Any

  try:
      import pynvml
      pynvml.nvmlInit()
      NVML_AVAILABLE = True
  except Exception:
      NVML_AVAILABLE = False

  router = APIRouter(tags=["gpu"])
  _clients: list[WebSocket] = []

  def read_gpu_stats() -> dict:
      timestamp = time.time()
      if not NVML_AVAILABLE:
          return {"timestamp": timestamp, "gpus": []}
      gpus = []
      count = pynvml.nvmlDeviceGetCount()
      for i in range(count):
          handle = pynvml.nvmlDeviceGetHandleByIndex(i)
          mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
          util = pynvml.nvmlDeviceGetUtilizationRates(handle)
          temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
          gpus.append({
              "id": i,
              "name": pynvml.nvmlDeviceGetName(handle),
              "vram_used_mb": mem.used // 1024 // 1024,
              "vram_total_mb": mem.total // 1024 // 1024,
              "utilization_pct": util.gpu,
              "temperature_c": temp,
          })
      return {"timestamp": timestamp, "gpus": gpus}

  async def gpu_broadcast_loop():
      while True:
          if _clients:
              payload = json.dumps(read_gpu_stats())
              dead = []
              for ws in _clients:
                  try:
                      await ws.send_text(payload)
                  except Exception:
                      dead.append(ws)
              for ws in dead:
                  _clients.remove(ws)
          await asyncio.sleep(1)

  @router.websocket("/ws/gpu")
  async def gpu_websocket(websocket: WebSocket):
      await websocket.accept()
      _clients.append(websocket)
      try:
          while True:
              await websocket.receive_text()
      except WebSocketDisconnect:
          pass
      finally:
          if websocket in _clients:
              _clients.remove(websocket)

  @router.get("/api/gpu/stats")
  async def get_gpu_snapshot():
      """One-shot HTTP endpoint for current GPU stats (no WS needed)."""
      return read_gpu_stats()
  ```
- **GOTCHA**: pynvml must be initialised before any calls. Wrap in try/except so the server still starts if no GPU is available (dev machine fallback).
- **VALIDATE**: `cd backend && ../.venv/bin/python -c "from gpu import read_gpu_stats; import json; print(json.dumps(read_gpu_stats(), indent=2))"`

---

### TASK 10 — CREATE `backend/proxy.py`

- **IMPLEMENT**:
  ```python
  import ipaddress
  from fastapi import APIRouter, Request, HTTPException, Depends
  from fastapi.responses import StreamingResponse
  import httpx
  from pydantic import BaseModel
  from backend.config import get_settings
  from backend.db.database import get_db
  from backend.auth import get_current_user

  router = APIRouter(tags=["proxy", "access"])

  # ── IP Allowlist helpers ───────────────────────────────────────────────────

  def load_allow_rules() -> list[str]:
      with get_db() as db:
          rows = db.execute(
              "SELECT cidr FROM ip_rules WHERE action='allow' ORDER BY priority DESC"
          ).fetchall()
      return [r["cidr"] for r in rows]

  def ip_in_allowlist(client_ip: str) -> bool:
      rules = load_allow_rules()
      if not rules:
          return True  # no rules = open access (explicit default)
      try:
          addr = ipaddress.ip_address(client_ip)
          return any(addr in ipaddress.ip_network(cidr, strict=False) for cidr in rules)
      except ValueError:
          return False

  def enforce_ip(request: Request):
      client_ip = request.client.host
      if not ip_in_allowlist(client_ip):
          raise HTTPException(status_code=403, detail=f"IP {client_ip} not in allowlist")

  # ── Ollama proxy ───────────────────────────────────────────────────────────

  @router.api_route("/ollama/{path:path}", methods=["GET","POST","PUT","DELETE","PATCH","HEAD","OPTIONS"])
  async def ollama_proxy(path: str, request: Request, _=Depends(enforce_ip)):
      cfg = get_settings()
      url = f"{cfg.ollama_host}/{path}"
      body = await request.body()
      async with httpx.AsyncClient(timeout=None) as client:
          resp = await client.request(
              method=request.method,
              url=url,
              headers={k: v for k, v in request.headers.items() if k.lower() != "host"},
              content=body,
          )
      return StreamingResponse(
          resp.aiter_bytes(),
          status_code=resp.status_code,
          headers=dict(resp.headers),
      )

  # ── IP Rules CRUD ──────────────────────────────────────────────────────────

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
      # Validate CIDR
      try:
          ipaddress.ip_network(rule.cidr, strict=False)
      except ValueError:
          raise HTTPException(status_code=422, detail=f"Invalid CIDR: {rule.cidr}")
      with get_db() as db:
          cur = db.execute(
              "INSERT INTO ip_rules (cidr, action, label, priority) VALUES (?,?,?,?)",
              (rule.cidr, rule.action, rule.label, rule.priority)
          )
      return {"id": cur.lastrowid, **rule.dict()}

  @router.delete("/api/access/rules/{rule_id}", status_code=204)
  async def delete_rule(rule_id: int, user=Depends(get_current_user)):
      with get_db() as db:
          db.execute("DELETE FROM ip_rules WHERE id = ?", (rule_id,))
  ```
- **GOTCHA**: `load_allow_rules()` is called on every request — it's a file open + SQLite query. This is acceptable for Phase 1. Phase 2 will add in-memory caching.
- **VALIDATE**: `cd backend && ../.venv/bin/python -c "from proxy import ip_in_allowlist; print(ip_in_allowlist('127.0.0.1'))"`

---

### TASK 11 — CREATE `backend/models.py`

- **IMPLEMENT**:
  ```python
  from fastapi import APIRouter, Depends, HTTPException
  from fastapi.responses import StreamingResponse
  import httpx
  from pydantic import BaseModel
  from backend.config import get_settings
  from backend.auth import get_current_user

  router = APIRouter(tags=["models"])

  class PullModelSchema(BaseModel):
      name: str

  @router.get("/api/models")
  async def list_models(user=Depends(get_current_user)):
      cfg = get_settings()
      async with httpx.AsyncClient(timeout=30) as client:
          resp = await client.get(f"{cfg.ollama_host}/api/tags")
      if resp.status_code != 200:
          raise HTTPException(status_code=resp.status_code, detail="Failed to reach Ollama")
      return resp.json()

  @router.post("/api/models/pull")
  async def pull_model(body: PullModelSchema, user=Depends(get_current_user)):
      cfg = get_settings()
      async def _stream():
          async with httpx.AsyncClient(timeout=None) as client:
              async with client.stream(
                  "POST", f"{cfg.ollama_host}/api/pull",
                  json={"name": body.name, "stream": True}
              ) as resp:
                  async for line in resp.aiter_lines():
                      if line:
                          yield f"data: {line}\n\n"
      return StreamingResponse(_stream(), media_type="text/event-stream")

  @router.delete("/api/models/{name:path}", status_code=204)
  async def delete_model(name: str, user=Depends(get_current_user)):
      cfg = get_settings()
      async with httpx.AsyncClient(timeout=30) as client:
          resp = await client.delete(f"{cfg.ollama_host}/api/delete",
                                     json={"name": name})
      if resp.status_code not in (200, 204):
          raise HTTPException(status_code=resp.status_code, detail="Failed to delete model")
  ```
- **GOTCHA**: Model names with `:` (e.g., `llama3:8b`) — use `name:path` path parameter type so FastAPI doesn't truncate at the colon.
- **VALIDATE**: After `main.py` is up, `curl -H "Authorization: Bearer <token>" http://localhost:8000/api/models`

---

### TASK 12 — CREATE `backend/logger.py`

- **IMPLEMENT**:
  ```python
  import time
  from fastapi import Request
  from starlette.middleware.base import BaseHTTPMiddleware
  from backend.db.database import get_db

  class RequestLoggerMiddleware(BaseHTTPMiddleware):
      async def dispatch(self, request: Request, call_next):
          start = time.time()
          response = await call_next(request)
          latency_ms = int((time.time() - start) * 1000)
          # Only log /api/* and /ollama/* — skip static assets
          if request.url.path.startswith(("/api/", "/ollama/", "/ws/")):
              client_ip = request.client.host if request.client else "unknown"
              status = str(response.status_code)
              try:
                  with get_db() as db:
                      db.execute(
                          "INSERT INTO request_logs (ip, latency_ms, status) VALUES (?, ?, ?)",
                          (client_ip, latency_ms, status)
                      )
              except Exception:
                  pass  # Never let logging break a request
          return response
  ```
- **GOTCHA**: Middleware must never raise — wrap DB write in `try/except`.
- **VALIDATE**: After server starts, make a request, then `sqlite3 ./db/ollama.db "SELECT * FROM request_logs LIMIT 5;"`

---

### TASK 13 — CREATE `backend/main.py`

- **IMPLEMENT**:
  ```python
  import asyncio
  from contextlib import asynccontextmanager
  from fastapi import FastAPI
  from fastapi.middleware.cors import CORSMiddleware
  from backend.config import get_settings
  from backend.db.database import init_db
  from backend.auth import router as auth_router, seed_admin
  from backend.gpu import router as gpu_router, gpu_broadcast_loop
  from backend.models import router as models_router
  from backend.proxy import router as proxy_router
  from backend.logger import RequestLoggerMiddleware

  @asynccontextmanager
  async def lifespan(app: FastAPI):
      # Startup
      init_db()
      seed_admin()
      task = asyncio.create_task(gpu_broadcast_loop())
      yield
      # Shutdown
      task.cancel()

  app = FastAPI(title="Ollama Management Server", lifespan=lifespan)

  cfg = get_settings()
  app.add_middleware(
      CORSMiddleware,
      allow_origins=cfg.cors_origins.split(","),
      allow_credentials=True,
      allow_methods=["*"],
      allow_headers=["*"],
  )
  app.add_middleware(RequestLoggerMiddleware)

  app.include_router(auth_router)
  app.include_router(gpu_router)
  app.include_router(models_router)
  app.include_router(proxy_router)

  if __name__ == "__main__":
      import uvicorn
      uvicorn.run("backend.main:app", host=cfg.backend_host, port=cfg.backend_port, reload=True)
  ```
- **VALIDATE**:
  ```bash
  cd /home/nms_admin/ollama_mgmt
  backend/.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000
  # In another terminal:
  curl http://localhost:8000/api/gpu/stats
  ```

---

### TASK 14 — CREATE Frontend scaffold

- **IMPLEMENT**:
  ```bash
  cd /home/nms_admin/ollama_mgmt
  npm create vite@latest frontend -- --template react
  cd frontend && npm install
  # Install dependencies
  npm install axios react-router-dom recharts sonner
  # Install shadcn/ui  (follow prompts, choose default)
  npx shadcn@latest init
  # Add components we need in Phase 1
  npx shadcn@latest add card button input label table badge progress drawer toast
  ```
- **GOTCHA**: shadcn/ui init will ask for a style — choose **Default**. Base colour — choose **Slate**. CSS variables — **yes**.
- **VALIDATE**: `cd frontend && npm run dev` opens Vite default page at `http://localhost:5173`

---

### TASK 15 — CREATE `frontend/src/api.js`

- **IMPLEMENT**: See "Axios instance" pattern above (exact code).
- **VALIDATE**: `grep "Authorization" frontend/src/api.js` returns the interceptor line

---

### TASK 16 — CREATE `frontend/src/hooks/useAuth.js`

- **IMPLEMENT**:
  ```js
  import { useState } from 'react'
  import api from '../api'

  export function useAuth() {
    const [token, setToken] = useState(() => localStorage.getItem('token'))

    async function login(username, password) {
      const form = new URLSearchParams()
      form.append('username', username)
      form.append('password', password)
      const { data } = await api.post('/api/auth/login', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      })
      localStorage.setItem('token', data.access_token)
      setToken(data.access_token)
    }

    function logout() {
      localStorage.removeItem('token')
      setToken(null)
    }

    return { token, login, logout, isAuthenticated: !!token }
  }
  ```
- **GOTCHA**: FastAPI's `OAuth2PasswordRequestForm` expects `application/x-www-form-urlencoded`, NOT JSON.
- **VALIDATE**: `grep "x-www-form-urlencoded" frontend/src/hooks/useAuth.js`

---

### TASK 17 — CREATE `frontend/src/hooks/useGPU.js`

- **IMPLEMENT**: See "useGPU hook pattern" above (exact code).
- **VALIDATE**: `grep "auto-reconnect" frontend/src/hooks/useGPU.js`

---

### TASK 18 — CREATE `frontend/src/components/ProtectedRoute.jsx`

- **IMPLEMENT**:
  ```jsx
  import { Navigate } from 'react-router-dom'
  import { useAuth } from '../hooks/useAuth'

  export function ProtectedRoute({ children }) {
    const { isAuthenticated } = useAuth()
    return isAuthenticated ? children : <Navigate to="/login" replace />
  }
  ```

---

### TASK 19 — CREATE `frontend/src/pages/Login.jsx`

- **IMPLEMENT**: Login form (username + password inputs), calls `useAuth().login()`, redirects to `/` on success, shows toast on error.
  Use `shadcn/ui` Card, Input, Button, Label components.
- **VALIDATE**: Navigate to `http://localhost:5173/login`, log in with `admin` / `admin`, confirm redirect to dashboard.

---

### TASK 20 — CREATE `frontend/src/components/GPUCard.jsx`

- **IMPLEMENT**: Displays a single GPU's metrics:
  - Card header: GPU name + index badge
  - VRAM bar: `shadcn/ui Progress` — `vram_used_mb / vram_total_mb * 100`
  - Stats row: Utilisation % + Temperature °C
  - Recharts `AreaChart` sparkline for last 60s utilisation history (component keeps its own rolling buffer via `useState`)
- **VALIDATE**: Component renders without errors in isolation

---

### TASK 21 — CREATE `frontend/src/pages/Dashboard.jsx`

- **IMPLEMENT**:
  ```jsx
  import { useGPU } from '../hooks/useGPU'
  import { GPUCard } from '../components/GPUCard'

  export default function Dashboard() {
    const gpus = useGPU()
    return (
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-6">
        {gpus.length === 0
          ? <p className="text-muted-foreground">Connecting to GPU telemetry…</p>
          : gpus.map(gpu => <GPUCard key={gpu.id} gpu={gpu} />)
        }
      </div>
    )
  }
  ```
- **VALIDATE**: With backend running, dashboard shows 3 GPU cards with live updating values.

---

### TASK 22 — CREATE `frontend/src/pages/Models.jsx`

- **IMPLEMENT**:
  - On mount: `GET /api/models` → render table with columns: Name | Size | Quantisation | Actions
  - Pull drawer: text input for model name, `POST /api/models/pull` → parse SSE progress events → show `Progress` bar
  - Delete: `DELETE /api/models/{name}` with confirmation, toast on result
- **VALIDATE**: Can list models, pull `tinyllama` successfully, see progress bar update, delete the model.

---

### TASK 23 — CREATE `frontend/src/pages/AccessControl.jsx`

- **IMPLEMENT**:
  - `GET /api/access/rules` → table: CIDR | Action | Label | Priority | Delete button
  - Add rule form: CIDR input, action select (allow/deny), label input → `POST /api/access/rules`
  - Delete: `DELETE /api/access/rules/{id}` with toast confirmation
- **VALIDATE**: Add CIDR `10.0.0.0/8`, confirm it appears in table, delete it.

---

### TASK 24 — CREATE `frontend/src/components/Sidebar.jsx`

- **IMPLEMENT**: Vertical nav with links to Dashboard, Models, Access Control. Shows username from JWT payload. Logout button calls `useAuth().logout()` and redirects to `/login`.
- **VALIDATE**: Clicking each nav item routes correctly. Logout clears token.

---

### TASK 25 — CREATE `frontend/src/App.jsx`

- **IMPLEMENT**:
  ```jsx
  import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
  import { Toaster } from 'sonner'
  import Login from './pages/Login'
  import Dashboard from './pages/Dashboard'
  import Models from './pages/Models'
  import AccessControl from './pages/AccessControl'
  import { ProtectedRoute } from './components/ProtectedRoute'
  import Sidebar from './components/Sidebar'

  export default function App() {
    return (
      <BrowserRouter>
        <Toaster richColors position="top-right" />
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/*" element={
            <ProtectedRoute>
              <div className="flex h-screen">
                <Sidebar />
                <main className="flex-1 overflow-auto bg-background">
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/models" element={<Models />} />
                    <Route path="/access" element={<AccessControl />} />
                    <Route path="*" element={<Navigate to="/" />} />
                  </Routes>
                </main>
              </div>
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    )
  }
  ```
- **VALIDATE**: Full navigation works, protected routes redirect to `/login` when no token.

---

### TASK 26 — BUILD frontend for production

- **IMPLEMENT**:
  ```bash
  cd /home/nms_admin/ollama_mgmt/frontend
  npm run build
  # Output: frontend/dist/
  ```
- **VALIDATE**: `ls frontend/dist/` shows `index.html` and `assets/`

---

### TASK 27 — CREATE `nginx/ollama-mgmt.conf`

- **IMPLEMENT**:
  ```nginx
  server {
      listen 80;
      server_name _;            # Replace with your hostname or IP

      # Serve React SPA
      root /home/nms_admin/ollama_mgmt/frontend/dist;
      index index.html;

      # API + WebSocket → FastAPI backend
      location ~ ^/(api|ollama|ws)/ {
          proxy_pass         http://127.0.0.1:8000;
          proxy_http_version 1.1;
          proxy_set_header   Upgrade $http_upgrade;
          proxy_set_header   Connection "upgrade";
          proxy_set_header   Host $host;
          proxy_set_header   X-Real-IP $remote_addr;
          proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
          proxy_read_timeout 3600s;    # Long timeout for SSE model pulls
          proxy_buffering    off;       # Required for SSE/streaming
      }

      # SPA fallback — all other paths go to index.html
      location / {
          try_files $uri $uri/ /index.html;
      }
  }
  ```
- **GOTCHA**: `proxy_buffering off` is **required** for both SSE model pulls and WebSocket GPU telemetry. Without it, nginx will buffer the stream and the UI will freeze.
- **VALIDATE**: `sudo nginx -t` reports `syntax is ok`

---

### TASK 28 — INSTALL nginx config and enable site

- **IMPLEMENT**:
  ```bash
  sudo cp /home/nms_admin/ollama_mgmt/nginx/ollama-mgmt.conf /etc/nginx/sites-available/ollama-mgmt
  sudo ln -sf /etc/nginx/sites-available/ollama-mgmt /etc/nginx/sites-enabled/ollama-mgmt
  # Optionally disable default site
  sudo rm -f /etc/nginx/sites-enabled/default
  sudo systemctl reload nginx
  ```
- **VALIDATE**: `curl http://localhost/` returns `<!DOCTYPE html>` (React app)

---

### TASK 29 — CREATE `systemd/ollama-mgmt.service`

- **IMPLEMENT**:
  ```ini
  [Unit]
  Description=Ollama Management Server (FastAPI)
  After=network.target ollama.service

  [Service]
  Type=simple
  User=nms_admin
  WorkingDirectory=/home/nms_admin/ollama_mgmt
  EnvironmentFile=/home/nms_admin/ollama_mgmt/.env
  ExecStart=/home/nms_admin/ollama_mgmt/backend/.venv/bin/uvicorn backend.main:app --host 0.0.0.0 --port 8000 --workers 1
  Restart=always
  RestartSec=5
  StandardOutput=journal
  StandardError=journal

  [Install]
  WantedBy=multi-user.target
  ```
- **GOTCHA**: Use `--workers 1` for Phase 1. The in-memory `_clients` list in `gpu.py` is not shared across workers. Multi-worker support requires a message broker (Phase 2+).
- **VALIDATE**: `sudo systemd-analyze verify /home/nms_admin/ollama_mgmt/systemd/ollama-mgmt.service` shows no errors

---

### TASK 30 — INSTALL and enable systemd service

- **IMPLEMENT**:
  ```bash
  sudo cp /home/nms_admin/ollama_mgmt/systemd/ollama-mgmt.service /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable ollama-mgmt
  sudo systemctl start ollama-mgmt
  ```
- **VALIDATE**:
  ```bash
  sudo systemctl status ollama-mgmt    # → active (running)
  journalctl -u ollama-mgmt -n 20      # → no ERROR lines
  curl http://localhost:8000/api/gpu/stats   # → JSON with GPU data
  ```

---

### TASK 31 — CREATE `scripts/setup.sh`

- **IMPLEMENT**: A one-shot setup script that runs Tasks 3, 14, 26, 28, 30 in sequence:
  ```bash
  #!/usr/bin/env bash
  set -e
  ROOT="$(cd "$(dirname "$0")/.." && pwd)"
  echo "[1/6] Creating Python venv..."
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -q --upgrade pip
  "$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
  echo "[2/6] Building frontend..."
  cd "$ROOT/frontend" && npm install --legacy-peer-deps && npm run build
  echo "[3/6] Installing nginx config..."
  sudo cp "$ROOT/nginx/ollama-mgmt.conf" /etc/nginx/sites-available/ollama-mgmt
  sudo ln -sf /etc/nginx/sites-available/ollama-mgmt /etc/nginx/sites-enabled/ollama-mgmt
  sudo nginx -t && sudo systemctl reload nginx
  echo "[4/6] Installing systemd service..."
  sudo cp "$ROOT/systemd/ollama-mgmt.service" /etc/systemd/system/
  sudo systemctl daemon-reload
  sudo systemctl enable --now ollama-mgmt
  echo "[5/6] Waiting for backend..."
  sleep 3
  curl -sf http://localhost:8000/api/gpu/stats | python3 -m json.tool
  echo "[6/6] Setup complete!"
  echo "  → App:     http://$(hostname -I | awk '{print $1}')/"
  echo "  → API:     http://localhost:8000/docs"
  echo "  → Default: admin / admin  (CHANGE IMMEDIATELY)"
  ```
- **IMPLEMENT**: `chmod +x scripts/setup.sh`
- **VALIDATE**: Run `bash scripts/setup.sh` on a fresh checkout — all steps should succeed

---

### TASK 32 — CREATE pytest test suite

- **IMPLEMENT** `backend/tests/conftest.py`:
  ```python
  import pytest, os, tempfile
  os.environ["DB_PATH"] = ":memory:"
  os.environ["JWT_SECRET"] = "test-secret-key-1234567890abcdef"
  os.environ["OLLAMA_HOST"] = "http://localhost:99999"  # unreachable

  from fastapi.testclient import TestClient
  from backend.main import app
  from backend.db.database import init_db

  @pytest.fixture(scope="session", autouse=True)
  def setup_db():
      init_db()

  @pytest.fixture()
  def client():
      return TestClient(app)

  @pytest.fixture()
  def auth_headers(client):
      resp = client.post("/api/auth/login",
                         data={"username": "admin", "password": "admin"})
      token = resp.json()["access_token"]
      return {"Authorization": f"Bearer {token}"}
  ```

- **IMPLEMENT** `backend/tests/test_auth.py`:
  ```python
  def test_login_success(client):
      resp = client.post("/api/auth/login", data={"username":"admin","password":"admin"})
      assert resp.status_code == 200
      assert "access_token" in resp.json()

  def test_login_wrong_password(client):
      resp = client.post("/api/auth/login", data={"username":"admin","password":"wrong"})
      assert resp.status_code == 401

  def test_protected_requires_auth(client):
      resp = client.get("/api/models")
      assert resp.status_code == 401
  ```

- **IMPLEMENT** `backend/tests/test_gpu.py`:
  ```python
  def test_gpu_snapshot_returns_dict(client, auth_headers):
      resp = client.get("/api/gpu/stats")
      assert resp.status_code == 200
      data = resp.json()
      assert "gpus" in data
      assert "timestamp" in data

  def test_gpu_fallback_when_no_nvml(client):
      # pynvml may not have real GPUs in CI — gpus list can be empty, never crash
      resp = client.get("/api/gpu/stats")
      assert resp.status_code == 200
  ```

- **IMPLEMENT** `backend/tests/test_proxy.py`:
  ```python
  def test_add_delete_ip_rule(client, auth_headers):
      # Add rule
      resp = client.post("/api/access/rules", json={"cidr":"10.0.0.0/8"}, headers=auth_headers)
      assert resp.status_code == 201
      rule_id = resp.json()["id"]
      # List rules — should contain the new one
      resp = client.get("/api/access/rules", headers=auth_headers)
      cidrs = [r["cidr"] for r in resp.json()]
      assert "10.0.0.0/8" in cidrs
      # Delete
      resp = client.delete(f"/api/access/rules/{rule_id}", headers=auth_headers)
      assert resp.status_code == 204

  def test_invalid_cidr_rejected(client, auth_headers):
      resp = client.post("/api/access/rules", json={"cidr":"not-a-cidr"}, headers=auth_headers)
      assert resp.status_code == 422
  ```
- **VALIDATE**: `cd /home/nms_admin/ollama_mgmt && backend/.venv/bin/pytest backend/tests/ -v`

---

## TESTING STRATEGY

### Unit Tests
- Auth: login success/failure, token validation, password hashing
- GPU: stats endpoint returns valid schema, pynvml fallback works
- Proxy: IP allowlist logic, CIDR validation, rule CRUD

### Integration Tests
- Full login → protected API call flow
- Add IP rule → verify enforcement on `/ollama/*` route

### Edge Cases
- Empty IP rules table → all traffic allowed (open by default)
- Model name with `:tag` suffix (e.g., `llama3:8b`) — not truncated in DELETE
- WebSocket client disconnect mid-stream — server doesn't crash
- Very long model pull (60B model) — SSE stream stays alive (nginx `proxy_read_timeout 3600s`)
- pynvml init fails (no GPU) — server starts with empty GPU list, no crash

---

## VALIDATION COMMANDS

### Level 1: Syntax & Style
```bash
# Python
cd /home/nms_admin/ollama_mgmt
backend/.venv/bin/python -m py_compile backend/main.py backend/auth.py backend/gpu.py backend/models.py backend/proxy.py backend/logger.py

# JavaScript  
cd frontend && npm run lint
```

### Level 2: Unit Tests
```bash
cd /home/nms_admin/ollama_mgmt
backend/.venv/bin/pytest backend/tests/ -v --tb=short
```

### Level 3: Integration — backend smoke test
```bash
# Start backend
cd /home/nms_admin/ollama_mgmt
backend/.venv/bin/uvicorn backend.main:app --port 8000 &
sleep 2

# Login
TOKEN=$(curl -s -X POST http://localhost:8000/api/auth/login \
  -d "username=admin&password=admin" | python3 -c "import sys,json; print(json.load(sys.stdin)['access_token'])")

# GPU stats
curl -s http://localhost:8000/api/gpu/stats | python3 -m json.tool

# Models list
curl -s -H "Authorization: Bearer $TOKEN" http://localhost:8000/api/models

# IP rules CRUD
curl -s -X POST http://localhost:8000/api/access/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cidr":"192.168.0.0/16","label":"test"}'
```

### Level 4: Manual Validation
1. Navigate to `http://<host IP>/` — see React login page
2. Login with `admin` / `admin`
3. Dashboard shows 3 GPU cards with live-updating VRAM bars
4. Models page lists installed Ollama models
5. Pull `tinyllama` — progress bar updates in real time
6. Access Control page — add a CIDR rule, delete it
7. Logout — redirects to login, protected routes refuse access

### Level 5: System Validation
```bash
sudo systemctl status ollama-mgmt   # active (running)
sudo systemctl status nginx          # active (running)
journalctl -u ollama-mgmt -n 50     # no ERROR/CRITICAL lines
sqlite3 ./db/ollama.db "SELECT COUNT(*) FROM request_logs;"  # >0 after use
```

---

## ACCEPTANCE CRITERIA

- [ ] `scripts/setup.sh` completes without errors on a fresh checkout
- [ ] FastAPI backend starts under systemd and survives reboot
- [ ] Login page loads at `http://<host>/` (nginx serves the React SPA)
- [ ] Dashboard shows live GPU telemetry for all 3 GPUs (RTX 3080 Ti × 2 + RTX 3070)
- [ ] WebSocket reconnects automatically after disconnect
- [ ] JWT authentication gates all `/api/*` endpoints
- [ ] `/ollama/*` proxy enforces IP allowlist before forwarding to :11434
- [ ] Model pull streams SSE progress — progress bar advances in the UI
- [ ] Model delete works including models with `:tag` in their name
- [ ] IP rule CRUD is fully functional (add, list, delete)
- [ ] All pytest unit tests pass with zero failures
- [ ] `nginx -t` passes, nginx correctly proxies and serves static files
- [ ] No console errors in the browser for normal flows
- [ ] Default admin password documented in UI / README (change immediately note)

---

## COMPLETION CHECKLIST

- [ ] All 32 tasks completed in dependency order
- [ ] Each task's VALIDATE command run and passed
- [ ] Full pytest suite passes: `backend/.venv/bin/pytest backend/tests/ -v`
- [ ] Frontend builds cleanly: `npm run build` with zero errors
- [ ] nginx config passes: `sudo nginx -t`
- [ ] systemd service enabled and running
- [ ] Manual walkthrough of full UI completed (Login → Dashboard → Models → Access Control → Logout)
- [ ] Request logs written to SQLite after a few API calls

---

## NOTES

- **Workers = 1**: Phase 1 uses a single Uvicorn worker because the GPU WebSocket client list is in-memory. Do not add `--workers N` without replacing it with a shared broadcast mechanism (Redis pub/sub or similar).
- **Default credentials**: `admin` / `admin` are seeded on first run. Document this clearly; the setup script already prints a warning. A `/api/auth/change-password` endpoint is a Phase 2 task.
- **CORS**: During development, `http://localhost:5173` is allowed. After building and serving via nginx, the frontend and API are on the same origin, so CORS is irrelevant — but keep the setting for developer convenience.
- **Redis**: Rate limiting (Redis sliding window) is a Phase 2 module. Redis is NOT required for Phase 1.
- **SQLite WAL mode**: Enabled in `database.py` so the read-heavy request logger and WebSocket broadcaster don't block each other.
- **pynvml on this host**: Driver 580.126.09 / CUDA 13.0 confirmed. `pynvml` should initialise without issues. If it fails (e.g., missing `libnvidia-ml.so`), the server falls back to empty GPU list gracefully.
- **Ollama host**: `http://172.16.50.17:11434` — do NOT change the UFW rules on port 11434. All external traffic must come through this management server on port 80 (nginx).

---

**Confidence Score: 8.5 / 10**

The plan is self-contained and execution-ready. The main risk areas are:
1. shadcn/ui init prompts — may require manual interaction (mitigated: use default answers)
2. pynvml binary compatibility — mitigated by graceful fallback in `gpu.py`
3. nginx/systemd permissions — mitigated by explicit `sudo` commands and `sudo systemd-analyze verify`
