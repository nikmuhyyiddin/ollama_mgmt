"""
Settings & Alerts API — SMTP config management + GPU alert history.
"""
import json
import smtplib
from email.mime.text import MIMEText

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.db.database import get_db

router = APIRouter(tags=["settings"])

# ── SMTP Settings ─────────────────────────────────────────────────────────────

SMTP_KEYS = [
    "smtp_server", "smtp_port", "smtp_user", "smtp_password",
    "smtp_from", "smtp_use_tls", "alert_to_email",
]


class SMTPSettings(BaseModel):
    smtp_server: str = ""
    smtp_port: int = 25
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = False
    alert_to_email: str = ""


@router.get("/api/settings/smtp")
async def get_smtp_settings(user: dict = Depends(get_current_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT key, value FROM settings WHERE key IN ({})".format(
                ",".join("?" for _ in SMTP_KEYS)
            ),
            SMTP_KEYS,
        ).fetchall()
    result = {k: "" for k in SMTP_KEYS}
    for row in rows:
        result[row["key"]] = row["value"]
    # Type conversions
    result["smtp_port"] = int(result["smtp_port"]) if result["smtp_port"] else 25
    result["smtp_use_tls"] = result["smtp_use_tls"] in ("true", "True", "1")
    # Mask password for display
    if result["smtp_password"]:
        result["smtp_password_set"] = True
        result["smtp_password"] = ""
    else:
        result["smtp_password_set"] = False
    return result


@router.put("/api/settings/smtp")
async def update_smtp_settings(settings: SMTPSettings, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    data = settings.model_dump()
    # Convert types for storage
    data["smtp_port"] = str(data["smtp_port"])
    data["smtp_use_tls"] = str(data["smtp_use_tls"]).lower()
    with get_db() as db:
        for key, value in data.items():
            if key == "smtp_password" and not value:
                continue  # Don't overwrite password with empty string
            db.execute(
                "INSERT INTO settings (key, value, updated_at) VALUES (?, ?, datetime('now')) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                (key, str(value)),
            )
    return {"status": "ok", "message": "SMTP settings saved"}


class TestEmailRequest(BaseModel):
    to_email: str = ""


@router.post("/api/settings/smtp/test")
async def test_smtp(req: TestEmailRequest, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    # Load settings from DB
    with get_db() as db:
        rows = db.execute(
            "SELECT key, value FROM settings WHERE key IN ({})".format(
                ",".join("?" for _ in SMTP_KEYS)
            ),
            SMTP_KEYS,
        ).fetchall()
    cfg = {row["key"]: row["value"] for row in rows}
    if not cfg.get("smtp_server"):
        raise HTTPException(status_code=400, detail="SMTP server not configured")

    to_email = req.to_email or cfg.get("alert_to_email", "")
    if not to_email:
        raise HTTPException(status_code=400, detail="No recipient email specified")

    msg = MIMEText(
        "This is a test alert from the Ollama Management Server.\n\n"
        "If you received this email, your SMTP settings are configured correctly.\n\n"
        "Server: MCB-OLLAMA (172.16.50.17)"
    )
    msg["Subject"] = "[Ollama GPU Alert] Test Email"
    msg["From"] = cfg.get("smtp_from", cfg.get("smtp_user", ""))
    msg["To"] = to_email

    try:
        use_tls = cfg.get("smtp_use_tls", "false") in ("true", "True", "1")
        port = int(cfg.get("smtp_port", 25))
        if use_tls:
            server = smtplib.SMTP_SSL(cfg["smtp_server"], port, timeout=10)
        else:
            server = smtplib.SMTP(cfg["smtp_server"], port, timeout=10)
        if cfg.get("smtp_user") and cfg.get("smtp_password"):
            server.login(cfg["smtp_user"], cfg["smtp_password"])
        server.sendmail(msg["From"], [to_email], msg.as_string())
        server.quit()
        return {"status": "ok", "message": f"Test email sent to {to_email}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"SMTP error: {str(e)}")


# ── GPU Alerts ────────────────────────────────────────────────────────────────

@router.get("/api/alerts")
async def get_alerts(limit: int = 50, user: dict = Depends(get_current_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM gpu_alerts ORDER BY timestamp DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]


@router.get("/api/alerts/active")
async def get_active_alerts(user: dict = Depends(get_current_user)):
    with get_db() as db:
        rows = db.execute(
            "SELECT * FROM gpu_alerts WHERE resolved = 0 ORDER BY timestamp DESC"
        ).fetchall()
    return [dict(r) for r in rows]


@router.put("/api/alerts/{alert_id}/resolve")
async def resolve_alert(alert_id: int, user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    with get_db() as db:
        result = db.execute(
            "UPDATE gpu_alerts SET resolved = 1, resolved_at = datetime('now') WHERE id = ?",
            (alert_id,),
        )
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Alert not found")
    return {"status": "ok"}


@router.put("/api/alerts/resolve-all")
async def resolve_all_alerts(user: dict = Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    with get_db() as db:
        db.execute(
            "UPDATE gpu_alerts SET resolved = 1, resolved_at = datetime('now') WHERE resolved = 0"
        )
    return {"status": "ok"}
