# Resume-JD Match Tracker — Product Requirements Document

## 1. Title & Overview

**Project name:** Resume-JD Match Tracker *(working title — rename as you like)*

**Summary:** A personal, local-only web application that helps a single user (the requester) manage their active job search. It combines a kanban-style application tracker with an LLM-powered analysis feature that compares the user's resume against a given job description, producing a quantified match score, a breakdown of matched vs. missing requirements (skills, tools, experience, certifications, education, soft skills), an apply/no-apply recommendation with visible reasoning, and concrete rewritten resume bullet-point suggestions. The tool is being built to diagnose and improve a currently low application response rate, which the user suspects is linked to poor resume-to-JD alignment.

## 2. Problem Statement

The user is actively applying to a high volume of jobs and experiencing a low response rate. They suspect that a meaningful contributor is poor alignment between their resume and each job's stated requirements, but currently have no structured way to measure that alignment, diagnose specific gaps, or decide — with evidence — whether a given role is worth applying to. They also lack a single place to track the status of each application (today: no existing tool or spreadsheet is in use).

## 3. Goals & Success Metrics

- **Primary goal:** Improve the user's application response rate by surfacing concrete, actionable resume-to-JD gaps before they apply.
- **Secondary goal:** Consolidate job application tracking into a single tool (replacing ad hoc/no tracking).
- **Success looks like:** After several weeks of use, the user reports an improved response rate on applications where they acted on the tool's match analysis and edit suggestions, and has a single up-to-date view of all active applications instead of mentally tracking them.
- *Assumption: There is no fixed numeric response-rate target (e.g., "+10%") — success is directional improvement plus adoption (the user actually uses it for each application). Flag if a specific target is wanted.*

## 4. Target Users & Personas

- **Single persona:** The requester themselves — an individual actively job hunting, applying to a high volume of roles, technical enough to run a locally-hosted React + FastAPI app and hold an OpenAI API key.
- No other users, stakeholders, or shared/collaborative access are in scope. No auth or multi-tenancy is required.

## 5. Scope

### In Scope (v1 / MVP)

1. **Application tracker (kanban board)**
   - Columns: Saved, Applied, Interviewing, Rejected, Offer.
   - Each job is a card the user can move between columns.
   - Each card displays the job's match score/recommendation as a summary attribute.
2. **Job/resume input**
   - One master resume, uploaded once, matched against every job description (no multi-version resume tracking).
   - Job description input via manual paste of text OR file upload (no URL scraping/auto-fetch in v1).
3. **LLM-powered match analysis** (via OpenAI API, model `gpt-4o-mini`)
   - Parses the JD for requirements across all categories: hard/technical skills, tools/platforms, years of experience, certifications, soft skills, and education.
   - Compares against the master resume and produces:
     - A quantified overall match score.
     - A list of matched skills/requirements (present in resume).
     - A list of missing skills/requirements (in JD, absent from resume).
     - An apply / do-not-apply recommendation.
     - Visible reasoning for the recommendation (why it's recommending apply or not) and a plain description of the method used to arrive at the score (i.e., not a black box).
4. **Resume edit suggestions**
   - Concrete, ready-to-paste rewritten resume bullet points targeting the gaps identified for that specific JD.
   - Display-only: suggestions are shown to the user to manually copy elsewhere. The stored master resume is not modified in-app; it only changes if the user re-uploads a new version.
5. **Data persistence**
   - Local JSON file storage for jobs, resume content, and match results (no database).
6. **Platform**
   - React frontend + FastAPI backend, run locally on the user's machine. No deployment/hosting, no authentication, single user only.

### Out of Scope (v1)

- Cover letter generation.
- Multi-version resume tracking / A-B comparison of different resumes against the same JD.
- Auto-applying to jobs.
- Browser extension or auto-capture from job sites.
- URL scraping of job postings.
- In-app resume editing / "accept suggestion" auto-update of the stored resume.
- Authentication, multi-user support, or hosted/cloud deployment.
- Any database (SQL/NoSQL server) — v1 uses flat JSON files.

### Future Considerations (post-MVP)

- Cover letter generation (drafted or outline form — format TBD if revisited).
- In-app "accept and apply" flow that updates the stored master resume from a suggestion.
- Multiple resume versions tracked per job/role type.
- Cloud hosting/deployment and/or migration from JSON files to a proper database if data volume or reliability needs grow.
- Reminders/follow-up dates per application.
- Free-text notes per application card.
- JD ingestion via URL.

## 6. User Stories / Key Flows

- **As the user**, I want to upload my resume once, so that I don't have to re-upload it for every job I evaluate.
- **As the user**, I want to paste or upload a job description and get a match score with matched/missing requirements, so that I can quickly judge my fit for the role.
- **As the user**, I want to see *why* the tool recommends applying or not, so that I can trust or override the recommendation rather than treat it as a black box.
- **As the user**, I want concrete rewritten bullet points for the gaps identified, so that I can quickly improve my resume for that specific application without doing the rewriting myself.
- **As the user**, I want to track each job on a kanban board with its match info visible, so that I have one place to see the status and fit of every application I'm pursuing.

**Key flow — evaluate a new job:**
1. User adds a new job card (paste or upload JD text/file).
2. Tool sends resume + JD to the LLM (gpt-4o-mini) for analysis.
3. Tool displays: match score, matched requirements list, missing requirements list, apply/no-apply recommendation + reasoning, method explanation, and rewritten bullet-point suggestions.
4. User reviews suggestions, manually edits their resume elsewhere if desired, and decides whether to apply.
5. User places the job card in the appropriate kanban column (e.g., Saved or Applied) and moves it forward as the process progresses (Interviewing, Rejected, Offer).

## 7. Functional Requirements

1. The system shall allow the user to upload a single master resume file (or paste resume text) and store it as JSON.
2. The system shall allow the user to create a new job entry via pasted JD text or uploaded JD file.
3. The system shall send the resume and JD content to the OpenAI API (`gpt-4o-mini`) to perform match analysis.
4. The system shall extract and return, for each JD: matched requirements, missing requirements, and a quantified overall score, covering hard skills, tools/platforms, years of experience, certifications, soft skills, and education.
5. The system shall produce an apply/no-apply recommendation accompanied by explicit reasoning and a description of the scoring method used.
6. The system shall generate concrete, rewritten resume bullet-point suggestions addressing the identified gaps for that specific JD.
7. The system shall display resume edit suggestions as read-only text for the user to copy; it shall not modify the stored master resume automatically.
8. The system shall represent each job as a card on a kanban board with columns: Saved, Applied, Interviewing, Rejected, Offer.
9. The system shall allow the user to move a job card between columns.
10. The system shall display the match score/recommendation as a visible attribute on each job card.
11. The system shall persist all job, resume, and match-analysis data to local JSON files, surviving app restarts.
12. The system shall allow the user to re-upload a new master resume, replacing the previously stored version.

## 8. Non-Functional Requirements

- **Performance:** Match analysis should complete within a reasonable single LLM round-trip (no specific latency target set by user; typical `gpt-4o-mini` response times, roughly single-digit seconds, are acceptable). *Assumption: no strict SLA needed given personal/local use.*
- **Accuracy over cost/speed:** User explicitly prioritizes match-analysis accuracy over minimizing LLM cost or latency, though `gpt-4o-mini` was chosen specifically for cost efficiency — treat this as "best accuracy achievable within a cost-efficient model," not "spare no expense."
- **Security/Privacy:** Resume and JD content contain personal data; since the app is local-only with no auth and no hosting, exposure is limited to the user's own machine. The OpenAI API key must be stored securely (e.g., environment variable, not hardcoded/committed) and never logged in plaintext.
- **Reliability:** JSON file storage should handle basic read/write without corruption on normal use; no concurrent-access handling is required (single user, single session assumed).
- **Accessibility:** No specific accessibility requirements were raised; standard reasonable web accessibility practices apply but are not a hard requirement for v1.
- **Scalability:** None required — single user, personal data volumes (expected: tens to low hundreds of job entries).

## 9. Technical Considerations

- **Frontend:** React.
- **Backend:** FastAPI (Python).
- **Data storage:** Flat JSON files on local disk (no SQL/NoSQL database in v1). *Note: JSON files are simple but offer no query capability, transactional safety, or corruption protection — acceptable now given low data volume and single-user local use, but flagged as a likely first thing to revisit if the tool grows (see Risks).*
- **LLM integration:** OpenAI API, model `gpt-4o-mini`. User already holds an API key to use for this. The backend will need to construct prompts that extract structured output (score, matched/missing lists by category, recommendation + reasoning, rewritten bullets) — likely via structured/JSON-mode responses to keep parsing reliable.
- **Hosting/Deployment:** None — runs locally only. No auth, no multi-tenancy, no cloud infrastructure needed for v1.
- **Integrations:** None beyond the OpenAI API. No ATS integration, no job board scraping, no browser extension.

## 10. Timeline & Milestones

- **Target:** The user wants a working version **today (2026-07-01)**, driven by active, ongoing job applications.
- **Feasibility flag:** Building and validating all of the following in one day — file-upload/paste flows, LLM prompt engineering for reliable structured output across six requirement categories, a full kanban UI with drag-between-columns, and JSON persistence — is aggressive. Recommended phasing **within the day**, if a hard cutoff is hit:
  - **Phase A (core value, ship first):** Resume upload + JD paste/upload + LLM match analysis (score, matched/missing requirements, recommendation + reasoning) + resume edit suggestions. This alone lets the user start evaluating today's applications.
  - **Phase B (tracking layer):** Kanban board UI with the five columns and card movement, surfacing the Phase A output on each card.
  - **Phase C (polish, if time remains):** UI refinement, file-upload edge cases (e.g., PDF/DOCX parsing robustness), error handling for LLM failures/timeouts.
- *Assumption: If Phase A + B can't both land today, Phase A (the matching engine) is more valuable to ship first than the kanban shell, since it directly addresses the response-rate diagnosis problem — confirm this priority if it becomes a real tradeoff.*

## 11. Risks & Open Questions

- **Aggressive timeline:** One-day turnaround for a full-stack app with LLM integration is a real risk to scope or quality. Mitigation: phase as described above.
- **JSON file storage at scale:** No corruption/concurrency protection; fine for now, but if job volume grows significantly or the app is used across multiple sessions/machines, a lightweight embedded database (e.g., SQLite) may become worth revisiting despite the current preference for flat files.
- **LLM output reliability:** Getting consistent, structured extraction (six requirement categories, score, reasoning, rewritten bullets) from an LLM in one pass requires careful prompt design; malformed/inconsistent responses are a real risk and may need retry/validation logic.
- **Resume/JD parsing:** If resume or JD are uploaded as files (e.g., PDF/DOCX), text extraction quality could affect match accuracy — not fully scoped (file format support wasn't specified beyond "file upload OR paste").
- **No numeric success target:** "Improve response rate" is currently a directional goal without a measurable target or a defined way to track response rate over time (the tool doesn't currently capture "did I get a response" as a trackable field). Worth deciding whether a lightweight response/outcome field per card is useful, even if outside strict v1 scope.
- **Open question:** Should the app track whether a specific job's resume-edit suggestions were actually applied by the user, to later correlate with response outcomes? Not requested, but relevant to the stated success goal — flagged as a future consideration rather than assumed into scope.

## 12. Appendix

- No existing tool/spreadsheet is being replaced — this is a net-new workflow for the user.
- No design mockups, references, or competitor tools were discussed during discovery.
- Discovery conducted 2026-07-01 via structured Q&A rounds covering Problem & Vision, Users & Stakeholders, Scope & Features, and Technical Constraints/Timeline.
