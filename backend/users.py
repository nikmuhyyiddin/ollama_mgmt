"""
User Management — Phase 3
Admin-only endpoints for listing, creating, and deleting users.
All users can change their own password via PUT /api/users/me/password.
"""
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from backend.auth import get_current_user, hash_password, verify_password
from backend.db.database import get_db

router = APIRouter(tags=["users"])


# ── Helpers ────────────────────────────────────────────────────────────────────

def _require_admin(user=Depends(get_current_user)):
    if user.get("role") != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin role required",
        )
    return user


# ── Schemas ────────────────────────────────────────────────────────────────────

class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "viewer"  # "admin" | "viewer"


class PasswordChange(BaseModel):
    current_password: str
    new_password: str


# ── Endpoints ──────────────────────────────────────────────────────────────────

@router.get("/api/users")
async def list_users(user=Depends(_require_admin)):
    with get_db() as db:
        rows = db.execute(
            "SELECT id, username, role, created_at FROM users ORDER BY created_at ASC"
        ).fetchall()
    return [dict(r) for r in rows]


@router.post("/api/users", status_code=201)
async def create_user(body: UserCreate, user=Depends(_require_admin)):
    if body.role not in ("admin", "viewer"):
        raise HTTPException(status_code=422, detail="role must be 'admin' or 'viewer'")
    if len(body.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters")

    with get_db() as db:
        existing = db.execute(
            "SELECT id FROM users WHERE username = ?", (body.username,)
        ).fetchone()
        if existing:
            raise HTTPException(status_code=409, detail=f"Username '{body.username}' already exists")
        cur = db.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            (body.username, hash_password(body.password), body.role),
        )
        new_id = cur.lastrowid

    return {"id": new_id, "username": body.username, "role": body.role}


@router.delete("/api/users/{user_id}", status_code=204)
async def delete_user(user_id: int, user=Depends(_require_admin)):
    if user.get("id") == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    with get_db() as db:
        row = db.execute("SELECT id FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        db.execute("DELETE FROM users WHERE id = ?", (user_id,))


@router.put("/api/users/me/password", status_code=204)
async def change_password(body: PasswordChange, user=Depends(get_current_user)):
    if len(body.new_password) < 8:
        raise HTTPException(status_code=422, detail="New password must be at least 8 characters")

    with get_db() as db:
        row = db.execute(
            "SELECT password_hash FROM users WHERE id = ?", (user["id"],)
        ).fetchone()
        if not row:
            raise HTTPException(status_code=404, detail="User not found")
        if not verify_password(body.current_password, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Current password is incorrect")
        db.execute(
            "UPDATE users SET password_hash = ? WHERE id = ?",
            (hash_password(body.new_password), user["id"]),
        )


@router.get("/api/users/me")
async def get_me(user=Depends(get_current_user)):
    with get_db() as db:
        row = db.execute(
            "SELECT id, username, role, created_at FROM users WHERE id = ?",
            (user["id"],),
        ).fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found")
    return dict(row)
