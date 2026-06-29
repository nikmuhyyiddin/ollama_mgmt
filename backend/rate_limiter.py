"""
In-memory sliding window rate limiter — Phase 2
No Redis required. Uses a per-key deque of timestamps.
Keyed by: IP address (default) or API key ID if present.
"""
import asyncio
import time
from collections import defaultdict, deque

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

# Global store: key → deque of request timestamps (seconds)
_windows: dict[str, deque] = defaultdict(deque)
_lock = asyncio.Lock()

# Default limit (overridden per API key from DB row if available)
DEFAULT_RATE_LIMIT = 60          # requests per minute
WINDOW_SECONDS = 60


class RateLimiterMiddleware(BaseHTTPMiddleware):
    """
    Sliding window rate limiter.
    - Uses client IP as the rate-limit key for unauthenticated/JWT requests.
    - Uses API key ID for API key-authenticated requests (attached by get_current_principal).
    - Only applies to /api/* and /ollama/* paths; skips static, /ws/*, docs.
    """

    async def dispatch(self, request: Request, call_next):
        path = request.url.path

        # Only rate-limit API and proxy paths
        if not path.startswith(("/api/", "/ollama/")):
            return await call_next(request)

        # Determine the rate-limit key and limit
        client_ip = request.client.host if request.client else "unknown"
        # API key ID may be injected by get_current_principal into request.state
        api_key_id = getattr(request.state, "api_key_id", None)
        rate_limit_val = getattr(request.state, "rate_limit", None) or DEFAULT_RATE_LIMIT

        rl_key = f"key:{api_key_id}" if api_key_id else f"ip:{client_ip}"

        now = time.monotonic()
        async with _lock:
            window = _windows[rl_key]
            # Evict timestamps older than WINDOW_SECONDS
            cutoff = now - WINDOW_SECONDS
            while window and window[0] < cutoff:
                window.popleft()

            if len(window) >= rate_limit_val:
                retry_after = int(WINDOW_SECONDS - (now - window[0])) + 1
                return JSONResponse(
                    status_code=429,
                    content={
                        "detail": "Rate limit exceeded",
                        "retry_after_seconds": retry_after,
                    },
                    headers={"Retry-After": str(retry_after)},
                )

            window.append(now)

        response = await call_next(request)
        # Inject rate limit headers for transparency
        response.headers["X-RateLimit-Limit"] = str(rate_limit_val)
        response.headers["X-RateLimit-Remaining"] = str(
            rate_limit_val - len(_windows[rl_key])
        )
        return response
