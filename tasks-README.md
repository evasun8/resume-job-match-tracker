# Resume-JD Match Tracker — Task Breakdown Index

Source PRD: `resume-job-match-tracker/PRD.md`. Three parallel task lists, one per workstream, each independently file-scoped so agents can work simultaneously without merge conflicts:

- **`tasks-database.md`** — JSON file schemas (resume/jobs/match_results) + read/write helper modules under `backend/app/storage/`. Owns the data shape and safe-write mechanics; nothing else touches JSON files directly.
- **`tasks-backend.md`** — FastAPI routes, OpenAI `gpt-4o-mini` match-analysis service, file-upload text extraction. Owns `backend/app/routers/`, `backend/app/services/`, `backend/app/main.py`. Calls into the database list's storage functions only — never touches JSON files itself.
- **`tasks-frontend.md`** — All React UI and the API client layer. Owns `frontend/src/`. Consumes the backend's documented HTTP contract only.

The file-ownership split (storage modules vs. routes vs. UI) is the seam that keeps all three lists conflict-free even when worked concurrently.

## Phasing (per PRD Section 10 — timeline pressure, working version wanted today 2026-07-01)

**Phase A — must ship today (the matching engine, highest value):**
| Task | List | Depends on |
|---|---|---|
| DB-01 Bootstrap + atomic file I/O | database | None |
| DB-02 resume_store.py | database | DB-01 |
| DB-03 job_store.py | database | DB-01 |
| DB-04 match_store.py | database | DB-01 |
| BE-01 FastAPI scaffold + env config | backend | None |
| BE-02 Resume endpoints | backend | BE-01, DB-02 |
| BE-03 Job creation (input + persistence) | backend | BE-01, DB-03 |
| BE-04 LLM match-analysis service | backend | BE-01 |
| BE-05 Wire job creation to LLM + persist | backend | BE-03, BE-04, DB-04 |
| BE-06 Job list/detail endpoints | backend | DB-03, DB-04 |
| FE-01 App shell + API client | frontend | None |
| FE-02 Resume upload/paste UI | frontend | FE-01 (→ BE-02 for live data) |
| FE-03 JD input form | frontend | FE-01 (→ BE-05 for live data) |
| FE-04 Match results display | frontend | FE-01 |
| FE-05 Suggested bullets display | frontend | FE-01 |

**Phase B — kanban tracking layer:**
| Task | List | Depends on |
|---|---|---|
| BE-07 Status update endpoint | backend | DB-03 |
| FE-06 Kanban board + job list fetch | frontend | FE-01 (→ BE-06) |
| FE-07 Job card component | frontend | FE-01, FE-04, FE-05 (→ BE-06) |
| FE-08 Drag-and-drop status moves | frontend | FE-06, FE-07 (→ BE-07) |

**Phase C — polish, if time remains:**
| Task | List | Depends on |
|---|---|---|
| DB-05 Defensive load / corruption recovery | database | DB-01..DB-04 |
| BE-08 PDF/DOCX text extraction | backend | BE-02, BE-03 |
| BE-09 Cross-cutting error handling polish | backend | BE-01..BE-07 |
| FE-09 Loading/error state polish | frontend | FE-02..FE-08 |
| FE-10 File upload edge-case UX | frontend | FE-02, FE-03 (→ BE-08) |

**Tasks that can start immediately, in parallel, right now (no dependencies at all):** DB-01, BE-01, FE-01. Once those three land (each is small, 1-3 hrs), nearly all of Phase A opens up in parallel across all three lists.

## Cross-list interface summary

- Storage interfaces (database → backend): `ensure_data_files()`; `get_resume()`/`save_resume(...)`; `list_jobs()`/`get_job(id)`/`create_job(...)`/`update_job_status(id, status)`; `get_match_result(id)`/`save_match_result(id, data)`/`get_match_summaries()`. Full schemas in `tasks-database.md`.
- HTTP API (backend → frontend): `POST/GET /api/resume`, `POST /api/jobs`, `GET /api/jobs`, `GET /api/jobs/{id}`, `PATCH /api/jobs/{id}`. Full request/response shapes in both `tasks-backend.md` and recapped in `tasks-frontend.md`.

## Open questions / ambiguities flagged during decomposition (need PRD author input)

1. **Job title/company fields:** PRD only requires JD text input (paste or upload); it never mentions capturing a job title or company name. The schema treats these as optional user-entered fields so kanban cards have a readable label. Confirm this is acceptable, or specify whether they should instead be auto-extracted by the LLM from the JD text.
2. **Match score scale:** PRD says "a quantified overall match score" with no stated scale. Schemas/tasks assume 0-100. Confirm before frontend hardcodes a "/100" or percentage display.
3. **LLM failure UX:** Not specified by the PRD what should happen if match analysis fails after retries. This breakdown assumes the job is still saved (so JD input isn't lost) with `match_result: null` and a `match_error` message, viewable/re-triggerable later only as a future consideration (no "retry analysis" endpoint was requested for v1 — flag if wanted, since it would require a new backend task).
4. **Re-running analysis:** Not addressed by the PRD whether match analysis should ever re-run for an existing job (e.g., after the master resume is replaced). Current design treats analysis as a one-time step at job creation; `match_results.json` supports overwrite if this is added later, but no UI/API trigger exists for it in this breakdown.
5. **Job deletion:** Not requested anywhere in the PRD. Intentionally not built in any list — confirm this is fine, since there also isn't a way to remove a mistakenly-created job in v1.
