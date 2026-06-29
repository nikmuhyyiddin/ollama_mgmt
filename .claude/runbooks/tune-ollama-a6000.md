# Ollama tuning runbook — single RTX A6000 box

> **How to use this file:** Paste everything below the `---` divider (starting at "You are operating…") into a fresh Claude session running on the A6000 server. The agent will follow the steps, ask before destructive actions, and report acceptance-criteria results.

---

You are operating on an Ollama proxy server. Tune it so first-byte latency is fast and concurrent requests don't serialise.

## Hardware
- 1× NVIDIA RTX A6000 (48 GB VRAM, Ampere, compute capability 8.6)
- Verify with `nvidia-smi`.

## Symptoms / why you're here
- A simple "OK" reply takes many seconds despite GPU being mostly idle
- Concurrent requests queue behind each other
- Models reload between requests (default 5-min keep-alive is too short)
- Hardware is not the bottleneck — runtime config is

## What to do (in this order)

### 1. Inspect current Ollama config
- `which ollama` and `ps -ef | grep ollama` to confirm install
- `systemctl cat ollama` — note any existing `Environment=` lines so you preserve deliberate settings (e.g. `OLLAMA_HOST=127.0.0.1`, `OLLAMA_MODELS=/some/path`). Do NOT clobber them.
- `curl -s http://localhost:11434/api/ps | jq .` — list of currently loaded models
- `curl -s http://localhost:11434/api/tags | jq '.models[].name'` — list of installed models

### 2. Apply tuning env vars via systemd drop-in
**Preserve any existing deliberate `Environment=` lines** (model path, host binding, etc.) — merge, don't replace. Final override should look like this (adjust the preserved lines to match what you found):

```ini
[Service]
# --- preserve any existing values you found in step 1 ---
Environment="OLLAMA_HOST=127.0.0.1"               # if it was set; security-critical
Environment="OLLAMA_MODELS=/path/from/existing"   # only if it was set
# --- new tuning ---
Environment="OLLAMA_KEEP_ALIVE=24h"
Environment="OLLAMA_NUM_PARALLEL=4"
Environment="OLLAMA_MAX_LOADED_MODELS=4"
Environment="OLLAMA_MAX_QUEUE=512"
Environment="OLLAMA_FLASH_ATTENTION=1"
Environment="OLLAMA_KV_CACHE_TYPE=q8_0"
```

**Do NOT set `OLLAMA_SCHED_SPREAD`** — this is a single-GPU box, spreading is meaningless and can confuse the scheduler.

What each does:
- `OLLAMA_KEEP_ALIVE=24h` — pins models in VRAM so they don't unload between requests. Biggest single win; eliminates the 5–60s cold-load penalty.
- `OLLAMA_NUM_PARALLEL=4` — 4 concurrent inference contexts per loaded model. Each slot multiplies KV cache size, so be ready to drop to 2 if step 4 reveals CPU spillover (see below).
- `OLLAMA_FLASH_ATTENTION=1` — required for q8_0 KV cache to actually engage; ~15–25% throughput gain on Ampere.
- `OLLAMA_KV_CACHE_TYPE=q8_0` — halves KV cache memory footprint. Crucial when running multiple slots on large-context models.
- `OLLAMA_MAX_LOADED_MODELS=4` — keep up to 4 models hot simultaneously (48 GB easily fits 4× 7B class).

Apply:
```bash
sudo cp /etc/systemd/system/ollama.service.d/override.conf \
        /etc/systemd/system/ollama.service.d/override.conf.bak.$(date +%Y%m%d-%H%M%S) 2>/dev/null
sudo systemctl edit ollama        # or write the override file directly
sudo systemctl daemon-reload
sudo systemctl restart ollama
```

Verify env vars are actually live on the running process (don't trust `systemctl show` alone — check the process):
```bash
sudo cat /proc/$(pgrep -f 'ollama serve')/environ | tr '\0' '\n' | grep OLLAMA_
```

### 3. Pre-load the models that get hammered
After restart, warm them so first user requests don't pay the cold-load tax. Replace these with the actual models in use on this box (from `/api/tags`):
```bash
curl -s http://localhost:11434/api/generate  -d '{"model": "qwen2.5:7b",  "prompt": "ok", "keep_alive": "24h", "stream": false}' >/dev/null
curl -s http://localhost:11434/api/generate  -d '{"model": "llama3.2:3b", "prompt": "ok", "keep_alive": "24h", "stream": false}' >/dev/null
curl -s http://localhost:11434/api/embeddings -d '{"model": "<embed-model>", "prompt": "ok", "keep_alive": "24h"}' >/dev/null
```

Then `curl -s http://localhost:11434/api/ps` should list all of them with `expires_at` ~24h out.

### 4. Verify — and **CHECK FOR CPU SPILLOVER** (most important step)
This step caught a real issue in a prior tuning. Don't skip it.

```bash
# Critical check: every loaded model should be 100% GPU
ollama ps
```
If any model shows e.g. `12%/88% CPU/GPU` or anything other than `100% GPU`, the KV cache from `NUM_PARALLEL=4` × native context has pushed model weights off-GPU. **Drop `OLLAMA_NUM_PARALLEL` to 2, restart, re-warm, re-check.** Also confirm with the load logs:
```bash
sudo journalctl -u ollama --since '5 minutes ago' | grep -E 'predicted usage exceeds VRAM|offloaded.*to GPU'
```
A healthy 7B load shows `offloaded N/N layers to GPU` with N matching the model's full layer count. A bad load shows `offloaded M/N layers to GPU` with M < N.

Then run benchmarks:
```bash
# Tiny prompt — target < 1s on warm slot
time curl -s http://localhost:11434/api/generate \
  -d '{"model":"qwen2.5:7b","prompt":"Reply with just OK","stream":false}' \
  | jq -r '.response, ((.eval_count // 0) * 1e9 / (.eval_duration // 1) | "tok/s=\(.|floor)")'

# Concurrency — 4 parallel requests should ALL finish in roughly the same wall-clock
time bash -c 'for i in 1 2 3 4; do
  curl -s http://localhost:11434/api/generate \
    -d "{\"model\":\"qwen2.5:7b\",\"prompt\":\"Count to $i\",\"stream\":false}" >/dev/null &
done; wait'

# Realistic 400-token completion — target < 15s on A6000
time curl -s http://localhost:11434/api/generate \
  -d '{"model":"qwen2.5:7b","prompt":"Provide 4 bullet remediation steps for CVE-2021-44228","options":{"num_predict":400},"stream":false}' \
  | jq -r '((.eval_count // 0) * 1e9 / (.eval_duration // 1) | "tok/s=\(.|floor)")'
```

## Acceptance criteria (on A6000)
- Tiny prompt: < 1s on warm slot
- Eval rate on a 7B Q4 model: **100–150 tok/s** (anything below ~50 tok/s means CPU spillover — go fix it)
- 4 concurrent: all complete in ~similar wall-clock, NOT serialised
- 400-token completion: < 15s
- `ollama ps` shows **100% GPU** for every loaded model
- `nvidia-smi` shows VRAM usage rising and falling with load (idle should be ≪ 48 GB)

## Notes specific to this hardware
- 48 GB VRAM is generous — you can comfortably run a 30B Q4 model alongside one or two 7B models. For 70B Q4 (~38 GB weights), drop `NUM_PARALLEL` to 2 or even 1; the KV cache on 70B is large.
- If you ever load a model whose native context is >32k (e.g. some llama3.x at 128k), and you set `NUM_PARALLEL=4`, KV cache alone can hit ~20+ GB. Either lower `num_ctx` per request or lower `NUM_PARALLEL`.
- Don't set `OLLAMA_SCHED_SPREAD`; it has no meaning on a single GPU.

## Don't do these things
- Don't blindly overwrite the existing systemd override — preserve `OLLAMA_HOST`, `OLLAMA_MODELS`, and any other deliberate values
- Don't skip step 4 (`ollama ps` for GPU/CPU split). That check catches the most common silent regression.
- Don't `sudo systemctl restart ollama` without warning the user — it kills any in-flight inference requests

## Rollback
If anything goes sideways:
```bash
# List backups created during step 2
ls -la /etc/systemd/system/ollama.service.d/override.conf.bak.*

# Restore the most recent one
sudo cp /etc/systemd/system/ollama.service.d/override.conf.bak.<timestamp> \
        /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload
sudo systemctl restart ollama
```
