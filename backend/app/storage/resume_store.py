"""backend/app/storage/resume_store.py

Owned by tasks-database.md (DB-02, rewritten for multi-tenant support in
DB-06). SQLite-backed, user_id-scoped. Each user has at most one resume row
(user_id is the resumes table's primary key) -- saving always replaces the
current row's content in place, matching the pre-existing "replace resume"
behavior, now scoped per user instead of global.
"""
from datetime import datetime, timezone
from typing import Optional

from app.storage.db import get_connection


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_resume(user_id: int) -> Optional[dict]:
    conn = get_connection()
    try:
        row = conn.execute(
            "SELECT user_id, raw_text, original_filename, source_type, uploaded_at, updated_at "
            "FROM resumes WHERE user_id = ?",
            (user_id,),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def save_resume(
    user_id: int, raw_text: str, original_filename: Optional[str], source_type: str
) -> dict:
    conn = get_connection()
    try:
        existing = conn.execute(
            "SELECT uploaded_at FROM resumes WHERE user_id = ?", (user_id,)
        ).fetchone()
        uploaded_at = existing["uploaded_at"] if existing else _now()
        updated_at = _now()

        # INSERT ... ON CONFLICT: insert a new row, or if one already exists
        # for this user_id (the primary key), update it in place instead.
        # This is the SQL equivalent of the old JSON version's "overwrite".
        conn.execute(
            """
            INSERT INTO resumes (user_id, raw_text, original_filename, source_type, uploaded_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET
                raw_text = excluded.raw_text,
                original_filename = excluded.original_filename,
                source_type = excluded.source_type,
                updated_at = excluded.updated_at
            """,
            (user_id, raw_text, original_filename, source_type, uploaded_at, updated_at),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "user_id": user_id,
        "raw_text": raw_text,
        "original_filename": original_filename,
        "source_type": source_type,
        "uploaded_at": uploaded_at,
        "updated_at": updated_at,
    }
