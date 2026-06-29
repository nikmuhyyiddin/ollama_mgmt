# Ollama Manager — User Guide

A short, task-oriented guide to running the management UI. It sits in front of
the Ollama GPU server and adds monitoring, access control, keys, logging, and
analytics.

Access it at **https://ollama_dev.example.com**. Sign in with your username
and password (an admin seeds the first account). Sessions last 24h.

Roles: **admin** can manage everything; **viewer** is read-only (dashboard,
model list, analytics) and can change their own password.

---

## The pages

Use the left sidebar. The active page is highlighted.

### Dashboard
Live GPU telemetry — per-GPU VRAM, utilisation, and temperature, pushed over a
WebSocket every second. CPU / memory / disk panels sit alongside. No refresh
needed; it reconnects automatically if the link drops.

### Models
Installed Ollama models with size and family. The list **auto-refreshes every
15 s**.
- **Pull a model:** click *Pull Model*, enter a name (e.g. `llama3:8b`,
  `qwen2.5:14b`), watch the progress bar. Browse names at ollama.com/library.
- **Delete a model:** trash icon → confirm. Frees its VRAM/disk.
- **Gateway Models:** the lower section lists what API clients can call *through
  the LiteLLM gateway* — local Ollama models plus cloud providers (OpenAI,
  Anthropic, Gemini, OpenRouter, …). *Import from Ollama* registers all host
  models at once; *Add* a cloud model by picking a provider and entering its name
  (a provider key, if needed, is stored encrypted).

### Playground
A built-in chat UI for trying models without writing any code.
- Pick a model from the dropdown, type a message, press **Enter** to send
  (Shift+Enter for a newline). Responses stream in live.
- Each reply shows its **latency and tokens/sec**.
- **Compare** (top right) splits the view into two panes with independent model
  pickers — one prompt is sent to both so you can judge quality and speed side by
  side. **Stop** cancels an in-flight response; **Clear** resets the conversation.
- Playground chats talk to Ollama directly (they are *not* billed against gateway
  API-key budgets).

### Access Control
IP allowlist enforced on every proxied Ollama request.
- **No rules = all IPs allowed.** A yellow banner warns when the list is empty.
- **Add a rule:** enter a CIDR (`10.0.0.0/24`), pick Allow/Deny, optional
  label, *Add Rule*.
- **Delete a rule:** trash icon → confirm. *Deleting an allow-rule changes who
  can reach Ollama* — the confirm dialog says so.

### API Keys
Keys for programmatic / OpenAI-compatible access. List auto-refreshes every 15 s.
- **Generate:** *Generate API Key* → set a label, allowed models (`*` = all),
  optional rate limit (req/min) and expiry → *Generate*.
- **The key is shown once.** Copy it immediately; only its hash is stored.
- **Scope:** keys are restricted to their allowed models and rate limit.
- **Revoke:** trash icon → confirm.

### Analytics
Usage over a selectable window (1 / 7 / 14 / 30 days):
- **Total Requests**, **Total Tokens** (with prompt-in / completion-out split),
  **Avg / P95 Latency**, **Unique IPs**.
- **Request Volume** over time, **Avg Latency by Model**, an hour×day heatmap,
  and a **Top Models** table showing requests and tokens per model.
- Empty window shows a clear "no data yet" message rather than blank charts.

> Token stats populate from traffic through the OpenAI-compatible API
> (`/v1/...`). See *Using the API* below.

### Logs
Every proxied request: time, IP, model, tokens, latency, status.
- **Filter** by IP, model, or status class; *Search* to apply, *Clear* to reset.
- **Refresh** with the circular-arrow button (top right).
- Paginated, newest first.

### Users (admin only)
- **Create:** *New User* → username, password (min 8 chars), role.
- **Delete:** trash icon → confirm. You cannot delete yourself.

### Settings
- **SMTP / alerting:** configure email for GPU health alerts; *Send Test Email*
  to verify. The saved password shows as "(saved)" and isn't echoed back.
- **Alert history:** recent GPU alerts; resolve with the check icon.

### Change password
Bottom of the sidebar → *Change Password*. Needs current password; new password
min 8 characters.

---

## Common tasks

**Give a teammate API access**
1. API Keys → *Generate API Key*, scope it (models, rate limit, expiry).
2. Copy the key (shown once) and send it over a secure channel.
3. If they hit Ollama directly, add their IP under Access Control.

**Free up VRAM**
Models → delete an unused model, or lower model residency (see keep_alive below).

**See who is using the most tokens**
Analytics → pick a window → Total Tokens card + the Top Models table.

---

## Using the API

OpenAI-compatible, so existing OpenAI SDKs/tools work — just point them at this
server and use an API key as the bearer token.

```bash
curl https://ollama_dev.example.com/v1/chat/completions \
  -H "Authorization: Bearer omk_your_key_here" \
  -H "Content-Type: application/json" \
  -d '{"model":"llama3:8b","messages":[{"role":"user","content":"Hello"}]}'
```

Endpoints: `/v1/models`, `/v1/chat/completions`, `/v1/completions`,
`/v1/embeddings`. Streaming (`"stream": true`) is supported. Token usage from
these calls is what feeds the Analytics and Logs token columns.

---

## Performance tuning (admin / operator)

**Keep hot models in VRAM** — by default Ollama unloads an idle model after
5 minutes, so the next request pays a cold reload. Set `OLLAMA_KEEP_ALIVE` in
the server's `.env` (e.g. `10m`, `1h`, `-1` for never) to keep frequently-hit
models resident. Trade-off: longer residency uses more VRAM — watch the
Dashboard and back off if you starve other models. Restart the backend after
changing `.env`:

```bash
sudo systemctl restart ollama-mgmt
```

---

## Troubleshooting

| Symptom | Check |
|---------|-------|
| Sent back to login | Session expired (24h) — sign in again. |
| "Admin access required" | Action needs an admin account. |
| Model pull stuck | Verify the exact name on ollama.com/library; check Dashboard VRAM. |
| API 401 | Key revoked/expired, or wrong `Authorization` header. |
| API 403 on a model | Key isn't scoped to that model (API Keys → allowed models). |
| Charts empty | No traffic in the selected window, or use a longer window. |
| A page errors out | Click *Try again*; if it persists, reload the browser. |
