from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from jose import JWTError, jwt
from passlib.context import CryptContext
from pydantic import BaseModel

from backend.config import get_settings
from backend.db.database import get_db

router = APIRouter(tags=["auth"])
pwd_ctx = CryptContext(schemes=["bcrypt"], deprecated="auto")
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login")


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
    """Create default admin user if no users exist."""
    with get_db() as db:
        row = db.execute("SELECT id FROM users LIMIT 1").fetchone()
        if not row:
            db.execute(
                "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)",
                ("admin", hash_password("admin"), "admin"),
            )


@router.post("/api/auth/login", response_model=Token)
async def login(form: OAuth2PasswordRequestForm = Depends()):
    with get_db() as db:
        row = db.execute(
            "SELECT * FROM users WHERE username = ?", (form.username,)
        ).fetchone()
    if not row or not verify_password(form.password, row["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect username or password",
        )
    token = create_token(
        {"sub": row["username"], "role": row["role"], "id": row["id"]}
    )
    return Token(access_token=token)
