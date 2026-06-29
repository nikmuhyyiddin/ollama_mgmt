"""
Scheduler — Phase 2
APScheduler cron jobs: log rotation, idle model eviction, VRAM cleanup log.
"""
import logging
from datetime import datetime, timedelta

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from backend.db.database import get_db
from backend.gpu_monitor import check_gpu_health

logger = logging.getLogger("ollama-mgmt.scheduler")

scheduler = AsyncIOScheduler()


# ── Jobs ───────────────────────────────────────────────────────────────────────

def rotate_logs():
    """Delete request_logs older than 90 days to keep the DB lean."""
    cutoff = (datetime.utcnow() - timedelta(days=90)).isoformat()
    with get_db() as db:
        result = db.execute(
            "DELETE FROM request_logs WHERE timestamp < ?", (cutoff,)
        )
        deleted = result.rowcount
    if deleted:
        logger.info(f"Log rotation: deleted {deleted} rows older than 90 days")


def check_scheduler_jobs():
    """Update last_run timestamps in scheduler_jobs table."""
    with get_db() as db:
        db.execute(
            "UPDATE scheduler_jobs SET last_run = datetime('now') WHERE name = 'rotate_logs'"
        )


def log_vram_summary():
    """Log a GPU VRAM snapshot to the scheduler_jobs table (as a health record)."""
    try:
        from backend.gpu import read_gpu_stats
        stats = read_gpu_stats()
        if stats["gpus"]:
            summary = ", ".join(
                f"GPU{g['id']} {g['vram_used_mb']}/{g['vram_total_mb']}MB"
                for g in stats["gpus"]
            )
            logger.info(f"VRAM snapshot: {summary}")
    except Exception as e:
        logger.warning(f"VRAM snapshot failed: {e}")


# ── Startup / Shutdown ─────────────────────────────────────────────────────────

def start_scheduler():
    """Register jobs and start the scheduler. Called from main.py lifespan."""
    # Seed scheduler_jobs table with known jobs
    with get_db() as db:
        for name, cron, action in [
            ("rotate_logs",      "0 3 * * *",  "delete request_logs older than 90 days"),
            ("vram_snapshot",    "*/5 * * * *", "log GPU VRAM usage"),
            ("gpu_health_check", "*/2 * * * *", "check GPU health: PCIe, temp, Ollama responsiveness"),
        ]:
            db.execute(
                """INSERT OR IGNORE INTO scheduler_jobs (name, cron_expr, action, enabled)
                   VALUES (?, ?, ?, 1)""",
                (name, cron, action),
            )

    # Register APScheduler jobs
    scheduler.add_job(rotate_logs, CronTrigger.from_crontab("0 3 * * *"),
                      id="rotate_logs", replace_existing=True)
    scheduler.add_job(log_vram_summary, CronTrigger.from_crontab("*/5 * * * *"),
                      id="vram_snapshot", replace_existing=True)
    scheduler.add_job(check_gpu_health, CronTrigger.from_crontab("*/2 * * * *"),
                      id="gpu_health_check", replace_existing=True)
    scheduler.start()
    logger.info("Scheduler started with jobs: rotate_logs (daily 03:00), vram_snapshot (every 5m), gpu_health_check (every 2m)")


def stop_scheduler():
    """Graceful shutdown."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
