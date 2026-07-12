"""backend/app/storage/job_store.py

Owned by tasks-database.md (DB-03, rewritten for multi-tenant support in
DB-06). SQLite-backed, user_id-scoped. get_job/update_job_status take
user_id first and scope every query by it -- a job that exists but belongs
to a different user behaves identically to a nonexistent job (returns None),
never leaking existence to the wrong caller.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.storage.db import get_connection

ALLOWED_STATUSES = {"saved", "applied", "interviewing", "rejected", "offer"}

_COLUMNS = (
    "id, user_id, title, company, jd_raw_text, jd_original_filename, "
    "jd_source_type, status, created_at, updated_at"
)


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_jobs(user_id: int) -> list:
    conn = get_connection()
    try:
        rows = conn.execute(
            f"SELECT {_COLUMNS} FROM jobs WHERE user_id = ? ORDER BY created_at ASC",
            (user_id,),
        ).fetchall()
        return [dict(row) for row in rows]
    finally:
        conn.close()


def get_job(user_id: int, job_id: str) -> Optional[dict]:
    conn = get_connection()
    try:
        # Scoping by user_id in the WHERE clause (not a separate ownership
        # check after fetching) means a job belonging to another user simply
        # doesn't match -- fetchone() returns None, identical to a job id
        # that doesn't exist at all.
        row = conn.execute(
            f"SELECT {_COLUMNS} FROM jobs WHERE id = ? AND user_id = ?",
            (job_id, user_id),
        ).fetchone()
        return dict(row) if row else None
    finally:
        conn.close()


def create_job(
    user_id: int,
    title: Optional[str],
    company: Optional[str],
    jd_raw_text: str,
    jd_original_filename: Optional[str],
    jd_source_type: str,
) -> dict:
    conn = get_connection()
    try:
        job_id = str(uuid.uuid4())
        now = _now()
        conn.execute(
            """
            INSERT INTO jobs (
                id, user_id, title, company, jd_raw_text, jd_original_filename,
                jd_source_type, status, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, 'saved', ?, ?)
            """,
            (job_id, user_id, title, company, jd_raw_text, jd_original_filename,
             jd_source_type, now, now),
        )
        conn.commit()
    finally:
        conn.close()

    return {
        "id": job_id,
        "user_id": user_id,
        "title": title,
        "company": company,
        "jd_raw_text": jd_raw_text,
        "jd_original_filename": jd_original_filename,
        "jd_source_type": jd_source_type,
        "status": "saved",
        "created_at": now,
        "updated_at": now,
    }


def update_job_status(user_id: int, job_id: str, new_status: str) -> Optional[dict]:
    if new_status not in ALLOWED_STATUSES:
        return None

    conn = get_connection()
    try:
        now = _now()
        cursor = conn.execute(
            "UPDATE jobs SET status = ?, updated_at = ? WHERE id = ? AND user_id = ?",
            (new_status, now, job_id, user_id),
        )
        conn.commit()
        if cursor.rowcount == 0:
            # Either the job doesn't exist, or it belongs to a different
            # user -- both cases are indistinguishable to the caller.
            return None
    finally:
        conn.close()

    return get_job(user_id, job_id)
