"""Shared pytest fixtures (BE-13).

Sets required env vars BEFORE any app module is imported -- app.config
raises RuntimeError at import time if OPENAI_API_KEY/JWT_SECRET/
ENCRYPTION_KEY are unset, so this must happen before the first `from app...`
anywhere in the test session. Each test gets a fresh, isolated SQLite
database in a pytest tmp_path -- tests never touch backend/data/app.db.
"""
import os

os.environ.setdefault("OPENAI_API_KEY", "sk-test-placeholder-not-a-real-key")
os.environ.setdefault("JWT_SECRET", "test-secret-do-not-use-in-production")

from cryptography.fernet import Fernet  # noqa: E402

os.environ.setdefault("ENCRYPTION_KEY", Fernet.generate_key().decode())

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402


@pytest.fixture()
def client(tmp_path, monkeypatch):
    """A TestClient wired to a fresh SQLite DB, isolated per test.

    monkeypatch (a built-in pytest fixture) automatically undoes these
    attribute overrides at the end of the test, so isolation never leaks
    between tests even though db.py's DB_PATH is a module-level global.
    """
    from app.storage import bootstrap as bootstrap_module
    from app.storage import db as db_module

    # monkeypatch.setattr (rather than plain assignment) automatically
    # restores the original module attribute after this test finishes,
    # even if the test fails/raises -- required here since these are
    # module-level globals shared across the whole test session.
    monkeypatch.setattr(db_module, "DB_PATH", str(tmp_path / "test.db"))
    monkeypatch.setattr(db_module, "DATA_DIR", str(tmp_path))
    # bootstrap.py (the old JSON-file layer) is still called once at
    # startup by main.py; nothing routes through it anymore post-DB-06, but
    # point it at tmp_path too so a test run never creates stray .json
    # files in the real backend/data/ directory.
    monkeypatch.setattr(bootstrap_module, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(bootstrap_module, "RESUME_PATH", str(tmp_path / "resume.json"))
    monkeypatch.setattr(bootstrap_module, "JOBS_PATH", str(tmp_path / "jobs.json"))
    monkeypatch.setattr(
        bootstrap_module, "MATCH_RESULTS_PATH", str(tmp_path / "match_results.json")
    )

    from app.main import app

    # TestClient's context-manager form triggers FastAPI's startup event
    # (ensure_data_files + init_db) on __enter__ -- without `with`, the
    # SQLite tables would never get created against our patched DB_PATH.
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture()
def signed_up_user(client):
    """Signs up one user and returns (client, access_token, email, password)."""
    email = "user1@example.com"
    password = "testpass123"
    resp = client.post("/api/auth/signup", json={"email": email, "password": password})
    assert resp.status_code == 201
    access_token = resp.json()["access_token"]
    return client, access_token, email, password


def auth_headers(access_token: str) -> dict:
    return {"Authorization": f"Bearer {access_token}"}
