# Task List: Database / Persistence (JSON File Storage)

**Source PRD:** `resume-job-match-tracker/PRD.md`
**Scope of this list:** All flat-JSON-file schema design, file locations, and read/write helper modules. This workstream owns the *shape* of data on disk and the low-level functions that read/write it safely. It does NOT own FastAPI routes/request-handling (see `tasks-backend.md`) or any UI (see `tasks-frontend.md`).

**File/module ownership (do not edit outside this list):**
- `backend/app/storage/` (all files: `bootstrap.py`, `resume_store.py`, `job_store.py`, `match_store.py`)
- `backend/data/` (runtime JSON files: `resume.json`, `jobs.json`, `match_results.json`, and any `.bak` files)

Backend route code (`backend/app/routers/*.py`, `backend/app/services/*.py`) must only ever call into `backend/app/storage/*` — never read/write the JSON files directly. This is the seam that keeps this list's files non-overlapping with `tasks-backend.md`.

---

## Canonical Data Schemas (reference for all three task lists)

These shapes are the contract every other task in every list must code against. If a task in another list needs a field that isn't here, that's a signal to flag it, not silently add it.

### `resume.json` — single object (not a list; only one master resume exists at a time)
```json
{
  "id": "resume",
  "raw_text": "string — full resume text, either pasted directly or extracted from an uploaded file",
  "original_filename": "string | null — set if the resume came from a file upload",
  "source_type": "paste | upload",
  "uploaded_at": "ISO-8601 datetime string — first upload time",
  "updated_at": "ISO-8601 datetime string — last replace time"
}
```
If the file is missing/empty, no resume has been uploaded yet — this is a valid, expected state (fresh install).

### `jobs.json` — list of job objects
```json
{
  "id": "uuid4 string",
  "title": "string | null — user-entered, optional (see Needs Clarification below)",
  "company": "string | null — user-entered, optional",
  "jd_raw_text": "string — full JD text, pasted or extracted from upload",
  "jd_original_filename": "string | null",
  "jd_source_type": "paste | upload",
  "status": "saved | applied | interviewing | rejected | offer",
  "created_at": "ISO-8601 datetime string",
  "updated_at": "ISO-8601 datetime string"
}
```

### `match_results.json` — object keyed by `job_id` (1:1 with a job; overwritten if analysis is ever re-run)
```json
{
  "<job_id>": {
    "job_id": "string",
    "generated_at": "ISO-8601 datetime string",
    "overall_score": "number, 0-100",
    "recommendation": "apply | do_not_apply",
    "recommendation_reasoning": "string — free text explaining the recommendation",
    "scoring_method_explanation": "string — free text describing how the score was derived (not a black box)",
    "categories": {
      "hard_skills": { "matched": ["string", "..."], "missing": ["string", "..."] },
      "tools_platforms": { "matched": ["..."], "missing": ["..."] },
      "years_experience": { "matched": ["..."], "missing": ["..."] },
      "certifications": { "matched": ["..."], "missing": ["..."] },
      "soft_skills": { "matched": ["..."], "missing": ["..."] },
      "education": { "matched": ["..."], "missing": ["..."] }
    },
    "suggested_bullets": [
      { "target_gap": "string — which missing item this bullet addresses", "suggested_text": "string — ready-to-paste rewritten bullet point" }
    ]
  }
}
```

**Needs Clarification:** The PRD does not specify whether job `title`/`company` are captured at all (only "JD text via paste or upload" is required). This schema makes them optional, user-entered fields so the kanban card has a human-readable label, but this is an assumption, not a stated requirement — confirm with the PRD author, or accept the fallback of labeling untitled cards as "Job #N" / first line of JD text.

**Needs Clarification:** No numeric scale for "overall match score" is specified in the PRD. This schema assumes 0-100. Confirm before building any UI that renders the number as a percentage vs. a raw score.

---

## Phase A — Must ship today (blocks nearly everything in backend)

### DB-01: Bootstrap data directory and safe file I/O primitives
- **Description:** Create `backend/app/storage/bootstrap.py` with: (a) a function to ensure `backend/data/` exists and create the three JSON files with correct empty defaults if missing (`resume.json` → `null`/absent-file-is-valid, `jobs.json` → `[]`, `match_results.json` → `{}`), and (b) a shared low-level `read_json(path)` / `write_json_atomic(path, data)` helper used by every store module. `write_json_atomic` must write to a temp file in the same directory and `os.rename()` over the target, to avoid partial/corrupted writes if the process is killed mid-write (the PRD explicitly flags "no corruption on normal use" as a reliability requirement).
- **Acceptance Criteria:**
  - Starting the backend with no `backend/data/` directory present results in the directory and all three files being created automatically with valid empty defaults.
  - `write_json_atomic` never leaves the target file truncated/partial even if interrupted (verify via test: kill mid-write or mock rename failure).
  - `read_json` on a missing file returns a documented default (not an exception) for each of the three files.
- **Dependencies:** None — can start immediately.
- **Interfaces/Contracts:** Exposes `ensure_data_files()`, `read_json(path) -> dict|list|None`, `write_json_atomic(path, data) -> None`. Backend tasks BE-02/BE-03/BE-05/BE-06/BE-07 will call `ensure_data_files()` once at app startup (backend owns calling it; this task only owns providing it).
- **Out of Scope:** No route/endpoint code. No schema-specific logic (that's DB-02/DB-03/DB-04).
- **Suggested Effort:** S (2-3 hrs)

### DB-02: `resume_store.py` — resume read/write helpers
- **Description:** Implement `get_resume() -> dict | None` and `save_resume(raw_text: str, original_filename: str | None, source_type: str) -> dict` in `backend/app/storage/resume_store.py`, using the schema above and DB-01's atomic write helper. `save_resume` always overwrites (single master resume; re-upload replaces prior version per FR-12), setting `uploaded_at` only on first creation and always updating `updated_at`.
- **Acceptance Criteria:**
  - `get_resume()` returns `None` when no resume exists yet, and the full resume object otherwise.
  - `save_resume(...)` called twice in a row correctly preserves the original `uploaded_at` and updates `updated_at`.
  - Resulting `resume.json` on disk matches the schema exactly (field names/types).
- **Dependencies:** DB-01.
- **Interfaces/Contracts:** `get_resume()`, `save_resume(raw_text, original_filename, source_type)` — this is the only interface `tasks-backend.md` BE-02 is allowed to call for resume persistence.
- **Out of Scope:** Text extraction from PDF/DOCX (that's a backend concern, BE-08). No HTTP/route code.
- **Suggested Effort:** S (1-2 hrs)

### DB-03: `job_store.py` — job read/write/list/status-update helpers
- **Description:** Implement in `backend/app/storage/job_store.py`: `list_jobs() -> list[dict]`, `get_job(job_id) -> dict | None`, `create_job(title, company, jd_raw_text, jd_original_filename, jd_source_type) -> dict` (generates a uuid4 `id`, sets `status="saved"`, timestamps), and `update_job_status(job_id, new_status) -> dict | None` (validates `new_status` is one of the five allowed values; returns `None` if job not found or status invalid — caller decides how to turn that into an HTTP response).
- **Acceptance Criteria:**
  - `create_job` returns a job object matching the schema exactly, with a fresh unique `id`.
  - `update_job_status` rejects any status string not in `{saved, applied, interviewing, rejected, offer}` without writing to disk.
  - `list_jobs()` returns jobs in a stable order (e.g., insertion order / `created_at` ascending).
- **Dependencies:** DB-01.
- **Interfaces/Contracts:** `list_jobs()`, `get_job(job_id)`, `create_job(...)`, `update_job_status(job_id, new_status)`. This is the only interface `tasks-backend.md` (BE-03, BE-06, BE-07) is allowed to call for job persistence.
- **Out of Scope:** No LLM invocation. No HTTP/route code. No deletion (not required by PRD — flagged, not built).
- **Suggested Effort:** S (2-3 hrs)

### DB-04: `match_store.py` — match result read/write helpers
- **Description:** Implement in `backend/app/storage/match_store.py`: `get_match_result(job_id) -> dict | None` and `save_match_result(job_id, match_data: dict) -> dict`, where `match_data` is expected to already conform to the schema's per-job shape (minus `job_id`/`generated_at`, which this function stamps in). Also implement `get_match_summaries() -> dict[str, dict]` returning `{job_id: {overall_score, recommendation}}` for all jobs with results, to support the lightweight job-list endpoint without shipping full category breakdowns over the wire.
- **Acceptance Criteria:**
  - `save_match_result` overwrites any prior result for the same `job_id` (no history retained — confirmed acceptable since PRD doesn't request re-run history).
  - `get_match_result` returns `None` for a job with no analysis yet (e.g., if LLM call failed at creation time).
  - `get_match_summaries()` output keys match `list_jobs()` job ids exactly for jobs that have results.
- **Dependencies:** DB-01. (Conceptually pairs with DB-03's job ids, but has no code dependency on DB-03.)
- **Interfaces/Contracts:** `get_match_result(job_id)`, `save_match_result(job_id, match_data)`, `get_match_summaries()`. This is the only interface `tasks-backend.md` (BE-04, BE-05, BE-06) is allowed to call for match-result persistence.
- **Out of Scope:** No LLM prompt/response handling (that's BE-04). No HTTP/route code.
- **Suggested Effort:** S (2 hrs)

---

## Phase C — Polish (if time remains)

### DB-05: Defensive load + corruption recovery
- **Description:** Harden `read_json` usage across all three store modules: on a `JSONDecodeError` or a file whose top-level shape doesn't match what's expected (e.g., `jobs.json` isn't a list), back up the bad file to `<name>.corrupt.<timestamp>.json` and reinitialize with the empty default rather than crashing the app. Add a `schema_version` field to each file's default shape (e.g., `"schema_version": 1`) for future migration use, per the PRD's own risk note that JSON storage may need to evolve.
- **Acceptance Criteria:**
  - Manually corrupting any of the three JSON files (truncate, inject invalid JSON) and restarting the backend results in a clean empty state plus a `.corrupt.*` backup file, not a crash.
  - All three files include `schema_version: 1` after DB-01's bootstrap runs.
- **Dependencies:** DB-01, DB-02, DB-03, DB-04.
- **Interfaces/Contracts:** No new public interface; behavior-only hardening of existing functions.
- **Out of Scope:** Actual migration logic between schema versions (not needed until a v2 schema exists).
- **Suggested Effort:** S (2-3 hrs)

---

## Phase D — Multi-tenant support (post-launch: SQLite migration + per-user scoping)

**Scope note:** This phase replaces the flat-JSON storage layer entirely with SQLite, and adds a `users` table that every other table now references. This is the single biggest structural change to this workstream since Phase A — every function signature in `resume_store.py`/`job_store.py`/`match_store.py` gains a `user_id` parameter, and every query gains a `WHERE user_id = ?` clause. Sequential integer/UUID ids alone are no longer sufficient for ownership — a caller must never be able to fetch another user's row by guessing/incrementing an id.

### DB-06: SQLite schema + `users` table + migration of existing stores
- **Description:** Introduce SQLite (via `sqlite3` stdlib or SQLAlchemy — implementer's choice, but must support parameterized queries to prevent SQL injection) with four tables: `users` (`id`, `email` UNIQUE, `password_hash`, `openai_api_key_encrypted` nullable, `created_at`), `resumes`, `jobs`, `match_results` — the latter three carry the same fields as their current JSON-file counterparts, plus a `user_id` foreign key. Rewrite `resume_store.py`/`job_store.py`/`match_store.py`'s public functions to take `user_id` as their first argument and scope every query accordingly (e.g., `get_resume(user_id)`, `list_jobs(user_id)`, `get_job(user_id, job_id)` — fetching a job that exists but belongs to a different `user_id` must behave identically to "not found," never leak existence).
- **Acceptance Criteria:**
  - Two different `user_id`s each creating a resume/job/match result never see each other's data through any store function.
  - Requesting a job by an id that exists but belongs to another user returns the same "not found" result as a genuinely nonexistent id (no distinguishable error/timing that would let a caller enumerate other users' valid ids).
  - All queries are parameterized — no string-formatted SQL anywhere (grep-able confirmation).
  - A one-time migration script moves any existing single-user JSON data (`backend/data/*.json`) into the new SQLite tables under a designated "legacy" user account, so local dev data isn't silently lost.
- **Dependencies:** None structurally, but effectively replaces DB-01 through DB-04 — implementer should treat this as a rewrite, not an addition.
- **Interfaces/Contracts:** New function signatures (`user_id` first arg on every store function) — this is a **breaking change** to the contract `tasks-backend.md` currently codes against; BE-10/BE-11 must update every call site.
- **Out of Scope:** Any ORM abstraction beyond what's needed for parameterized queries + the four tables above. No support for multiple resumes per user (still one master resume, now scoped per `user_id` instead of globally).
- **Suggested Effort:** L (5-7 hrs) — highest-risk task in this phase; every existing call site elsewhere in the app is touched indirectly.
