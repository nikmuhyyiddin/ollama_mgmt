# Product Blueprint — Ollama Management Server

Current-state product blueprint. Replaces the April `ollama-mgmt-blueprint.docx`,
which predates the LiteLLM gateway and several pages. For the technical view see
[ARCHITECTURE.md](ARCHITECTURE.md).

---

## 1. What it is

A self-hosted operations layer that turns a bare Ollama GPU box into a governed,
multi-user LLM service. It is the single front door: every request authenticates,
is access-controlled, rate-limited, logged, and observable — and operators manage
models, keys, spend, and GPU health from one web portal.

**Mission:** make a workstation-class GPU rig usable as a small-team inference
platform without exposing Ollama directly or hand-rolling ops glue.

---

## 2. Target users

| Persona | Needs |
|---------|-------|
| **Operator / admin** | Deploy + keep Ollama healthy, control who has access, watch VRAM/temps, manage models and spend |
| **Developer (API consumer)** | An OpenAI-compatible endpoint + a scoped API key with a budget |
| **Team member (viewer)** | Try models in a chat UI, see usage analytics — read-only |

---

## 3. Capabilities (built today)

| Area | Capability |
|------|-----------|
| **Monitoring** | Live per-GPU VRAM/util/temp + CPU/RAM/disk over WebSocket; GPU health checks (PCIe, temp, reachability) with email alerts |
| **Access control** | JWT login with roles (admin/viewer), per-IP CIDR allowlist on the Ollama proxy, login brute-force throttle, in-memory rate limiting |
| **Model lifecycle** | List, pull (streaming progress), delete Ollama models; register gateway models incl. cloud providers |
| **Gateway (LiteLLM)** | OpenAI-compatible API, virtual API keys with budgets/expiry, per-key & per-model spend tracking and CSV reports |
| **Observability** | Request logs with filters; analytics (volume, latency, heatmap, top models, token usage) |
| **Playground** | Built-in streaming chat UI with side-by-side 2-model comparison and latency/tokens-per-sec |
| **Admin** | User management, SMTP config + alert history, scheduled log rotation / VRAM snapshots |

---

## 4. Boundaries

**In scope (now):** single-node deployment for a small team (~5 users), the
capabilities above, native systemd + nginx (no containers).

**Out of scope (now):** multi-node / horizontal scale, smart model routing, model
benchmarking, prompt-template management UI, local API-key enforcement (delegated to
LiteLLM), distributed rate limiting, SSO/2FA.

---

## 5. Roadmap

| Tier | Item | Why |
|------|------|-----|
| **Near** | Logs date-range + CSV export + sorting; client-side search/sort on tables; "session expired" toast | High-value, low-effort UX wins |
| **Near** | Collapsible/mobile sidebar; drop unused `@radix-ui` deps | Responsiveness + bundle trim |
| **Mid** | Persisted GPU history + historical charts | Today only a transient sparkline |
| **Mid** | Wire local API-key principals (or remove `api_keys` table) | Close the unused-infrastructure gap |
| **Mid** | WebSocket exponential backoff; correct P95; scheduler enable/disable API | Robustness |
| **Later** | Smart router (`router.py`), model benchmarking | Phase-3 intelligence |
| **Later** | Prompt-template UI, alert escalation (Slack/webhook), dark/light theme toggle | Team & polish |
| **Later** | Multi-node fan-out, backup automation | Phase-4 scale |

---

## 6. Success criteria

- Ollama is never reachable except through this layer (UFW + IP allowlist).
- An admin can provision a budgeted API key and a developer can call the
  OpenAI-compatible endpoint within minutes.
- GPU saturation or overheating produces an alert before it degrades service.
- Every request is attributable (IP, model, latency, status) in the logs.
