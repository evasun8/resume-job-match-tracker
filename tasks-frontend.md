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

---

## Phase D — Multi-tenant support (post-launch: auth UI + per-user settings)

**Scope note:** FE-11 and FE-12 are security-adjacent (in-memory access-token state, silent refresh on load, auto-refresh-on-401 with concurrency-safe single-flight logic) and should be built hands-on rather than delegated, since a mistake here (e.g., persisting the access token where it shouldn't live, or a refresh race condition) is a real vulnerability or a real bug class, not just a visual bug. FE-13 and FE-14 are close to pure UI scaffolding (form layout, styling) and are good candidates to hand to a frontend-focused agent once FE-11/FE-12 establish the pattern to follow.

### FE-11: Login / signup pages + in-memory access-token state — **build by hand**
- **Decision (2026-07-11, revised):** Adopting the full hybrid pattern: the **access token lives only in memory** (React Context state — a plain JS variable, never `localStorage`, never a cookie), and is lost on tab close/full reload by design. The **refresh token is an httpOnly cookie** the frontend never touches directly — see `tasks-backend.md` BE-10's decision note for the full rationale. This supersedes the earlier single-cookie plan; flag both for the end-of-project retrospective as a "here's how the design evolved" story.
- **Description:** Build `components/Auth/LoginForm.jsx` and `SignupForm.jsx` (email/password fields, calling `client.login(...)`/`client.signup(...)` against `tasks-backend.md` BE-10). Build a top-level `AuthContext` holding `{accessToken, currentUser, isAuthenticated}` purely in memory. On `login()`/`signup()` success, store the returned `access_token` into this context state (never persisted anywhere else). On **app load/reload** (where memory is empty since it was never persisted), attempt a **silent refresh**: call `POST /api/auth/refresh` (browser auto-sends the refresh cookie) — if it succeeds, populate a fresh access token into context and the user is transparently still logged in; if it 401s, the user is logged out and sees the login page. This silent-refresh-on-load call is the mechanism that makes "logged in across reloads" work despite the access token never being persisted.
- **Acceptance Criteria:**
  - Signing up then logging in transitions the app from a logged-out to logged-in state without a full page reload.
  - **Refreshing the browser after login preserves the logged-in state** — verify this specifically exercises the silent-refresh-on-load path (add a temporary console log or breakpoint to confirm `/api/auth/refresh` actually fires on load, not just that the UI happens to look logged in).
  - Logging out calls `POST /api/auth/logout` (clears the refresh cookie server-side) and clears the in-memory access token, returning the app to a logged-out state.
  - Submitting wrong credentials shows the backend's generic "invalid credentials" message.
  - DevTools confirms: the access token is nowhere in `localStorage`/`sessionStorage`/cookies (only in React state, invisible to any storage inspector); the refresh cookie is marked `HttpOnly`.
- **Dependencies:** FE-01. Backend: `tasks-backend.md` BE-10, BE-11 (`/api/auth/refresh`, `/api/auth/me`).
- **Interfaces/Contracts:** Adds `login(email, password)`, `signup(email, password)`, `logout()`, `refreshAccessToken()`, `getCurrentUser()` to `client.js`. `refreshAccessToken()` is the function FE-12's interceptor calls.
- **Out of Scope:** "Remember me" / persistent-vs-session distinction, password reset UI.
- **Suggested Effort:** M (4 hrs) — the silent-refresh-on-load flow is a new concept beyond FE-11's originally-scoped work.

### FE-12: Attach access token to every API call + auto-refresh-on-401 interceptor — **build by hand**
- **Description:** Update `client.js`'s shared low-level fetch wrapper to attach `Authorization: Bearer <accessToken>` (read from FE-11's in-memory context) to every request, and set `credentials: 'include'` (still needed so the refresh cookie flows to `/api/auth/refresh` specifically). Build a **401-response interceptor**: on any `401`, before giving up, call `refreshAccessToken()` once — if it succeeds, retry the original request with the new token; if the refresh itself 401s, log the user out and redirect to login. **Handle the concurrency edge case explicitly**: if multiple API calls are in-flight when the access token expires, they'll all hit 401 near-simultaneously — the interceptor must ensure only **one** refresh call happens (e.g., a shared in-flight promise other callers await instead of each independently calling `/api/auth/refresh`), not one refresh attempt per failed request.
- **Acceptance Criteria:**
  - Every existing API call (resume, jobs, URL-fetch, status update) continues to work end-to-end for a logged-in user with zero change to any calling component's code — only the shared low-level fetch wrapper changes.
  - Visiting the app while logged out (and silent refresh also fails) shows the login page, not a broken/empty board.
  - Manually forcing an access token to be expired/invalid, then making an API call, transparently triggers a refresh + retry — the calling component never sees a 401, the request just succeeds after a brief delay.
  - **Concurrency test:** trigger several API calls simultaneously with an expired access token (e.g., load a view that fires 3+ requests at once) and confirm via Network tab that `/api/auth/refresh` is called exactly once, not 3+ times.
  - If the refresh token itself is expired (7+ days idle), the interceptor logs out and redirects cleanly rather than looping or hanging.
- **Dependencies:** FE-11. Backend: `tasks-backend.md` BE-11 (`Authorization` header validation, `/api/auth/refresh`, CORS credentials config).
- **Interfaces/Contracts:** Modifies `client.js`'s shared fetch internals — no signature changes for calling components.
- **Out of Scope:** Per-route granular permissions (not applicable). Refresh token rotation (noted in BE-10 as a future hardening step).
- **Suggested Effort:** M (4-5 hrs) — the concurrency-safe single-flight refresh logic is the trickiest piece of this entire phase; budget real debugging time here, this is where subtle race-condition bugs live in real production auth code too.

### FE-13: Settings page — OpenAI API key entry — *candidate for frontend agent*
- **Description:** Build `components/Settings/SettingsPage.jsx` — a form for entering/updating the user's personal OpenAI API key, calling `tasks-backend.md` BE-12's `PATCH /api/auth/me`, displaying the masked confirmation from `GET /api/auth/me` if a key is already set. Should clearly explain *why* the key is needed (usage is billed to the user's own OpenAI account) so it doesn't feel like an arbitrary form field.
- **Acceptance Criteria:**
  - Saving a key shows a masked confirmation (e.g., "Key ending in ...abcd saved"), never echoes the full key back into the DOM/state after submission.
  - Attempting to submit a job for analysis with no key set surfaces BE-12's actionable error message, with a link/button to the Settings page.
- **Dependencies:** FE-11, FE-12. Backend: `tasks-backend.md` BE-12.
- **Interfaces/Contracts:** Adds `getSettings()`, `updateApiKey(key)` to `client.js`.
- **Out of Scope:** Any other user preferences beyond the API key (nothing else is scoped for a settings page yet).
- **Suggested Effort:** S (2 hrs)

### FE-14: Signup/login form styling + empty/loading states — *candidate for frontend agent*
- **Description:** Visual polish pass on FE-11's forms and FE-13's settings page — consistent styling with the rest of the app (shadcn/ui-style components, matching existing `Alert`/loading-spinner patterns from FE-09), responsive layout, accessible form labels/error states.
- **Acceptance Criteria:**
  - Auth and settings pages visually match the rest of the app's existing component library and spacing conventions.
  - All forms have visible loading states during submission and accessible error messaging (matches the pattern audited in FE-09).
- **Dependencies:** FE-11, FE-13.
- **Interfaces/Contracts:** No new contract — pure presentation layer on top of FE-11/FE-13's logic.
- **Out of Scope:** Any behavior/logic changes — this task is strictly visual.
- **Suggested Effort:** S (2 hrs)

### FE-15: E2E auth flow tests + update existing specs for auth — **build by hand**
- **Description:** Extend the Playwright suite (`frontend/e2e/`) with `auth.spec.js`: signup → login → land on the authenticated app view; wrong password shows the error state; logging out returns to the login page; visiting the app while logged out redirects to login instead of showing a broken board. Then update every existing spec (`resume-upload.spec.js`, `jd-submission.spec.js`, `match-result-display.spec.js`, `kanban-board.spec.js`) to log in as a seeded mock user first (via a shared `helpers.js` addition, e.g. `loginAsMockUser(page)`), since every one of them now depends on an authenticated session once FE-12 lands. Update `frontend/src/api/mock.js` to simulate the new auth endpoints (`login`/`signup`/token validation) consistently with the existing mock conventions (magic-substring failures, seeded fixture data).
- **Acceptance Criteria:**
  - `npm test` passes fully with zero backend/network dependency, same as today — the mock API layer covers auth the same way it covers everything else.
  - Every pre-existing spec still passes after being updated to authenticate first — confirms FE-12's auth-attachment change didn't silently break any prior flow.
  - The new `auth.spec.js` covers both the happy path and at least one failure path (wrong credentials, logged-out redirect).
- **Dependencies:** FE-11, FE-12. All four existing spec files.
- **Interfaces/Contracts:** No new contract — verification only, plus the `mock.js` additions FE-11/FE-12 already depend on for local dev.
- **Out of Scope:** Testing the real (non-mock) backend end-to-end — covered instead by `tasks-backend.md` BE-13's integration tests.
- **Suggested Effort:** M (3 hrs)
