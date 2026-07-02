# Task List: Frontend (React UI)

**Source PRD:** `resume-job-match-tracker/PRD.md`
**Scope of this list:** All React components, client-side API calls, and UI state. This workstream consumes the backend API contract documented below and in `tasks-backend.md` — it does not touch any Python/backend files.

**File/module ownership (do not edit outside this list):**
- `frontend/src/api/client.js` (fetch wrapper / API layer)
- `frontend/src/components/**`
- `frontend/src/App.jsx`, `frontend/src/main.jsx`

Every task below should be built against the documented request/response shapes so it can be developed and even manually tested (via a mock/stub of `client.js`, or against a running backend once available) without needing the backend implementer to be online at the same time.

---

## API Contract Recap (full detail in `tasks-backend.md`)

- `POST /api/resume` — multipart, `file` or `text` field → resume object.
- `GET /api/resume` — `200` resume object, or `404 { detail }` if none uploaded yet.
- `POST /api/jobs` — multipart, `jd_file` or `jd_text` (+ optional `title`/`company`) → `201 { job, match_result, match_error }`. `match_result` may be `null` with `match_error` set if LLM analysis failed — **the UI must handle this case explicitly**, not assume `match_result` is always present.
- `GET /api/jobs` — `200` array of `{ id, title, company, status, created_at, updated_at, match_summary: { overall_score, recommendation } | null }`.
- `GET /api/jobs/{id}` — `200 { job, match_result | null }`.
- `PATCH /api/jobs/{id}` — body `{ status }` → `200` updated job object.

`match_result` full shape (all six category keys always present, each an object with `matched`/`missing` string arrays):
```json
{
  "overall_score": 78,
  "recommendation": "apply",
  "recommendation_reasoning": "string",
  "scoring_method_explanation": "string",
  "categories": {
    "hard_skills": { "matched": ["..."], "missing": ["..."] },
    "tools_platforms": { "matched": ["..."], "missing": ["..."] },
    "years_experience": { "matched": ["..."], "missing": ["..."] },
    "certifications": { "matched": ["..."], "missing": ["..."] },
    "soft_skills": { "matched": ["..."], "missing": ["..."] },
    "education": { "matched": ["..."], "missing": ["..."] }
  },
  "suggested_bullets": [ { "target_gap": "string", "suggested_text": "string" } ]
}
```

**Needs Clarification (inherited from `tasks-database.md`):** No confirmed numeric scale for `overall_score` (assumed 0-100) — confirm before hardcoding a percentage display or a "/100" label. No confirmed requirement for `title`/`company` fields — build the job-creation form with them as optional so the UI still works if they're dropped later.

---

## Phase A — Must ship today (the matching engine UI)

### FE-01: App shell, routing, and API client layer
- **Description:** Scaffold the React app (`frontend/src/App.jsx`, `main.jsx`), set up basic client-side routing/view-switching (e.g., an "Add Job / Analyze" view and a "Board" view — a simple state-based toggle is fine, full router library optional), and build `frontend/src/api/client.js`: a thin fetch wrapper with functions `getResume()`, `saveResume(payload)`, `createJob(payload)`, `listJobs()`, `getJob(id)`, `updateJobStatus(id, status)`, each returning parsed JSON and throwing a normalized error object `{ status, detail }` on non-2xx responses.
- **Acceptance Criteria:**
  - App renders a basic shell with placeholders for the two views.
  - `client.js` functions match the exact endpoint paths/methods/payload shapes in the API Contract above.
  - A non-2xx response from any endpoint is surfaced as a catchable JS error with `.status` and `.detail`, not a silent failure.
- **Dependencies:** None — can start immediately; codes against the documented contract, not a live backend.
- **Interfaces/Contracts:** Defines the `client.js` function signatures every other frontend task will import and call.
- **Out of Scope:** Any actual page content (later tasks).
- **Suggested Effort:** S (2 hrs)

### FE-02: Resume upload/paste component
- **Description:** Build a component (e.g., `components/ResumeInput/ResumeInput.jsx`) that, on load, calls `client.getResume()` to check if a resume already exists (show its filename/snippet + an "Replace resume" affordance if so, or an empty upload/paste form if not — per `GET /api/resume`'s documented `404` = "no resume yet" case). Provide a toggle between "paste text" (textarea) and "upload file" (file input), calling `client.saveResume(...)` on submit.
- **Acceptance Criteria:**
  - First-time load with no resume shows an empty-state prompt (not an error, since `404` is an expected response here).
  - Submitting pasted text or a file successfully stores the resume and the component reflects the newly stored state without a full page reload.
  - Re-submitting replaces the prior resume (per FR-12) and UI updates to show the new content/filename.
- **Dependencies:** FE-01. Backend: `tasks-backend.md` BE-02 (`POST/GET /api/resume`) — can be built and demoed against a stubbed `client.js` before BE-02 lands, then pointed at the real backend.
- **Interfaces/Contracts:** Consumes `GET /api/resume` / `POST /api/resume` exactly as documented above.
- **Out of Scope:** PDF/DOCX-specific upload UX (Phase C, FE-10). Any in-app resume *editing* (explicitly out of scope per PRD — display/replace only).
- **Suggested Effort:** M (3 hrs)

### FE-03: Job description input form (new job / "Analyze" flow)
- **Description:** Build a form (e.g., `components/JobDescriptionForm/JobDescriptionForm.jsx`) with optional `title`/`company` text fields and a paste-or-upload toggle for the JD (mirroring FE-02's pattern), submitting via `client.createJob(...)`. On submit, show a loading state (LLM round-trip may take several seconds per PRD's non-functional notes), then hand the response (`{ job, match_result, match_error }`) to FE-04/FE-05 for display.
- **Acceptance Criteria:**
  - Submitting a JD (paste or file) with no resume yet uploaded surfaces the backend's `409` message clearly (e.g., "Upload a resume first").
  - Submitting valid input shows a loading/pending state until the response arrives, then transitions to the results view (FE-04).
  - If `match_result` comes back `null` with `match_error` set, the UI shows the job was saved but analysis failed, with the error message and no crash trying to render a missing `match_result`.
- **Dependencies:** FE-01. Backend: `tasks-backend.md` BE-05 (full `POST /api/jobs` contract).
- **Interfaces/Contracts:** Consumes `POST /api/jobs` exactly as documented; must defensively handle `match_result: null`.
- **Out of Scope:** Kanban placement — a newly created job simply lands in "Saved" status server-side (per BE-03); no special UI needed here beyond showing the result.
- **Suggested Effort:** M (3 hrs)

### FE-04: Match analysis results display
- **Description:** Build a results component (e.g., `components/MatchResultView/MatchResultView.jsx`) rendering: `overall_score`, `recommendation` (apply/do-not-apply, visually distinct), `recommendation_reasoning`, `scoring_method_explanation`, and the six category breakdowns (`hard_skills`, `tools_platforms`, `years_experience`, `certifications`, `soft_skills`, `education`) each showing matched vs. missing lists. Must render sensibly even when some category lists are empty arrays.
- **Acceptance Criteria:**
  - All six categories are always visible with clear matched/missing sections, even if one or more are empty.
  - Recommendation and its reasoning are visually prominent, not buried — per PRD's explicit "not a black box" requirement, the scoring method explanation must also be visible (not hidden behind an extra click, though a collapsible section is fine as long as it's discoverable).
  - Component accepts the exact `match_result` shape from the API Contract as a prop and does not fetch data itself (keeps it reusable for both the "just analyzed" flow and the job-detail view).
- **Dependencies:** FE-01. Consumes data from FE-03 (new job flow) and later FE-06/07 (job detail view in Phase B) — no code dependency on those, only a shared prop shape.
- **Interfaces/Contracts:** Props: `matchResult` (shape above) — consumed identically wherever match results are shown.
- **Out of Scope:** Suggested bullets display (FE-05, separate component for parallel buildability).
- **Suggested Effort:** M (3-4 hrs)

### FE-05: Resume edit suggestions (read-only bullets) component
- **Description:** Build `components/SuggestedBullets/SuggestedBullets.jsx` rendering the `suggested_bullets` array (`target_gap` + `suggested_text` pairs) as a read-only list with a "copy to clipboard" affordance per bullet. Per PRD, these are strictly display-only — no "accept"/"apply to resume" action should exist anywhere in this component.
- **Acceptance Criteria:**
  - Each suggested bullet displays its target gap and the ready-to-paste text.
  - A copy-to-clipboard control works per bullet (or for the whole list) and gives visible confirmation feedback.
  - No UI affordance exists to write a suggestion back into the stored resume — explicitly verify this isn't accidentally implied by button labeling.
- **Dependencies:** FE-01. Same prop-shape relationship to FE-03 as FE-04 has.
- **Interfaces/Contracts:** Props: `suggestedBullets` (array of `{ target_gap, suggested_text }`).
- **Out of Scope:** Any resume mutation — explicitly out of scope per PRD.
- **Suggested Effort:** S (2 hrs)

---

## Phase B — Kanban tracking layer

### FE-06: Kanban board layout + job list fetching
- **Description:** Build `components/KanbanBoard/KanbanBoard.jsx` with five columns (Saved, Applied, Interviewing, Rejected, Offer), fetching all jobs via `client.listJobs()` on mount and grouping them into columns by `status`. Handle the `match_summary: null` case (job exists but has no successful analysis) gracefully on each card.
- **Acceptance Criteria:**
  - All jobs from `GET /api/jobs` render in the correct column based on `status`.
  - A job with `match_summary: null` still renders (e.g., "Analysis unavailable") rather than breaking the column.
  - Board refetches/updates after a status change (see FE-08) without requiring a full page reload.
- **Dependencies:** FE-01. Backend: `tasks-backend.md` BE-06 (`GET /api/jobs`).
- **Interfaces/Contracts:** Consumes `GET /api/jobs` list shape exactly as documented.
- **Out of Scope:** Card visual design details (that's FE-07) and the actual drag interaction (FE-08).
- **Suggested Effort:** M (3 hrs)

### FE-07: Job card component
- **Description:** Build `components/JobCard/JobCard.jsx` displaying `title`/`company` (falling back to a placeholder like "Untitled Job" if both are `null`, per the schema's optional fields), and the match summary attribute (`overall_score` + `recommendation`) as required by PRD FR-10. Clicking a card should open/expand the full detail view (reusing FE-04/FE-05 against `client.getJob(id)`'s response).
- **Acceptance Criteria:**
  - Card always shows a score/recommendation badge when `match_summary` is non-null, and a clear "no analysis" state when it's `null`.
  - Clicking a card fetches and displays the full `match_result` (all six categories + suggested bullets) via FE-04/FE-05, using `GET /api/jobs/{id}`.
- **Dependencies:** FE-01, FE-04, FE-05. Backend: `tasks-backend.md` BE-06 (`GET /api/jobs/{id}`).
- **Interfaces/Contracts:** Consumes the `GET /api/jobs/{id}` shape (`{ job, match_result }`).
- **Out of Scope:** Drag behavior (FE-08).
- **Suggested Effort:** S (2-3 hrs)

### FE-08: Drag-and-drop card movement between columns
- **Description:** Add drag-and-drop to `KanbanBoard`/`JobCard` (library choice left to implementer — e.g., `@dnd-kit` or `react-beautiful-dnd`) so dropping a card in a new column calls `client.updateJobStatus(id, newStatus)`, optimistically updating local state and rolling back on error.
- **Acceptance Criteria:**
  - Dragging a card to a different column moves it visually immediately and persists via `PATCH /api/jobs/{id}`.
  - A failed `PATCH` (e.g., network error) reverts the card to its original column and surfaces an error message.
  - Reloading the page after a move reflects the persisted column (confirms the PATCH actually took effect, not just local state).
- **Dependencies:** FE-06, FE-07. Backend: `tasks-backend.md` BE-07 (`PATCH /api/jobs/{id}`).
- **Interfaces/Contracts:** Consumes `PATCH /api/jobs/{id}` exactly as documented; no new contract introduced.
- **Out of Scope:** Any business rule about which column transitions are "allowed" — per `tasks-backend.md` BE-07, all transitions are permitted.
- **Suggested Effort:** M (3-4 hrs) — drag-and-drop libraries have a learning curve; budget accordingly.

---

## Phase C — Polish (if time remains)

### FE-09: Loading/error state polish across all views
- **Description:** Audit FE-02 through FE-08 for consistent loading spinners, empty states, and error banners (especially around the LLM round-trip in FE-03, which per PRD has no strict latency SLA but should never leave the user staring at a blank screen with no feedback for several seconds).
- **Acceptance Criteria:**
  - Every async call across the app has a visible loading indicator and a visible error state (using the normalized `{ status, detail }` error shape from FE-01).
  - No view can be left in an indefinite blank/frozen state on a slow or failed request.
- **Dependencies:** FE-02 through FE-08.
- **Interfaces/Contracts:** No new contract — UI polish only.
- **Out of Scope:** Retry/backoff logic (that's a backend concern per `tasks-backend.md` BE-04's retry-on-malformed-output; frontend just needs to show the resulting success/failure state).
- **Suggested Effort:** S (2-3 hrs)

### FE-10: File upload edge-case UX
- **Description:** Improve upload UX in FE-02/FE-03 for unsupported file types or extraction failures once `tasks-backend.md` BE-08 (PDF/DOCX support) lands — clear inline messaging for rejected files, a visible upload-in-progress indicator for larger files, and a clear distinction between "wrong file type" vs. "server-side extraction failed" errors (both surfaced by the backend as `400`s with different `detail` text).
- **Acceptance Criteria:**
  - Uploading an unsupported file type shows a specific, actionable message (not a generic "error occurred").
  - Uploading a large file shows progress/pending feedback rather than appearing frozen.
- **Dependencies:** FE-02, FE-03. Backend: `tasks-backend.md` BE-08.
- **Interfaces/Contracts:** No new contract — consumes the same `400` error bodies, differentiated by message text.
- **Out of Scope:** Client-side file parsing/preview — all extraction is server-side.
- **Suggested Effort:** S (2 hrs)
