import asyncio
import json
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

try:
    import pynvml

    pynvml.nvmlInit()
    NVML_AVAILABLE = True
except Exception:
    NVML_AVAILABLE = False

router = APIRouter(tags=["gpu"])
_clients: list[WebSocket] = []


def read_gpu_stats() -> dict:
    timestamp = time.time()
    if not NVML_AVAILABLE:
        return {"timestamp": timestamp, "gpus": []}
    gpus = []
    count = pynvml.nvmlDeviceGetCount()
    for i in range(count):
        handle = pynvml.nvmlDeviceGetHandleByIndex(i)
        mem = pynvml.nvmlDeviceGetMemoryInfo(handle)
        util = pynvml.nvmlDeviceGetUtilizationRates(handle)
        temp = pynvml.nvmlDeviceGetTemperature(handle, pynvml.NVML_TEMPERATURE_GPU)
        name = pynvml.nvmlDeviceGetName(handle)
        # pynvml may return bytes on older versions
        if isinstance(name, bytes):
            name = name.decode()
        gpus.append(
            {
                "id": i,
                "name": name,
                "vram_used_mb": mem.used // 1024 // 1024,
                "vram_total_mb": mem.total // 1024 // 1024,
                "utilization_pct": util.gpu,
                "temperature_c": temp,
            }
        )
    return {"timestamp": timestamp, "gpus": gpus}


async def gpu_broadcast_loop():
    while True:
        if _clients:
            payload = json.dumps(read_gpu_stats())
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


@router.websocket("/ws/gpu")
async def gpu_websocket(websocket: WebSocket):
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


@router.get("/api/gpu/stats")
async def get_gpu_snapshot():
    """One-shot HTTP endpoint for current GPU stats."""
    return read_gpu_stats()
