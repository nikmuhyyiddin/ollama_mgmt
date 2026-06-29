"""
GPU Health Monitor — watches for PCIe degradation, thermal issues,
Ollama hangs, and sends email alerts. Stores alerts in the database.
"""
import logging
import smtplib
import subprocess
import time
from email.mime.text import MIMEText

import httpx

from backend.config import get_settings
from backend.db.database import get_db

logger = logging.getLogger("ollama-mgmt.gpu-monitor")

# ── Thresholds ────────────────────────────────────────────────────────────────
TEMP_WARN_C = 85
TEMP_CRIT_C = 92
PCIE_REPLAY_THRESHOLD = 100       # replays since last check
PCIE_MIN_LINK_WIDTH = 4           # anything below x4 is degraded
OLLAMA_TIMEOUT_S = 30             # max seconds for a health ping

# ── Cooldown: don't spam the same alert within this window ────────────────────
_COOLDOWN_S = 600  # 10 minutes
_last_alert: dict[str, float] = {}


def _should_alert(key: str) -> bool:
    now = time.time()
    if now - _last_alert.get(key, 0) < _COOLDOWN_S:
        return False
    _last_alert[key] = now
    return True


def _get_smtp_config() -> dict:
    """Load SMTP config from DB settings table, falling back to .env."""
    smtp_keys = [
        "smtp_server", "smtp_port", "smtp_user", "smtp_password",
        "smtp_from", "smtp_use_tls", "alert_to_email",
    ]
    try:
        with get_db() as db:
            rows = db.execute(
                "SELECT key, value FROM settings WHERE key IN ({})".format(
                    ",".join("?" for _ in smtp_keys)
                ),
                smtp_keys,
            ).fetchall()
        if rows:
            return {row["key"]: row["value"] for row in rows}
    except Exception:
        pass
    # Fallback to .env config
    cfg = get_settings()
    return {
        "smtp_server": cfg.smtp_server,
        "smtp_port": str(cfg.smtp_port),
        "smtp_user": cfg.smtp_user,
        "smtp_password": cfg.smtp_password,
        "smtp_from": cfg.smtp_from,
        "smtp_use_tls": str(cfg.smtp_use_tls).lower(),
        "alert_to_email": cfg.alert_to_email,
    }


def _save_alert(severity: str, gpu_id: int | None, alert_type: str, message: str):
    """Persist alert to the gpu_alerts table."""
    try:
        with get_db() as db:
            db.execute(
                "INSERT INTO gpu_alerts (severity, gpu_id, alert_type, message) VALUES (?, ?, ?, ?)",
                (severity, gpu_id, alert_type, message),
            )
    except Exception as e:
        logger.error("Failed to save alert to DB: %s", e)


def _send_email(subject: str, body: str):
    cfg = _get_smtp_config()
    if not cfg.get("smtp_server") or not cfg.get("alert_to_email"):
        logger.warning("SMTP not configured — alert logged only: %s", subject)
        return

    msg = MIMEText(body)
    msg["Subject"] = f"[Ollama GPU Alert] {subject}"
    msg["From"] = cfg.get("smtp_from") or cfg.get("smtp_user", "")
    msg["To"] = cfg["alert_to_email"]

    try:
        use_tls = cfg.get("smtp_use_tls", "false") in ("true", "True", "1")
        port = int(cfg.get("smtp_port", 25))
        if use_tls:
            server = smtplib.SMTP_SSL(cfg["smtp_server"], port, timeout=10)
        else:
            server = smtplib.SMTP(cfg["smtp_server"], port, timeout=10)

        if cfg.get("smtp_user") and cfg.get("smtp_password"):
            server.login(cfg["smtp_user"], cfg["smtp_password"])
        server.sendmail(msg["From"], [cfg["alert_to_email"]], msg.as_string())
        server.quit()
        logger.info("Alert email sent: %s", subject)
    except Exception as e:
        logger.error("Failed to send alert email: %s", e)


def _parse_nvidia_smi_pcie() -> list[dict]:
    """Query nvidia-smi for PCIe link info and replay counts."""
    try:
        result = subprocess.run(
            [
                "nvidia-smi",
                "--query-gpu=index,name,pci.bus_id,pcie.link.width.current,pcie.link.gen.current",
                "--format=csv,noheader,nounits",
            ],
            capture_output=True, text=True, timeout=10,
        )
        gpus = []
        for line in result.stdout.strip().splitlines():
            parts = [p.strip() for p in line.split(",")]
            if len(parts) >= 5:
                gpus.append({
                    "index": int(parts[0]),
                    "name": parts[1],
                    "bus_id": parts[2],
                    "link_width": int(parts[3]) if parts[3].isdigit() else 0,
                    "link_gen": int(parts[4]) if parts[4].isdigit() else 0,
                })
        return gpus
    except Exception as e:
        logger.error("nvidia-smi PCIe query failed: %s", e)
        return []


def _get_pcie_replays() -> dict[int, int]:
    """Parse nvidia-smi -q for replay counts per GPU."""
    try:
        result = subprocess.run(
            ["nvidia-smi", "-q"], capture_output=True, text=True, timeout=10,
        )
        replays = {}
        gpu_idx = -1
        for line in result.stdout.splitlines():
            if line.strip().startswith("GPU 0000"):
                gpu_idx += 1
            if "Replays Since Reset" in line:
                val = line.split(":")[-1].strip()
                if val.isdigit():
                    replays[gpu_idx] = int(val)
        return replays
    except Exception:
        return {}


# ── Stored state for delta tracking ──────────────────────────────────────────
_prev_replays: dict[int, int] = {}


def check_gpu_health():
    """Run all GPU health checks. Called by the scheduler every 2 minutes."""
    alerts = []

    # 1. PCIe link width & generation
    gpus = _parse_nvidia_smi_pcie()
    for gpu in gpus:
        if gpu["link_width"] < PCIE_MIN_LINK_WIDTH:
            key = f"pcie_width_gpu{gpu['index']}"
            msg = (
                f"GPU {gpu['index']} ({gpu['name']}) PCIe link degraded: "
                f"x{gpu['link_width']} (expected x16), Gen {gpu['link_gen']}"
            )
            logger.warning(msg)
            if _should_alert(key):
                _save_alert("warning", gpu["index"], "pcie_degraded", msg)
                alerts.append(msg)

    # 2. PCIe replay errors (delta since last check)
    global _prev_replays
    replays = _get_pcie_replays()
    for idx, count in replays.items():
        prev = _prev_replays.get(idx, count)
        delta = count - prev
        if delta > PCIE_REPLAY_THRESHOLD:
            key = f"pcie_replay_gpu{idx}"
            msg = (
                f"GPU {idx} PCIe replay errors spiking: "
                f"{delta} new replays (total: {count})"
            )
            logger.warning(msg)
            if _should_alert(key):
                _save_alert("warning", idx, "pcie_replays", msg)
                alerts.append(msg)
    _prev_replays = replays.copy()

    # 3. Temperature
    try:
        from backend.gpu import read_gpu_stats
        stats = read_gpu_stats()
        for g in stats.get("gpus", []):
            temp = g["temperature_c"]
            if temp >= TEMP_CRIT_C:
                key = f"temp_crit_gpu{g['id']}"
                msg = f"GPU {g['id']} ({g['name']}) CRITICAL temperature: {temp}°C (threshold: {TEMP_CRIT_C}°C)"
                logger.critical(msg)
                if _should_alert(key):
                    _save_alert("critical", g["id"], "temperature", msg)
                    alerts.append(msg)
            elif temp >= TEMP_WARN_C:
                key = f"temp_warn_gpu{g['id']}"
                msg = f"GPU {g['id']} ({g['name']}) high temperature: {temp}°C (threshold: {TEMP_WARN_C}°C)"
                logger.warning(msg)
                if _should_alert(key):
                    _save_alert("warning", g["id"], "temperature", msg)
                    alerts.append(msg)
    except Exception as e:
        logger.error("Temperature check failed: %s", e)

    # 4. Ollama responsiveness
    # ponytail: sync httpx.get on purpose — off the request hot path, runs in the
    # scheduler's health check. Not worth converting to the shared async client.
    try:
        cfg = get_settings()
        r = httpx.get(f"{cfg.ollama_host}/api/tags", timeout=OLLAMA_TIMEOUT_S)
        if r.status_code != 200:
            key = "ollama_unhealthy"
            msg = f"Ollama health check returned HTTP {r.status_code}"
            logger.warning(msg)
            if _should_alert(key):
                _save_alert("warning", None, "ollama_health", msg)
                alerts.append(msg)
    except httpx.TimeoutException:
        key = "ollama_timeout"
        msg = f"Ollama not responding (timed out after {OLLAMA_TIMEOUT_S}s)"
        logger.error(msg)
        if _should_alert(key):
            _save_alert("critical", None, "ollama_timeout", msg)
            alerts.append(msg)
    except Exception as e:
        key = "ollama_error"
        msg = f"Ollama health check failed: {e}"
        logger.error(msg)
        if _should_alert(key):
            _save_alert("critical", None, "ollama_error", msg)
            alerts.append(msg)

    # Send combined alert email if any issues found
    if alerts:
        subject = f"{len(alerts)} GPU issue(s) detected"
        body = "The following GPU issues were detected:\n\n"
        body += "\n".join(f"  • {a}" for a in alerts)
        body += "\n\nServer: MCB-OLLAMA (172.16.50.17)"
        body += f"\nTimestamp: {time.strftime('%Y-%m-%d %H:%M:%S')}"
        _send_email(subject, body)
    else:
        logger.debug("GPU health check passed — no issues")
