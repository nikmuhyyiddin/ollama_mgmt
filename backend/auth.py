import logging
import secrets
import time
from collections import deque
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from backend.config import get_settings
from backend.db.database import get_db

router = APIRouter(tags=["auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")
log = logging.getLogger("uvicorn.error")

# Login brute-force throttle — per-IP failed-attempt timestamps.
# ponytail: in-memory, single-instance ceiling — move to a shared store if multi-node.
_login_fails: dict[str, deque] = {}
_LOGIN_MAX_FAILS = 5
_LOGIN_WINDOW = 300  # seconds


class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"


def hash_password(plain: str) -> str:
    return pwd_ctx.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_ctx.verify(plain, hashed)


def create_token(data: dict) -> str:
    cfg = get_settings()
    expires = datetime.utcnow() + timedelta(minutes=cfg.jwt_expire_minutes)
    return jwt.encode({**data, "exp": expires}, cfg.jwt_secret, algorithm="HS256")


def get_current_user(token: str = Depends(oauth2_scheme)) -> dict:
    cfg = get_settings()
    try:
        payload = jwt.decode(token, cfg.jwt_secret, algorithms=["HS256"])
        return payload
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired token",
            headers={"WWW-Authenticate": "Bearer"},
        )


def seed_admin():
    """Create default admin user if no users exist.

    Password comes from ADMIN_PASSWORD; if unset, a random one is generated and
    logged once so the operator can grab it from the startup logs.
    """
    with get_db() as db:
        row = db.execute("SELECT id FROM users LIMIT 1").fetchone()
        if row:
            return
        cfg = get_settings()
        password = cfg.admin_password or secrets.token_urlsafe(12)
        db.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
            ("admin", hash_password(password), "admin"),
        )
        if not cfg.admin_password:
            log.warning(
                "Seeded admin user with a generated password: %s — "
                "log in and change it, or set ADMIN_PASSWORD before first run.",
                password,
            )


@router.post("/api/auth/login", response_model=Token)
async def login(request: Request, form: OAuth2PasswordRequestForm = Depends()):
    client_ip = request.client.host if request.client else "unknown"
    now = time.monotonic()
    fails = _login_fails.get(client_ip, deque())
    while fails and fails[0] < now - _LOGIN_WINDOW:
        fails.popleft()
    if len(fails) >= _LOGIN_MAX_FAILS:
        retry_after = int(_LOGIN_WINDOW - (now - fails[0])) + 1
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Too many failed logins. Try again later.",
            headers={"Retry-After": str(retry_after)},
        )

    with get_db() as db:
        row = db.execute(
            "SELECT * FROM users WHERE username = ?", (form.username,)
        ).fetchone()
    if not row or not verify_password(form.password, row["password_hash"]):
        fails.append(now)
        _login_fails[client_ip] = fails
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    _login_fails.pop(client_ip, None)  # reset on success
    token = create_token(
        {"sub": row["username"], "role": row["role"], "id": row["id"]}
    )
    return Token(access_token=token)
