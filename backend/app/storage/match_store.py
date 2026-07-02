"""PLACEHOLDER implementation of backend/app/storage/match_store.py.

See the ownership note at the top of bootstrap.py — this file belongs to
tasks-database.md's DB-04 and should be reviewed/replaced by that workstream.
"""
from datetime import datetime, timezone
from typing import Optional

from app.storage.bootstrap import MATCH_RESULTS_PATH, SCHEMA_VERSION, read_json, write_json_atomic

# match_results.json is a dict keyed by job_id, plus a reserved top-level
# "schema_version" key (DB-05) that lives as a sibling of the job_id entries
# rather than in a wrapper object, so the collection's shape stays unchanged.
_SCHEMA_VERSION_KEY = "schema_version"


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def _load_results() -> dict:
    results = read_json(MATCH_RESULTS_PATH) or {}
    results.setdefault(_SCHEMA_VERSION_KEY, SCHEMA_VERSION)
    return results


def get_match_result(job_id: str) -> Optional[dict]:
    results = _load_results()
    return results.get(job_id)


def save_match_result(job_id: str, match_data: dict) -> dict:
    results = _load_results()
    record = dict(match_data)
    record["job_id"] = job_id
    record["generated_at"] = _now()
    results[job_id] = record
    write_json_atomic(MATCH_RESULTS_PATH, results)
    return record


def get_match_summaries() -> dict:
    results = _load_results()
    return {
        job_id: {
            "overall_score": r["overall_score"],
            "recommendation": r["recommendation"],
        }
        for job_id, r in results.items()
        if job_id != _SCHEMA_VERSION_KEY
    }
