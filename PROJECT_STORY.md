# Project Story: Resume ↔ Job Match Tracker

*A behind-the-scenes writeup of what I built, the decisions I made, and what's next. Written for portfolio/interview context — see [README.md](README.md) for the technical setup and architecture docs.*

## The problem

Job searching means repeatedly comparing your resume against dozens of job descriptions, manually copy-pasting text, and losing track of which applications you've actually sent. I built this tool to solve that for myself: paste or upload a resume once, then get an instant, structured match analysis (score, matched/missing requirements, suggested resume bullets) against any job description — and track every application's status on a Kanban board.

It started as a personal utility, but I used it as a vehicle to deliberately practice full-stack development, LLM integration, browser automation, testing, and — as I extend it further — containerization, cloud deployment, and observability.

## What's built

- **Frontend:** React 18 + Vite + Tailwind CSS, shadcn/ui-style components
- **Backend:** FastAPI + Uvicorn, flat JSON file storage (a deliberate choice — see below)
- **LLM integration:** OpenAI `gpt-4o-mini` for resume/JD match scoring *and* for structured field extraction from scraped job postings
- **Browser automation:** Server-side Playwright (Python) to scrape job posting pages when a user pastes a URL instead of the job description
- **Testing:** A Playwright (`@playwright/test`) end-to-end suite covering resume upload, JD submission, match result display, and Kanban board interactions — running entirely against a mock API layer, so it needs no live backend or LLM calls

## Key decisions and trade-offs

Building the "auto-fill job details from a URL" feature surfaced most of the interesting engineering decisions in this project.

**Server-side scraping, not client-side.** Playwright runs in the FastAPI backend rather than the browser. This sidesteps CORS entirely, keeps the scraping logic and its security guards in one place, and lets the backend own the LLM extraction step in the same request without a client round-trip.

**Security guards before the happy path worked.** The moment users can submit arbitrary URLs to a server-side headless browser, that's a real SSRF (server-side request forgery) attack surface. Before the feature even worked end-to-end, I added scheme validation, DNS resolution checks, and rejection of private/loopback/link-local IP ranges — treating it as a security-first feature, not a bolt-on afterthought.

**A real debugging story.** Early testing against a real job posting (Cisco's careers site) returned a suspiciously generic, LLM-hallucinated-sounding job summary instead of the actual posting text. I didn't guess at the fix — I wrote a small standalone script to print exactly what the scraper was capturing and found it was returning **zero characters** of page text. The root cause: I was waiting for `domcontentloaded`, which fires before JavaScript-heavy sites (Workday-style career pages, in this case) render their actual content. The fix was to wait for `networkidle` with a graceful timeout fallback, so the scraper doesn't hang forever on pages with persistent background polling. This is the kind of debugging process — instrument, observe, isolate root cause, fix — that I'd want to walk through in an interview.

**Prefill, don't auto-submit.** The URL-fetch feature deliberately stops at prefilling the form fields rather than automatically creating the job entry. The user always reviews and edits the LLM-extracted title/company/description before saving — a human-in-the-loop design choice that trades a small amount of convenience for meaningfully better trust and error tolerance in an LLM-powered feature.

**Mock-first testing architecture.** The frontend ships with a full in-memory mock API layer (toggled via `VITE_USE_MOCK`), so the whole UI is developable, demoable, and testable without a running backend, an OpenAI API key, or real network calls. This made the E2E test suite fast, deterministic, and free to run in CI — a pattern I'd apply to any frontend with an external API dependency.

**Cost-aware LLM usage.** I measured the actual per-job LLM cost (roughly $0.001–0.003 depending on flow) and documented concrete levers to reduce it further — parsing `schema.org/JobPosting` structured data before falling back to an LLM call, trimming scraped page noise before it hits the prompt, and using strict JSON schema mode to eliminate costly validation-retry loops. Treating an LLM feature as having real unit economics, not just "call the API," is a habit I want to carry into any LLM-powered work.

## Known limitations (and why they're intentional)

- **Single-user, flat-file storage.** No database, no auth. This was the right level of complexity for a personal tool used by one person — but I know exactly what would need to change to support multiple users (see roadmap below), and the current job IDs being sequential/guessable is a specific thing I'd need to fix as part of that, not an oversight to ignore.
- **Login-gated sites (LinkedIn, etc.) can't be auto-filled.** LinkedIn actively detects and blocks headless/automated access, even for public job postings. I deliberately chose not to build around this (credential-based login, anti-bot evasion) — that crosses into ToS-violation and account-risk territory that isn't appropriate for this feature. The scraper correctly falls back to "paste manually" for these cases.
- **A UI paste-via-keyboard-shortcut bug was found and deliberately deprioritized** rather than sunk into indefinitely — a judgment call about effort vs. value that I'd make the same way again.

## Roadmap — what I'd build next, and why in this order

I sequenced this roadmap so that each step introduces exactly one new variable to reason about, rather than debugging multiple unknowns at once:

1. **Multi-tenant support.** Migrate from flat JSON files to SQLite, add JWT-based authentication, and scope every resume/job/match record by `user_id`. The security-critical part: current job IDs are sequential integers, so ownership checks on every read/write endpoint are essential — not an optional hardening step.
2. **Containerization — done.** A Dockerfile per service (frontend, backend) plus a `docker-compose.yml` to run them together locally, learned and typed by hand rather than generated. Confirmed the anticipated wrinkle firsthand: `playwright install --with-deps` failed against a floating `python:3.11-slim` base image because it couldn't map dependency package names for the newer Debian release the tag resolved to — pinning to `python:3.11-slim-bookworm` fixed it. A second, separate lesson: Vite bakes `VITE_USE_MOCK` in at *build* time, so the frontend Dockerfile needed it wired through explicitly as a build arg — a container running the real backend was still silently serving a mock-mode bundle until that was fixed, a subtle build-time-vs-runtime-config bug that's easy to miss.
3. **Cloud deployment (AWS EC2).** Deliberately manual first — SSH in, `docker compose up` — before any automation. I want the mental model of "what actually runs where" solid before abstracting it behind a pipeline.
4. **CI/CD (GitHub Actions).** Only after the manual deploy path is understood. Automating a process you don't yet understand just moves the debugging into a black box.
5. **LLM observability (LangSmith or similar tracing).** Add tracing to the two LLM call sites (match analysis, URL field extraction) for latency/cost visibility and prompt-version comparison — treating LLM calls as production dependencies worth observing, even at personal-project scale.

Each of these is scoped as an independent, learnable milestone — I can build and discuss any one of them without having built the others.

## What this project demonstrates

- Full-stack development (React + FastAPI) with a real, non-trivial feature (not a CRUD tutorial clone)
- Security-conscious design under a genuine attack surface (SSRF via user-submitted URLs)
- Methodical debugging of a subtle, real-world failure mode (JS-rendered content timing)
- Test architecture that decouples UI testing from external API dependencies
- Treating LLM cost and reliability as first-class engineering concerns, not afterthoughts
- Deliberate, reasoned technical sequencing on a multi-step roadmap — sign of engineering judgment, not just task completion
