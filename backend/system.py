import asyncio
import json
import os
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

try:
    import psutil

    PSUTIL_AVAILABLE = True
    # Prime cpu_percent — the first call without interval returns 0.0
    psutil.cpu_percent(interval=None)
except Exception:
    PSUTIL_AVAILABLE = False

router = APIRouter(tags=["system"])
_clients: list[WebSocket] = []

# Mount paths to surface on the dashboard. Anything missing is silently skipped.
_DISK_PATHS = ["/", "/mnt/new_ssd"]


def _read_disks() -> list[dict]:
    if not PSUTIL_AVAILABLE:
        return []
    out = []
    for path in _DISK_PATHS:
        if not os.path.ismount(path) and path != "/":
            continue
        try:
            usage = psutil.disk_usage(path)
        except (FileNotFoundError, PermissionError, OSError):
            continue
        out.append(
            {
                "path": path,
                "used_gb": round(usage.used / 1024**3, 2),
                "total_gb": round(usage.total / 1024**3, 2),
                "percent": usage.percent,
            }
        )
    return out


def read_system_stats() -> dict:
    timestamp = time.time()
    if not PSUTIL_AVAILABLE:
        return {
            "timestamp": timestamp,
            "cpu": {"percent": 0, "count": 0, "load_avg_1": 0, "load_avg_5": 0, "load_avg_15": 0},
            "memory": {"used_mb": 0, "total_mb": 0, "percent": 0, "swap_used_mb": 0, "swap_total_mb": 0},
            "disks": [],
        }

    vm = psutil.virtual_memory()
    sm = psutil.swap_memory()
    try:
        load1, load5, load15 = psutil.getloadavg()
    except (AttributeError, OSError):
        load1 = load5 = load15 = 0.0

    return {
        "timestamp": timestamp,
        "cpu": {
            "percent": psutil.cpu_percent(interval=None),
            "count": psutil.cpu_count(logical=True) or 0,
            "load_avg_1": round(load1, 2),
            "load_avg_5": round(load5, 2),
            "load_avg_15": round(load15, 2),
        },
        "memory": {
            "used_mb": vm.used // 1024 // 1024,
            "total_mb": vm.total // 1024 // 1024,
            "percent": vm.percent,
            "swap_used_mb": sm.used // 1024 // 1024,
            "swap_total_mb": sm.total // 1024 // 1024,
        },
        "disks": _read_disks(),
    }


async def system_broadcast_loop():
    while True:
        if _clients:
            payload = json.dumps(read_system_stats())
            dead = []
            for ws in _clients:
                try:
                    await ws.send_text(payload)
                except Exception:
                    dead.append(ws)
            for ws in dead:
                if ws in _clients:
                    _clients.remove(ws)
        await asyncio.sleep(1)


@router.websocket("/ws/system")
async def system_websocket(websocket: WebSocket):
    await websocket.accept()
    _clients.append(websocket)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        if websocket in _clients:
            _clients.remove(websocket)


@router.get("/api/system/stats")
async def get_system_snapshot():
    """One-shot HTTP endpoint for current system stats."""
    return read_system_stats()
