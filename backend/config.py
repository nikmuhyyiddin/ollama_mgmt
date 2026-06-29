from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    ollama_host: str = "http://127.0.0.1:11434"
    ollama_keep_alive: str = ""   # e.g. "10m", "1h", "-1" (forever); "" = Ollama default (5m)

    # LiteLLM gateway (headless engine; portal proxies its admin API)
    # Real values come from .env (gitignored) — these defaults are placeholders.
    litellm_base_url: str = "http://127.0.0.1:4000"
    litellm_master_key: str = "change-me"
    # read-only conn to LiteLLM's Postgres for historical reporting (daily rollups)
    litellm_db_url: str = "postgresql://litellm:change-me@127.0.0.1:5432/litellm"
    jwt_secret: str = "dev-secret-change-me"
    jwt_expire_minutes: int = 1440
    # Seed password for the first admin user. If empty, a random one is generated
    # and logged once at startup (see auth.seed_admin).
    admin_password: str = ""
    db_path: str = "./db/ollama.db"
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000
    cors_origins: str = "http://localhost:5173"

    # SMTP / alerting
    smtp_server: str = ""
    smtp_port: int = 25
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""
    smtp_use_tls: bool = False
    alert_to_email: str = ""

    model_config = {"env_file": ".env", "extra": "ignore"}


@lru_cache()
def get_settings() -> Settings:
    return Settings()
