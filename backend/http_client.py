"""
Shared, pooled httpx.AsyncClient for all outbound calls to Ollama.

One client for the whole process keeps TCP connections to the Ollama host warm
instead of building a new connection per request. Opened/closed by the FastAPI
lifespan in main.py. Per-call timeouts override the default (pass timeout=None
for streaming, timeout=30 for quick calls, etc.).
"""
import httpx

_client: httpx.AsyncClient | None = None


def get_http() -> httpx.AsyncClient:
    if _client is None:
        raise RuntimeError("HTTP client not initialised — call open_http() first")
    return _client


async def open_http() -> None:
    global _client
    _client = httpx.AsyncClient(
        timeout=httpx.Timeout(300.0, connect=10.0),
        limits=httpx.Limits(max_keepalive_connections=20, keepalive_expiry=300),
    )


async def close_http() -> None:
    global _client
    if _client is not None:
        await _client.aclose()
        _client = None
