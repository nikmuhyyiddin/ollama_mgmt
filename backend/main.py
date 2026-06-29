import asyncio
import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from backend.analytics import router as analytics_router
from backend.auth import router as auth_router
from backend.auth import seed_admin
from backend.config import get_settings
from backend.db.database import init_db
from backend.gateway import router as gateway_router
from backend.gpu import gpu_broadcast_loop
from backend.gpu import router as gpu_router
from backend.http_client import close_http, open_http
from backend.logger import RequestLoggerMiddleware
from backend.models import router as models_router
from backend.proxy import router as proxy_router
from backend.rate_limiter import RateLimiterMiddleware
from backend.scheduler import start_scheduler, stop_scheduler
from backend.system import router as system_router
from backend.system import system_broadcast_loop
from backend.settings import router as settings_router
from backend.users import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    init_db()
    seed_admin()
    await open_http()
    start_scheduler()
    gpu_task = asyncio.create_task(gpu_broadcast_loop())
    system_task = asyncio.create_task(system_broadcast_loop())
    yield
    # Shutdown
    stop_scheduler()
    for task in (gpu_task, system_task):
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    await close_http()


app = FastAPI(
    title="Ollama Management Server",
    description="Production-grade LLM operations platform",
    version="2.0.0",
    lifespan=lifespan,
)

cfg = get_settings()

# CORS — support both wildcard and specific origins
_origins = [o.strip() for o in cfg.cors_origins.split(",")]
_wildcard = "*" in _origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"] if _wildcard else _origins,
    allow_credentials=False if _wildcard else True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(RateLimiterMiddleware)
app.add_middleware(RequestLoggerMiddleware)

app.include_router(auth_router)
app.include_router(gpu_router)
app.include_router(system_router)
app.include_router(models_router)
app.include_router(proxy_router)
app.include_router(analytics_router)
app.include_router(settings_router)
app.include_router(users_router)
app.include_router(gateway_router)

# ── SSL cert download — so clients can install it as trusted ──────────────────
_CERT_PATH = Path(__file__).parent.parent / "ollama-mgmt.crt"

@app.get("/ssl-cert", include_in_schema=False)
async def download_ssl_cert():
    """
    Serve the self-signed CA cert for download.
    Visit https://ollama_dev.malakoff.com.my/ssl-cert in a browser to download it,
    then install it as a trusted CA on your device.
    No authentication required — the cert is public information.
    """
    if not _CERT_PATH.exists():
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Certificate not found on server")
    return FileResponse(
        path=_CERT_PATH,
        media_type="application/x-pem-file",
        filename="ollama-mgmt.crt",
        headers={"Content-Disposition": "attachment; filename=ollama-mgmt.crt"},
    )

# ── Serve React SPA on port 8000 ───────────────────────────────────────────
_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if _DIST.exists():
    # Serve /assets/* and other static files
    app.mount("/assets", StaticFiles(directory=_DIST / "assets"), name="assets")

    # SPA catch-all: serve index.html for client-side routes ONLY
    # Explicit API paths are handled by the routers above; this is the safety net
    from fastapi import Response

    @app.get("/{full_path:path}", include_in_schema=False)
    async def spa_fallback(full_path: str):
        # Never intercept API/WebSocket/proxy paths
        api_prefixes = ("api/", "v1/", "ws/", "ollama/", "assets/", "docs", "openapi", "redoc", "ssl-cert")
        # note: /api/gateway/* is covered by the "api/" prefix above
        if any(full_path.startswith(p) for p in api_prefixes):
            return Response(status_code=404)
        return FileResponse(_DIST / "index.html")


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "backend.main:app",
        host=cfg.backend_host,
        port=cfg.backend_port,
        reload=True,
    )
