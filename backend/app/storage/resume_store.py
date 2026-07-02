"""PLACEHOLDER implementation of backend/app/storage/resume_store.py.

See the ownership note at the top of bootstrap.py — this file belongs to
tasks-database.md's DB-02 and should be reviewed/replaced by that workstream.
"""
from datetime import datetime, timezone
from typing import Optional

from app.storage.bootstrap import RESUME_PATH, SCHEMA_VERSION, read_json, write_json_atomic


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def get_resume() -> Optional[dict]:
    data = read_json(RESUME_PATH)
    if not data:
        return None
    return data


def save_resume(raw_text: str, original_filename: Optional[str], source_type: str) -> dict:
    existing = get_resume()
    uploaded_at = existing["uploaded_at"] if existing else _now()
    resume = {
        "id": "resume",
        "schema_version": SCHEMA_VERSION,
        "raw_text": raw_text,
        "original_filename": original_filename,
        "source_type": source_type,
        "uploaded_at": uploaded_at,
        "updated_at": _now(),
    }
    write_json_atomic(RESUME_PATH, resume)
    return resume
