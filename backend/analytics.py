"""
Analytics — Phase 2
Endpoints: summary stats, token timeseries, hourly heatmap, P95 latency per model.
All queries run on the request_logs SQLite table.
"""
from fastapi import APIRouter, Depends, Query

from backend.auth import get_current_user
from backend.db.database import get_db

router = APIRouter(tags=["analytics"])


@router.get("/api/analytics/summary")
async def analytics_summary(
    days: int = Query(7, ge=1, le=90),
    user=Depends(get_current_user),
):
    """High-level stats for the last N days."""
    with get_db() as db:
        row = db.execute(
            """SELECT
                   COUNT(*)                          AS total_requests,
                   COALESCE(AVG(latency_ms), 0)     AS avg_latency_ms,
                   COALESCE(SUM(prompt_tokens), 0)     AS total_prompt_tokens,
                   COALESCE(SUM(completion_tokens), 0) AS total_completion_tokens,
                   SUM(CASE WHEN status LIKE '2%' THEN 1 ELSE 0 END) AS success_count,
                   SUM(CASE WHEN status NOT LIKE '2%' THEN 1 ELSE 0 END) AS error_count
               FROM request_logs
               WHERE timestamp >= datetime('now', ? || ' days')""",
            (f"-{days}",),
        ).fetchone()

        # P95 latency — separate query using NTILE approximation
        p95_row = db.execute(
            """SELECT latency_ms FROM request_logs
               WHERE timestamp >= datetime('now', ? || ' days')
                 AND latency_ms IS NOT NULL
               ORDER BY latency_ms
               LIMIT 1
               OFFSET MAX(0, CAST((
                   SELECT COUNT(*) FROM request_logs
                   WHERE timestamp >= datetime('now', ? || ' days')
                     AND latency_ms IS NOT NULL
               ) * 0.95 - 1 AS INTEGER))""",
            (f"-{days}", f"-{days}"),
        ).fetchone()
        p95_latency = p95_row["latency_ms"] if p95_row else 0

        # Unique IPs
        distinct_ips = db.execute(
            """SELECT COUNT(DISTINCT ip) AS n FROM request_logs
               WHERE timestamp >= datetime('now', ? || ' days')""",
            (f"-{days}",),
        ).fetchone()["n"]

        # Most used models — by request count, with token totals
        top_models = db.execute(
            """SELECT model,
                      COUNT(*) AS cnt,
                      COALESCE(SUM(prompt_tokens), 0) AS prompt_tokens,
                      COALESCE(SUM(completion_tokens), 0) AS completion_tokens
               FROM request_logs
               WHERE timestamp >= datetime('now', ? || ' days')
                 AND model IS NOT NULL AND model != ''
               GROUP BY model ORDER BY cnt DESC LIMIT 5""",
            (f"-{days}",),
        ).fetchall()

    total_prompt = row["total_prompt_tokens"] or 0
    total_completion = row["total_completion_tokens"] or 0
    return {
        "period_days": days,
        "total_requests": row["total_requests"] or 0,
        "avg_latency_ms": round(row["avg_latency_ms"] or 0, 1),
        "p95_latency_ms": p95_latency,
        "success_count": row["success_count"] or 0,
        "error_count": row["error_count"] or 0,
        "distinct_ips": distinct_ips,
        "total_prompt_tokens": total_prompt,
        "total_completion_tokens": total_completion,
        "total_tokens": total_prompt + total_completion,
        "top_models": [
            {
                "model": r["model"],
                "count": r["cnt"],
                "prompt_tokens": r["prompt_tokens"],
                "completion_tokens": r["completion_tokens"],
                "total_tokens": r["prompt_tokens"] + r["completion_tokens"],
            }
            for r in top_models
        ],
    }


@router.get("/api/analytics/timeseries")
async def analytics_timeseries(
    days: int = Query(7, ge=1, le=30),
    user=Depends(get_current_user),
):
    """Request counts and average latency grouped by hour for the last N days."""
    with get_db() as db:
        rows = db.execute(
            """SELECT
                   strftime('%Y-%m-%dT%H:00:00', timestamp) AS hour,
                   COUNT(*) AS request_count,
                   COALESCE(AVG(latency_ms), 0) AS avg_latency_ms
               FROM request_logs
               WHERE timestamp >= datetime('now', ? || ' days')
               GROUP BY hour
               ORDER BY hour ASC""",
            (f"-{days}",),
        ).fetchall()
    return [
        {
            "hour": r["hour"],
            "request_count": r["request_count"],
            "avg_latency_ms": round(r["avg_latency_ms"], 1),
        }
        for r in rows
    ]


@router.get("/api/analytics/heatmap")
async def analytics_heatmap(
    days: int = Query(30, ge=1, le=90),
    user=Depends(get_current_user),
):
    """
    Request heatmap by hour-of-day × day-of-week.
    Returns list of {dow: 0-6, hour: 0-23, count: N}.
    """
    with get_db() as db:
        rows = db.execute(
            """SELECT
                   CAST(strftime('%w', timestamp) AS INTEGER) AS dow,
                   CAST(strftime('%H', timestamp) AS INTEGER) AS hour,
                   COUNT(*) AS count
               FROM request_logs
               WHERE timestamp >= datetime('now', ? || ' days')
               GROUP BY dow, hour
               ORDER BY dow, hour""",
            (f"-{days}",),
        ).fetchall()
    return [{"dow": r["dow"], "hour": r["hour"], "count": r["count"]} for r in rows]


@router.get("/api/analytics/latency-by-model")
async def latency_by_model(
    days: int = Query(7, ge=1, le=30),
    user=Depends(get_current_user),
):
    """Average and P95 latency broken down per model."""
    with get_db() as db:
        rows = db.execute(
            """SELECT
                   model,
                   COUNT(*) AS request_count,
                   COALESCE(AVG(latency_ms), 0) AS avg_latency_ms,
                   COALESCE(MAX(latency_ms), 0) AS max_latency_ms
               FROM request_logs
               WHERE timestamp >= datetime('now', ? || ' days')
                 AND model IS NOT NULL AND model != ''
               GROUP BY model
               ORDER BY avg_latency_ms DESC""",
            (f"-{days}",),
        ).fetchall()
    return [
        {
            "model": r["model"],
            "request_count": r["request_count"],
            "avg_latency_ms": round(r["avg_latency_ms"], 1),
            "max_latency_ms": r["max_latency_ms"],
        }
        for r in rows
    ]


@router.get("/api/logs")
async def query_logs(
    limit: int = Query(100, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    ip: str | None = Query(None),
    model: str | None = Query(None),
    status: str | None = Query(None),
    user=Depends(get_current_user),
):
    """Paginated log query with optional filters."""
    clauses = []
    params = []
    if ip:
        clauses.append("ip = ?")
        params.append(ip)
    if model:
        clauses.append("model = ?")
        params.append(model)
    if status:
        clauses.append("status LIKE ?")
        params.append(f"{status}%")

    where = ("WHERE " + " AND ".join(clauses)) if clauses else ""
    params += [limit, offset]

    with get_db() as db:
        rows = db.execute(
            f"SELECT * FROM request_logs {where} ORDER BY timestamp DESC LIMIT ? OFFSET ?",
            params,
        ).fetchall()
        total = db.execute(
            f"SELECT COUNT(*) AS n FROM request_logs {where}",
            params[:-2],
        ).fetchone()["n"]

    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "logs": [dict(r) for r in rows],
    }
