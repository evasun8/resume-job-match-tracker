# Task List: Backend (FastAPI Routes, LLM Integration, Services)

**Source PRD:** `resume-job-match-tracker/PRD.md`
**Scope of this list:** FastAPI app setup, HTTP routes/request parsing/response shaping, file-upload text extraction, and the OpenAI `gpt-4o-mini` match-analysis service. This workstream owns *behavior* — it must call into the persistence helpers defined in `tasks-database.md` rather than touching JSON files directly, so the two lists never edit the same files.

**File/module ownership (do not edit outside this list):**
- `backend/app/main.py`
- `backend/app/routers/resume.py`, `backend/app/routers/jobs.py`
- `backend/app/services/llm_match.py`, `backend/app/services/text_extraction.py`
- `backend/app/config.py` (env var loading)
- `backend/requirements.txt` (or `pyproject.toml`)

Do not edit anything under `backend/app/storage/` or `backend/data/` — that belongs to `tasks-database.md`. Only call the functions it exposes (`ensure_data_files`, `get_resume`/`save_resume`, `list_jobs`/`get_job`/`create_job`/`update_job_status`, `get_match_result`/`save_match_result`/`get_match_summaries`).

---

## API Contract (reference for `tasks-frontend.md`)

All responses are JSON. Base URL assumed `http://localhost:8000`.

### `POST /api/resume`
- Request: `multipart/form-data` with **either** a `file` field (resume upload) **or** a `text` field (pasted resume) — exactly one must be present.
- Response `200`: the resume object per `tasks-database.md` schema:
  ```json
  { "id": "resume", "raw_text": "...", "original_filename": "resume.pdf", "source_type": "upload", "uploaded_at": "...", "updated_at": "..." }
  ```
- Response `400`: `{ "detail": "Provide either a file or pasted text, not both/neither." }`

### `GET /api/resume`
- Response `200`: resume object (same shape as above).
- Response `404`: `{ "detail": "No resume uploaded yet" }` — frontend should treat this as "show upload prompt," not an error state.

### `POST /api/jobs`
- Request: `multipart/form-data` with `jd_file` (optional file) **or** `jd_text` (optional string) — exactly one required; plus optional `title` and `company` string fields.
- Behavior: extracts JD text, persists the job (`status: "saved"`), synchronously runs LLM match analysis, persists the result, and returns both. **If the LLM call fails after retries, the job is still created and persisted** (so the user's JD input is never lost) — `match_result` is `null` and `match_error` carries a short message.
- Response `201`:
  ```json
  {
    "job": { "id": "...", "title": "...", "company": "...", "status": "saved", "created_at": "...", "updated_at": "..." },
    "match_result": { /* full shape per tasks-database.md, or null */ },
    "match_error": "string | null"
  }
  ```
- Response `400`: `{ "detail": "..." }` for missing/duplicate JD input.
- Response `409`: `{ "detail": "Upload a resume before adding a job" }` if no resume exists yet.

### `GET /api/jobs`
- Response `200`: array of lightweight job summaries (no full match breakdown — keeps the kanban board list cheap):
  ```json
  [
    {
      "id": "...", "title": "...", "company": "...", "status": "applied",
      "created_at": "...", "updated_at": "...",
      "match_summary": { "overall_score": 78, "recommendation": "apply" } | null
    }
  ]
  ```

### `GET /api/jobs/{id}`
- Response `200`:
  ```json
  { "job": { /* full job object */ }, "match_result": { /* full shape, or null */ } }
  ```
- Response `404`: `{ "detail": "Job not found" }`

### `PATCH /api/jobs/{id}`
- Request: `{ "status": "saved" | "applied" | "interviewing" | "rejected" | "offer" }`
- Response `200`: updated job object.
- Response `400`: `{ "detail": "Invalid status value" }`
- Response `404`: `{ "detail": "Job not found" }`

---

## Phase A — Must ship today

### BE-01: FastAPI app scaffold, CORS, env var config
- **Description:** Create `backend/app/main.py` with FastAPI app init, CORS middleware allowing the local React dev origin (e.g. `http://localhost:3000` / `http://localhost:5173`), and `backend/app/config.py` that loads `OPENAI_API_KEY` from an environment variable (via `python-dotenv` or plain `os.environ`) — **never hardcode or log the key**; raise a clear startup error if it's unset. Call `storage.bootstrap.ensure_data_files()` once on startup event.
- **Acceptance Criteria:**
  - `uvicorn app.main:app` starts cleanly with `OPENAI_API_KEY` set in the environment.
  - Starting without `OPENAI_API_KEY` set produces a clear, immediate startup error (not a silent failure on first LLM call).
  - No log line anywhere in the app ever prints the key value (grep-able confirmation).
  - CORS allows the frontend dev origin to call the API.
- **Dependencies:** None — can start immediately. (Calls `ensure_data_files()` from DB-01 once it lands, but can stub that call until then.)
- **Interfaces/Contracts:** N/A (infra task).
- **Out of Scope:** Any actual route logic.
- **Suggested Effort:** S (1-2 hrs)

### BE-02: Resume endpoints (`POST /api/resume`, `GET /api/resume`)
- **Description:** Implement `backend/app/routers/resume.py` per the API Contract above. Text extraction: Phase A only needs plain pasted text and `.txt` file uploads to work; PDF/DOCX extraction is explicitly deferred to BE-08 (Phase C) — for Phase A, a non-`.txt` upload can return a clear `400` ("Unsupported file type in Phase A; paste text instead") rather than attempting extraction.
- **Acceptance Criteria:**
  - Pasting resume text via `POST /api/resume` (`text` field) persists and is retrievable via `GET /api/resume`.
  - Uploading a `.txt` resume file works identically.
  - Re-uploading replaces the previous resume (per FR-12) and `GET /api/resume` reflects the new content.
  - `GET /api/resume` before any upload returns `404` with the documented body.
- **Dependencies:** BE-01; DB-02 (`resume_store.py`).
- **Interfaces/Contracts:** Implements the `POST/GET /api/resume` contract above exactly — this is what `tasks-frontend.md` FE-02 codes against.
- **Out of Scope:** PDF/DOCX parsing (BE-08).
- **Suggested Effort:** M (3-4 hrs)

### BE-03: Job creation endpoint — input handling + persistence (no LLM yet)
- **Description:** Implement the request-parsing and persistence half of `POST /api/jobs` in `backend/app/routers/jobs.py`: validate exactly one of `jd_text`/`jd_file` is present, extract JD text (same `.txt`-only constraint as BE-02 for Phase A), verify a resume exists (409 if not), and call `job_store.create_job(...)`. Leave a clear seam (e.g., a function call to `llm_match.analyze(...)`) for BE-04/BE-05 to plug into — do not block on the LLM service existing yet; stub it to return `None` if not yet implemented so this task is independently testable.
- **Acceptance Criteria:**
  - Posting a JD with no resume uploaded returns `409` with the documented body.
  - Posting valid JD text creates a job record via `job_store.create_job` with `status: "saved"`.
  - Posting neither/both of `jd_text`/`jd_file` returns `400`.
- **Dependencies:** BE-01; DB-03 (`job_store.py`).
- **Interfaces/Contracts:** Produces the `job` portion of the `POST /api/jobs` response shape.
- **Out of Scope:** LLM invocation (BE-04), final combined response wiring (BE-05).
- **Suggested Effort:** M (2-3 hrs)

### BE-04: LLM match-analysis service (`services/llm_match.py`)
- **Description:** Build the OpenAI `gpt-4o-mini` integration. Construct a prompt (or use function-calling/JSON-mode structured output) that takes `resume_text` + `jd_text` and returns data matching the `match_results.json` per-job shape (minus `job_id`/`generated_at`): `overall_score`, `recommendation`, `recommendation_reasoning`, `scoring_method_explanation`, `categories` (all six: hard_skills, tools_platforms, years_experience, certifications, soft_skills, education — each with `matched`/`missing` arrays), and `suggested_bullets`. Use OpenAI's structured/JSON-mode response feature to keep parsing reliable (per PRD's explicit call-out). Validate the parsed response against the expected shape (e.g., with a Pydantic model); on validation failure or malformed JSON, retry once with a corrective follow-up prompt before giving up and raising a typed exception the router can catch.
- **Acceptance Criteria:**
  - Given a sample resume + JD, `analyze(resume_text, jd_text)` returns a dict matching the schema exactly (all six categories present even if some are empty lists).
  - A deliberately malformed/truncated mock LLM response triggers one retry, then a typed exception (e.g., `MatchAnalysisError`) if still invalid — not an unhandled crash.
  - The OpenAI API key is read only via `config.py` (BE-01) and never appears in any exception message or log line.
  - `overall_score` is validated as a number in `[0, 100]` (or the schema's documented range) before being accepted.
- **Dependencies:** BE-01 (for API key config). Does not depend on DB tasks directly (it returns plain data; BE-05 handles persistence).
- **Interfaces/Contracts:** Exposes `analyze(resume_text: str, jd_text: str) -> dict` (schema above) and raises `MatchAnalysisError(str)` on unrecoverable failure. This is the exact interface BE-05 calls.
- **Out of Scope:** No persistence (that's BE-05 + DB-04). No route/HTTP code.
- **Suggested Effort:** L (4-6 hrs) — the highest-risk task in this list; budget extra time for prompt iteration.

### BE-05: Wire job creation to LLM + persist match result
- **Description:** Connect BE-03's job creation flow to BE-04's `analyze()` and DB-04's `match_store.save_match_result`. On success, persist the result and return it in the `201` response. On `MatchAnalysisError`, still return `201` with the job (already persisted per BE-03) but `match_result: null` and `match_error: "<message>"` — per the API Contract's explicit "never lose the user's JD input on LLM failure" behavior.
- **Acceptance Criteria:**
  - A successful analysis produces a `201` response containing both `job` and a fully-populated `match_result`, and `match_results.json` (via DB-04) reflects it.
  - A forced LLM failure (e.g., invalid API key in a test env) still returns `201` with `match_result: null` and a non-empty `match_error`, and the job is retrievable afterward via `GET /api/jobs/{id}`.
- **Dependencies:** BE-03, BE-04; DB-04 (`match_store.py`).
- **Interfaces/Contracts:** Completes the full `POST /api/jobs` contract as documented above — this is what `tasks-frontend.md` FE-03/FE-04/FE-05 code against.
- **Out of Scope:** Retry-from-UI (user re-triggering analysis for an existing job) — not requested by PRD; flag as a future consideration if wanted.
- **Suggested Effort:** M (2-3 hrs)

### BE-06: Job list + detail endpoints (`GET /api/jobs`, `GET /api/jobs/{id}`)
- **Description:** Implement per the API Contract, using `job_store.list_jobs()`/`get_job()` and `match_store.get_match_summaries()`/`get_match_result()` to assemble the lightweight list response and the full detail response respectively.
- **Acceptance Criteria:**
  - `GET /api/jobs` returns all jobs with `match_summary` populated for jobs that have a result and `null` for jobs whose analysis failed or is pending.
  - `GET /api/jobs/{id}` returns the full job + full match result (all six categories, reasoning, method explanation, suggested bullets), or `match_result: null` if none exists.
  - `GET /api/jobs/{unknown-id}` returns `404`.
- **Dependencies:** DB-03, DB-04.
- **Interfaces/Contracts:** Implements the `GET /api/jobs` and `GET /api/jobs/{id}` contracts above — consumed by `tasks-frontend.md` FE-06/FE-07 (list) and FE-04/FE-05 (detail).
- **Out of Scope:** Filtering/sorting/pagination — not requested for tens-to-low-hundreds of records.
- **Suggested Effort:** S (2 hrs)

---

## Phase B — Tracking layer

### BE-07: Job status update endpoint (`PATCH /api/jobs/{id}`)
- **Description:** Implement per the API Contract using `job_store.update_job_status`, to support kanban drag-and-drop moving a card between columns.
- **Acceptance Criteria:**
  - Valid status transition updates the job and returns the updated object.
  - Invalid status string returns `400` without mutating stored data.
  - Unknown job id returns `404`.
- **Dependencies:** DB-03.
- **Interfaces/Contracts:** Implements `PATCH /api/jobs/{id}` — consumed by `tasks-frontend.md` FE-08 (drag-and-drop).
- **Out of Scope:** Any notion of valid/invalid column *transitions* (e.g., disallowing Rejected → Saved) — PRD doesn't specify transition rules; any status may move to any other status.
- **Suggested Effort:** S (1-2 hrs)

---

## Phase C — Polish (if time remains)

### BE-08: PDF/DOCX text extraction for resume and JD uploads
- **Description:** Extend `services/text_extraction.py` (new) to extract text from `.pdf` (e.g., via `pdfplumber` or `pypdf`) and `.docx` (via `python-docx`) uploads, replacing the Phase A `.txt`-only restriction in BE-02 and BE-03. On extraction failure (corrupt/unsupported file), return a clear `400` rather than silently sending garbled text to the LLM.
- **Acceptance Criteria:**
  - A sample PDF and a sample DOCX resume/JD both extract readable text end-to-end through `POST /api/resume` and `POST /api/jobs`.
  - A corrupted/empty file upload returns a `400` with a clear message instead of proceeding to LLM analysis with empty text.
- **Dependencies:** BE-02, BE-03.
- **Interfaces/Contracts:** No change to response shapes — purely extends accepted input formats.
- **Out of Scope:** OCR of scanned/image-based PDFs.
- **Suggested Effort:** M (3-4 hrs)

### BE-09: Cross-cutting error handling & validation polish
- **Description:** Add a FastAPI exception handler for `MatchAnalysisError` and generic unhandled exceptions that returns consistent `{ "detail": "..." }` bodies (never a raw stack trace), request size limits on uploads, and input validation (e.g., reject empty pasted text) across all endpoints in this list.
- **Acceptance Criteria:**
  - Every error response across all endpoints follows the `{ "detail": "..." }` shape.
  - An oversized upload (define a sane limit, e.g., 5MB) is rejected with `413` or `400` rather than hanging or crashing.
  - No stack trace or internal exception detail ever reaches the client response body.
- **Dependencies:** BE-01 through BE-07.
- **Interfaces/Contracts:** Tightens (does not change) existing response shapes.
- **Out of Scope:** Rate limiting / auth (not applicable — no multi-user, no hosting).
- **Suggested Effort:** S (2-3 hrs)

---

## Phase D — Multi-tenant support (post-launch: auth + per-user scoping)

**Scope note:** Every endpoint from Phase A/B/C above (`/api/resume`, `/api/jobs`, `/api/jobs/{id}`) must be retrofitted to (a) require a valid JWT and (b) pass the authenticated `user_id` into every `tasks-database.md` store call (per DB-06's new signatures). This phase is intentionally hand-built rather than delegated wholesale to a subagent — auth is the part of this app most likely to have a real security consequence if gotten wrong.

### BE-10: Auth endpoints — signup, login, dual-token issuance (access + refresh)
- **Decision (2026-07-11, revised):** Adopting the full production-grade hybrid pattern instead of a single long-lived cookie: a **short-lived access token (15 min)** returned in the JSON response body — the frontend keeps it in memory only (React state/context), never `localStorage` — plus a **long-lived refresh token (7 days)** set as an **httpOnly, SameSite=Lax cookie**, used only to mint new access tokens via a silent-refresh endpoint. Rationale: an access token stolen via XSS is now dead within 15 minutes (small blast radius) instead of 24 hours; the refresh token itself is never exposed to JS at all. This is more code than a single cookie (see BE-11's refresh endpoint and `tasks-frontend.md` FE-12's refresh interceptor) but matches real-world production practice, which was the explicit goal. Flag for end-of-project retrospective alongside the original single-cookie discussion this superseded.
- **Description:** New `backend/app/routers/auth.py`: `POST /api/auth/signup` (`{email, password}` → creates a user row via a new `user_store.py` in the database list, hashes the password with `bcrypt`/`passlib` — **never store or log a plaintext password**). `POST /api/auth/login` (`{email, password}` → verifies hash, returns `{access_token, expires_in: 900}` in the JSON body **and** sets `Set-Cookie: refresh_token=<jwt>; HttpOnly; SameSite=Lax; Secure (prod only); Path=/api/auth`). Two separate JWTs, both signed with `JWT_SECRET`: access token payload `{sub: user_id, type: "access", exp: <15 min>}`, refresh token payload `{sub: user_id, type: "refresh", exp: <7 days>}` — the `type` claim matters, since BE-11's endpoints must reject a refresh token presented as an access token and vice versa. `POST /api/auth/logout` clears the refresh cookie. Add `JWT_SECRET` to `config.py`'s env-var loading (same never-log-the-secret discipline as `OPENAI_API_KEY`).
- **Acceptance Criteria:**
  - Signing up with an email already in use returns a clear `409`, not a generic `500`.
  - Logging in with a wrong password returns `401` with a generic "invalid credentials" message (must not reveal whether the email exists).
  - Login response body contains `access_token` (JWT, `type: "access"`, ~15 min expiry); `Set-Cookie` header carries the refresh token with `HttpOnly`/`SameSite=Lax` and is scoped to `Path=/api/auth` (narrower than the whole site, since only the refresh endpoint needs it).
  - The refresh token is never present in any JSON response body; the access token is never set as a cookie.
  - Password hashes in the database are never plain/reversible (verify via direct DB inspection in a test).
- **Dependencies:** DB-06 (`users` table + a new `user_store.py` exposing `create_user(email, password_hash)`, `get_user_by_email(email)`).
- **Interfaces/Contracts:** Defines `POST /api/auth/signup`, `POST /api/auth/login`, `POST /api/auth/logout` — this is what `tasks-frontend.md` FE-11 codes against.
- **Out of Scope:** Password reset / email verification flows (not required for a personal-scale app; flag as a future consideration). Refresh token rotation/reuse-detection (a further hardening step some production systems add — noted as a possible future enhancement, not built now).
- **Suggested Effort:** M (4-5 hrs) — slightly larger than a single-token design due to two JWT types and the `type` claim discipline.

### BE-11: Auth dependency (access-token verification) + silent-refresh endpoint + retrofit ownership checks
- **Description:** Build a FastAPI dependency (e.g., `get_current_user_id`) that reads the access token from the `Authorization: Bearer <token>` header (not a cookie — the access token lives in frontend memory and is attached manually, unlike the refresh token), verifies signature + expiry + `type == "access"`, and returns the `user_id` from `sub` — raising `401` on any missing/invalid/expired/wrong-type token. Add this dependency to **every** existing route in `resume.py` and `jobs.py`, threading `user_id` into DB-06's scoped store calls. New `POST /api/auth/refresh`: reads the refresh cookie, verifies signature + expiry + `type == "refresh"`, and if valid, issues a **new** access token in the response body (same shape as login) — this is what `tasks-frontend.md` FE-12's silent-refresh flow calls. Add `GET /api/auth/me` (requires a valid access token; returns current user's basic info) for FE-11's app-load check. **Update CORS config from BE-01**: `allow_credentials=True`, `allow_origins` listing the frontend's exact dev origin (required for the refresh cookie to flow cross-port in local dev).
- **Acceptance Criteria:**
  - Calling any protected endpoint with no/expired/tampered/wrong-type access token returns `401` uniformly.
  - `POST /api/auth/refresh` with a valid refresh cookie returns a fresh access token; with an expired/missing/tampered refresh cookie, returns `401` (forcing a full re-login).
  - A refresh token cannot be used directly as an access token on a protected endpoint, and vice versa (the `type` claim check is actually enforced, not just documented).
  - Two logged-in users each see only their own data end-to-end through the live API.
  - A cross-origin refresh request from the frontend dev server successfully includes the cookie once CORS is configured correctly (verify via browser Network tab, not curl).
- **Dependencies:** BE-10, DB-06.
- **Interfaces/Contracts:** Every existing endpoint now requires `Authorization: Bearer <access_token>` (attached by `tasks-frontend.md` FE-12's request wrapper, refreshed automatically on 401 via the new `/api/auth/refresh`). Adds `GET /api/auth/me`, `POST /api/auth/refresh`.
- **Out of Scope:** Refresh token rotation (issuing a new refresh token on every use) — noted in BE-10 as a further-hardening future step.
- **Suggested Effort:** M (4-5 hrs) — the refresh endpoint and `type`-claim checks are new surface area beyond a single-token design; each retrofitted endpoint is still a place a mistake could leak another user's data, so budget careful review time.

### BE-12: Per-user OpenAI API key storage + settings endpoint
- **Description:** New `PATCH /api/auth/me` (or `PUT /api/settings`) accepting `{openai_api_key}`, encrypting it before storing in the `users.openai_api_key_encrypted` column (e.g., via `cryptography`'s `Fernet` with a key from a new `ENCRYPTION_KEY` env var — distinct from `JWT_SECRET`), and a `GET` that returns only a masked confirmation (e.g., `"sk-...abcd"`), never the full key. Update `llm_match.analyze(...)` and `jd_url_extract.extract_job_fields(...)` (both currently reading the single global `OPENAI_API_KEY`) to accept and use the calling user's decrypted key instead, falling back to a clear `400`/`402`-style error ("Add your OpenAI API key in Settings") if the user hasn't set one — no silent fallback to a shared/default key.
- **Acceptance Criteria:**
  - A user's key is never returned in full via any API response, log line, or error message after initial submission.
  - Submitting a job for analysis without having set a personal key returns a clear, actionable error rather than failing with an unrelated OpenAI auth error or silently using someone else's key.
  - Two users with different keys each get billed (via OpenAI's own usage dashboard) only for their own analyses — verify by checking the `Authorization` header sent to OpenAI's API differs per user in a test/mock.
- **Dependencies:** BE-10, BE-11, DB-06.
- **Interfaces/Contracts:** New `PATCH /api/auth/me` / `GET /api/auth/me` — consumed by `tasks-frontend.md` FE-13 (settings page). Changes `llm_match.analyze`'s signature to accept an `api_key` parameter instead of reading the module-level config constant.
- **Out of Scope:** Any billing/usage-metering UI on our side (OpenAI's own dashboard is the source of truth for each user's spend).
- **Suggested Effort:** M (3 hrs)

### BE-13: Unit + integration tests for auth and multi-tenant scoping
- **Description:** Add `backend/tests/` (pytest) covering: (a) **unit-level** — `user_store.create_user`/`get_user_by_email` against a temp SQLite DB, password hashing round-trip (hash → verify succeeds, verify fails on wrong password), JWT encode/decode (valid token decodes to correct `user_id`, expired token raises, tampered signature raises); (b) **integration-level**, using FastAPI's `TestClient` against a real (temporary, per-test-run) SQLite DB — signup → login → use returned token to call a protected endpoint succeeds; missing/expired/tampered token on any protected endpoint returns `401`; and the critical multi-tenant test: **two users, two tokens, each creates a resume/job — assert User A's token can never read, list, or mutate User B's data, for every endpoint** (this single test class is the most important test in this entire phase).
- **Acceptance Criteria:**
  - Test suite runs via a single command (e.g., `pytest backend/tests/`) with no manual setup beyond `pip install -r requirements.txt`, using an isolated test database (never touches real `backend/data/`).
  - The cross-user isolation test explicitly asserts `403`/`404` (not `200` with someone else's data) for every existing endpoint from Phase A/B, not just a couple of examples.
  - Running the suite twice in a row produces identical results (no state leakage between test runs — temp DB is created fresh per run or per test).
- **Dependencies:** BE-10, BE-11, BE-12, DB-06.
- **Interfaces/Contracts:** No new API surface — pure verification of BE-10/BE-11/BE-12's existing contracts.
- **Out of Scope:** Load/performance testing, fuzzing. Frontend E2E tests are `tasks-frontend.md` FE-15.
- **Suggested Effort:** M (3-4 hrs) — worth the investment given how costly a missed cross-user leak would be.
