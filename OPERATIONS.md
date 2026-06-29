# Operations Runbook — Ollama Management Server

Admin/operator guide for deploying, running, and recovering the management server.
For day-to-day UI usage see [USER_GUIDE.md](USER_GUIDE.md); for architecture see
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. Stack at a glance

| Process | Port | Managed by | Notes |
|---------|------|-----------|-------|
| FastAPI backend (`ollama-mgmt`) | 8000 (localhost) | systemd | Serves API + built React SPA from `frontend/dist` |
| Nginx | 443 / 80 | systemd | TLS termination, proxies to `:8000` |
| LiteLLM gateway | 4000 (localhost) | systemd (`litellm`) | OpenAI-compatible API, keys, spend |
| LiteLLM Postgres | 5432 | systemd / external | Stores gateway keys + spend logs |
| Ollama | 11434 | systemd (`ollama.service`) | The actual inference engine, on the GPU host (`OLLAMA_HOST`) |

The backend depends on **Ollama** (telemetry, proxy, chat) and **LiteLLM + Postgres**
(gateway pages). The core pages (Dashboard, Models, Logs, Users) work even if LiteLLM
is down; gateway pages will 502.

---

## 2. First install

```bash
bash scripts/setup.sh
```

This creates the Python venv, builds the frontend, generates `.env` (with a random
`JWT_SECRET`), installs the nginx config + systemd unit, and starts the service.

**Admin password:** set `ADMIN_PASSWORD` in `.env` *before* first start. If you don't,
a random password is generated on first run and written to the logs:

```bash
journalctl -u ollama-mgmt | grep 'generated password'
```

Log in, then change it from the sidebar → *Change Password*.

---

## 3. Configuration (`.env`)

Copy `.env.example` → `.env`. Key variables:

| Variable | Purpose |
|----------|---------|
| `OLLAMA_HOST` | URL of the Ollama engine (e.g. `http://10.0.0.10:11434`) |
| `OLLAMA_KEEP_ALIVE` | Model VRAM residency (`""`=5m default, `1h`, `-1`=forever) |
| `JWT_SECRET` | Session signing key — `openssl rand -hex 32` |
| `JWT_EXPIRE_MINUTES` | Session lifetime (default 1440 = 24h) |
| `ADMIN_PASSWORD` | Seed password for the first admin (empty → random, logged) |
| `LITELLM_MASTER_KEY` | LiteLLM admin key (never exposed to the browser) |
| `LITELLM_DB_URL` | Read-only Postgres conn for spend reports |
| `CORS_ORIGINS` | Comma-separated allowed origins |
| SMTP_* / `ALERT_TO_EMAIL` | GPU alert email (can also be set in the Settings UI) |

Restart after any change: `sudo systemctl restart ollama-mgmt`.

---

## 4. Service management

```bash
sudo systemctl {start|stop|restart|status} ollama-mgmt
journalctl -u ollama-mgmt -f          # follow backend logs
sudo systemctl reload nginx           # after editing nginx/ollama-mgmt.conf
sudo systemctl status litellm         # gateway engine
```

Redeploy after pulling new code:

```bash
cd frontend && npm install --legacy-peer-deps && npm run build && cd ..
sudo systemctl restart ollama-mgmt
```

(`scripts/deploy_remote.sh` automates copying + restart for the remote host.)

---

## 5. TLS / nginx

- Site config: `nginx/ollama-mgmt.conf` → `/etc/nginx/sites-available/ollama-mgmt`.
- Wildcard cert material lives in `wildcard.malakoff.com.my_2026/`. Install the
  `_fullchain.crt` + `.key` where the nginx config points.
- Self-signed CA for clients is downloadable at `https://<host>/ssl-cert`.
- Validate before reload: `sudo nginx -t && sudo systemctl reload nginx`.

---

## 6. Database & backup

SQLite at `DB_PATH` (default `backend/db/ollama.db`), in **WAL mode**. Back it up
without stopping the service using the SQLite backup API (WAL-safe):

```bash
sqlite3 backend/db/ollama.db ".backup '/var/backups/ollama-$(date +%F).db'"
```

Restore: stop the service, replace the file (and remove stale `-wal`/`-shm`), start.

> Gateway keys and spend live in **LiteLLM's Postgres**, not this SQLite — back that
> up separately (`pg_dump`).

Schema is applied automatically on startup (`init_db()` runs `db/schema.sql`). There
is no migration framework yet; schema changes are additive `CREATE TABLE IF NOT EXISTS`.

---

## 7. Scheduled jobs (APScheduler, in-process)

| Job | Schedule | Action |
|-----|----------|--------|
| `rotate_logs` | daily 03:00 UTC | delete `request_logs` older than 90 days |
| `vram_snapshot` | every 5 min | log GPU VRAM summary |
| `gpu_health_check` | every 2 min | PCIe / temp / Ollama-reachability checks → alerts |

Jobs are hardcoded in `backend/scheduler.py` (no enable/disable API yet). GPU alerts
email via SMTP with a 10-minute per-type cooldown; history is on the Settings page.

---

## 8. Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| Backend won't start | `journalctl -u ollama-mgmt -n 50`; check `.env` syntax and venv path in the unit file |
| Dashboard spinner forever | Ollama unreachable — verify `OLLAMA_HOST`, `curl $OLLAMA_HOST/api/tags` |
| WebSocket keeps reconnecting | nginx must allow `Upgrade`/`Connection` headers on `/ws/` |
| Gateway pages 502 | LiteLLM down — `systemctl status litellm`; spend reports also need Postgres |
| Can't log in / lost password | set `ADMIN_PASSWORD` in `.env`, or delete the admin row and restart to re-seed |
| Locked out after bad logins | login throttle: 5 fails / 5 min per IP — wait it out (`Retry-After`) |
| Alert emails not sending | Settings → SMTP → *Send Test Email*; check `smtp_use_tls`/port |
| 429 on API calls | rate limiter (60 req/min per IP, in-memory) — back off or raise `DEFAULT_RATE_LIMIT` |

---

## 9. Security checklist

- [ ] `ADMIN_PASSWORD` set (or random one rotated after first login)
- [ ] `JWT_SECRET` is a real random value, not the dev default
- [ ] Ollama port 11434 is **not** publicly exposed (UFW; reachable only via this app)
- [ ] IP allowlist configured under Access Control (empty = open to all)
- [ ] TLS cert valid; HTTP redirects to HTTPS
- [ ] `LITELLM_MASTER_KEY` kept server-side only
