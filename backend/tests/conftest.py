import os
import tempfile
import pytest

# Use a shared temp file so all sqlite3 connections share the same DB
_tmp = tempfile.NamedTemporaryFile(suffix=".db", delete=False)
_tmp.close()
os.environ["DB_PATH"] = _tmp.name
os.environ["JWT_SECRET"] = "test-secret-key-abcdef1234567890abcdef12"
os.environ["OLLAMA_HOST"] = "http://localhost:19999"  # unreachable intentionally
os.environ["ADMIN_PASSWORD"] = "admin"  # known seed password for tests

from fastapi.testclient import TestClient  # noqa: E402
from backend.main import app  # noqa: E402
from backend.db.database import init_db  # noqa: E402
from backend.auth import seed_admin  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def setup_db():
    init_db()
    seed_admin()


@pytest.fixture(scope="session")
def client():
    return TestClient(app)


@pytest.fixture(scope="session")
def auth_headers(client):
    resp = client.post(
        "/api/auth/login",
        data={"username": "admin", "password": "admin"},
    )
    assert resp.status_code == 200, f"Login failed: {resp.text}"
    token = resp.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
