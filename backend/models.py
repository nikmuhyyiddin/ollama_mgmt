from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from backend.auth import get_current_user
from backend.config import get_settings
from backend.http_client import get_http

router = APIRouter(tags=["models"])


class PullModelSchema(BaseModel):
    name: str


class ChatSchema(BaseModel):
    model: str
    messages: list[dict]  # [{role, content}, ...]


@router.get("/api/models")
async def list_models(user=Depends(get_current_user)):
    cfg = get_settings()
    resp = await get_http().get(f"{cfg.ollama_host}/api/tags", timeout=30)
    if resp.status_code != 200:
        raise HTTPException(
            status_code=resp.status_code, detail="Failed to reach Ollama"
        )
    return resp.json()


@router.post("/api/models/pull")
async def pull_model(body: PullModelSchema, user=Depends(get_current_user)):
    cfg = get_settings()

    async def _stream():
        async with get_http().stream(
            "POST",
            f"{cfg.ollama_host}/api/pull",
            json={"name": body.name, "stream": True},
            timeout=None,
        ) as resp:
            async for line in resp.aiter_lines():
                if line:
                    yield f"data: {line}\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream")


@router.post("/api/chat")
async def chat(body: ChatSchema, user=Depends(get_current_user)):
    """Stream a chat completion from Ollama. Used by the Playground (JWT-gated,
    unlike /ollama/* which is only IP-gated). Passes Ollama's NDJSON straight
    through as SSE lines."""
    cfg = get_settings()

    async def _stream():
        async with get_http().stream(
            "POST",
            f"{cfg.ollama_host}/api/chat",
            json={"model": body.model, "messages": body.messages, "stream": True},
            timeout=None,
        ) as resp:
            async for line in resp.aiter_lines():
                if line:
                    yield f"data: {line}\n\n"

    return StreamingResponse(_stream(), media_type="text/event-stream")


@router.delete("/api/models/{name:path}", status_code=204)
async def delete_model(name: str, user=Depends(get_current_user)):
    cfg = get_settings()
    resp = await get_http().request(
        "DELETE",
        f"{cfg.ollama_host}/api/delete",
        json={"name": name},
        timeout=30,
    )
    if resp.status_code not in (200, 204):
        raise HTTPException(
            status_code=resp.status_code, detail="Failed to delete model"
        )
