import sqlite3
import contextlib
import os

from backend.config import get_settings


def get_db_path() -> str:
    return get_settings().db_path


def init_db():
    """Apply schema.sql to create tables if they don't exist."""
    db_path = get_db_path()
    dir_part = os.path.dirname(db_path)
    if dir_part:
        os.makedirs(dir_part, exist_ok=True)
    schema_file = os.path.join(os.path.dirname(__file__), "schema.sql")
    schema = open(schema_file).read()
    with sqlite3.connect(db_path) as conn:
        conn.executescript(schema)


@contextlib.contextmanager
def get_db():
    conn = sqlite3.connect(get_db_path(), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
