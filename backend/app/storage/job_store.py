"""PLACEHOLDER implementation of backend/app/storage/job_store.py.

See the ownership note at the top of bootstrap.py — this file belongs to
tasks-database.md's DB-03 and should be reviewed/replaced by that workstream.
"""
import uuid
from datetime import datetime, timezone
from typing import Optional

from app.storage.bootstrap import JOBS_PATH, read_json, write_json_atomic

ALLOWED_STATUSES = {"saved", "applied", "interviewing", "rejected", "offer"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def list_jobs() -> list:
    return read_json(JOBS_PATH) or []


def get_job(job_id: str) -> Optional[dict]:
    for job in list_jobs():
        if job["id"] == job_id:
            return job
    return None


def create_job(
    title: Optional[str],
    company: Optional[str],
    jd_raw_text: str,
    jd_original_filename: Optional[str],
    jd_source_type: str,
) -> dict:
    jobs = list_jobs()
    now = _now()
    job = {
        "id": str(uuid.uuid4()),
        "title": title,
        "company": company,
        "jd_raw_text": jd_raw_text,
        "jd_original_filename": jd_original_filename,
        "jd_source_type": jd_source_type,
        "status": "saved",
        "created_at": now,
        "updated_at": now,
    }
    jobs.append(job)
    write_json_atomic(JOBS_PATH, jobs)
    return job


def update_job_status(job_id: str, new_status: str) -> Optional[dict]:
    if new_status not in ALLOWED_STATUSES:
        return None
    jobs = list_jobs()
    updated_job = None
    for job in jobs:
        if job["id"] == job_id:
            job["status"] = new_status
            job["updated_at"] = _now()
            updated_job = job
            break
    if updated_job is None:
        return None
    write_json_atomic(JOBS_PATH, jobs)
    return updated_job
