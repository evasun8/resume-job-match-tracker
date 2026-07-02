"""backend/app/storage/bootstrap.py

Owned by tasks-database.md (DB-01). Provides the shared low-level JSON file
I/O primitives used by resume_store.py, job_store.py, and match_store.py.
Route/service code must never touch these files directly.
"""
import json
import os
import tempfile
from datetime import datetime, timezone
from typing import Any

DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data")

RESUME_PATH = os.path.join(DATA_DIR, "resume.json")
JOBS_PATH = os.path.join(DATA_DIR, "jobs.json")
MATCH_RESULTS_PATH = os.path.join(DATA_DIR, "match_results.json")

SCHEMA_VERSION = 1

# schema_version placement, by file (DB-05):
#
# - resume.json: on-disk shape is either `null` (no resume yet) or a flat
#   resume object (`{"id": "resume", "raw_text": ..., ...}`) written wholesale
#   by resume_store.save_resume(). There is no long-lived "empty object" to
#   attach schema_version to -- the empty default really is `None`. So
#   schema_version is added as a sibling field *inside* the resume object
#   itself in resume_store.save_resume(), not in bootstrap's default.
# - match_results.json: on-disk shape is a dict keyed by job_id. Wrapping it
#   (e.g. {"schema_version": 1, "results": {...}}) would break match_store.py's
#   existing dict-of-job-id API. Instead this module reserves a top-level
#   "schema_version" key inside that same dict (sibling to job_id keys) so the
#   file gets the field without changing the collection's shape.
# - jobs.json: on-disk shape is a bare list. There is no dict to attach a
#   sibling key to, and wrapping it in {"schema_version": 1, "jobs": [...]}
#   would be a breaking shape change to job_store.py's list-based API
#   (list_jobs/get_job/create_job/update_job_status all assume JOBS_PATH's
#   content IS the list). Introducing that wrapper is exactly the kind of
#   migration that DB-05 explicitly marks Out of Scope, so jobs.json is left
#   without a schema_version field for now.
_DEFAULTS = {
    RESUME_PATH: None,
    JOBS_PATH: [],
    MATCH_RESULTS_PATH: {"schema_version": SCHEMA_VERSION},
}

# Expected top-level Python type(s) for each file's parsed JSON content, used
# to detect structurally-corrupt files (valid JSON, but the wrong shape).
# resume.json legitimately parses to either `None` (no resume saved yet) or a
# resume `dict`.
_EXPECTED_TYPES = {
    RESUME_PATH: (dict, type(None)),
    JOBS_PATH: (list,),
    MATCH_RESULTS_PATH: (dict,),
}


def ensure_data_files() -> None:
    """Ensure backend/data/ exists and the three JSON files exist with valid defaults."""
    os.makedirs(DATA_DIR, exist_ok=True)
    for path, default in _DEFAULTS.items():
        if not os.path.exists(path):
            write_json_atomic(path, default)


def _recover_corrupt_file(path: str) -> Any:
    """Back up a corrupt/malformed file and reinitialize it with its empty default.

    Called when `path` either fails to parse as JSON or parses to a value whose
    top-level type doesn't match what callers expect (e.g. jobs.json must be a
    list). Renames the bad file alongside itself as
    `<name>.corrupt.<timestamp>.json`, writes the empty default back to `path`,
    and returns that default so callers see a clean empty state instead of a
    crash (DB-05).
    """
    default = _DEFAULTS.get(path)
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%S")
    directory, filename = os.path.split(path)
    name, ext = os.path.splitext(filename)
    backup_path = os.path.join(directory, f"{name}.corrupt.{timestamp}{ext}")
    try:
        os.replace(path, backup_path)
    except OSError:
        pass
    write_json_atomic(path, default)
    return default


def read_json(path: str) -> Any:
    """Read JSON from path. Returns the documented default if the file is missing.

    If the file exists but is unparsable JSON, or parses to a value whose
    top-level shape doesn't match the expected type for `path` (see
    `_EXPECTED_TYPES`), the bad file is backed up and reinitialized with its
    empty default instead of raising (DB-05 corruption recovery).
    """
    if not os.path.exists(path):
        return _DEFAULTS.get(path)
    with open(path, "r", encoding="utf-8") as f:
        content = f.read().strip()
    if not content:
        return _DEFAULTS.get(path)
    try:
        data = json.loads(content)
    except json.JSONDecodeError:
        return _recover_corrupt_file(path)

    expected_types = _EXPECTED_TYPES.get(path)
    if expected_types is not None and not isinstance(data, expected_types):
        return _recover_corrupt_file(path)

    return data


def write_json_atomic(path: str, data: Any) -> None:
    """Write JSON to path atomically (temp file + os.rename) to avoid partial writes."""
    directory = os.path.dirname(path)
    os.makedirs(directory, exist_ok=True)
    fd, tmp_path = tempfile.mkstemp(dir=directory, prefix=".tmp-", suffix=".json")
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(data, f, indent=2)
        os.rename(tmp_path, path)
    except Exception:
        if os.path.exists(tmp_path):
            os.remove(tmp_path)
        raise
