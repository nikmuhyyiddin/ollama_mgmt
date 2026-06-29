"""
Request Logger Middleware — Phase 2 (enhanced)
Extracts model name from JSON request body and logs to request_logs.
"""
import json
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from backend.db.database import get_db


async def _read_body_model(request: Request) -> str | None:
    """
    Try to extract 'model' field from a JSON request body.
    Does NOT consume the stream — caches body in request.state.
    """
    try:
        # Only attempt on POST with JSON content
        ct = request.headers.get("content-type", "")
        if "application/json" not in ct:
            return None
        body = await request.body()
        if not body:
            return None
        data = json.loads(body)
        return data.get("model") or data.get("name")
    except Exception:
        return None


class RequestLoggerMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        start = time.time()

        # Extract model before the request is consumed
        model = await _read_body_model(request) if request.method == "POST" else None

        response = await call_next(request)
        latency_ms = int((time.time() - start) * 1000)

        path = request.url.path
        if path.startswith(("/api/", "/ollama/", "/ws/")):
            client_ip = request.client.host if request.client else "unknown"
            status_code = str(response.status_code)
            # API key ID may have been attached to request state by get_current_principal
            api_key_id = getattr(request.state, "api_key_id", None)

            try:
                with get_db() as db:
                    db.execute(
                        """INSERT INTO request_logs
                               (ip, api_key_id, model, latency_ms, status)
                           VALUES (?, ?, ?, ?, ?)""",
                        (client_ip, api_key_id, model, latency_ms, status_code),
                    )
            except Exception:
                pass  # Never let logging break a request

        return response
