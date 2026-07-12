"""backend/app/storage/db.py

Owned by tasks-database.md (DB-06). SQLite connection + schema for the
multi-tenant storage layer, replacing the flat-JSON files in bootstrap.py.
resume_store.py/job_store.py/match_store.py/user_store.py all go through
get_connection() here rather than opening sqlite3 connections themselves.
"""
import os
import sqlite3

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")
DB_PATH = os.path.join(DATA_DIR, "app.db")

_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    openai_api_key_encrypted TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS resumes (
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    raw_text TEXT NOT NULL,
    original_filename TEXT,
    source_type TEXT NOT NULL,
    uploaded_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS jobs (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    title TEXT,
    company TEXT,
    jd_raw_text TEXT NOT NULL,
    jd_original_filename TEXT,
    jd_source_type TEXT NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_user_id ON jobs(user_id);

CREATE TABLE IF NOT EXISTS match_results (
    job_id TEXT PRIMARY KEY REFERENCES jobs(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    generated_at TEXT NOT NULL,
    overall_score REAL NOT NULL,
    recommendation TEXT NOT NULL,
    recommendation_reasoning TEXT NOT NULL,
    scoring_method_explanation TEXT NOT NULL,
    categories_json TEXT NOT NULL,
    suggested_bullets_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_match_results_user_id ON match_results(user_id);
"""


def get_connection() -> sqlite3.Connection:
    """Open a connection to app.db with row access by column name.

    A new connection per call is intentional and cheap for SQLite (unlike a
    network database) -- avoids sharing a single connection across requests,
    which would need explicit locking in a multi-threaded server.
    """
    os.makedirs(DATA_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def init_db() -> None:
    """Create all tables (if they don't already exist). Safe to call on every app startup."""
    conn = get_connection()
    try:
        conn.executescript(_SCHEMA)
        conn.commit()
    finally:
        conn.close()
