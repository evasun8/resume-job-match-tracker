# Project Story: Resume ↔ Job Match Tracker

*A behind-the-scenes writeup of what I built, the decisions I made, and what's next. Written for portfolio/interview context — see [README.md](README.md) for the technical setup and architecture docs.*

## The problem

Job searching means repeatedly comparing your resume against dozens of job descriptions, manually copy-pasting text, and losing track of which applications you've actually sent. I built this tool to solve that for myself: paste or upload a resume once, then get an instant, structured match analysis (score, matched/missing requirements, suggested resume bullets) against any job description — and track every application's status on a Kanban board.

It started as a personal utility, but I used it as a vehicle to deliberately practice full-stack development, LLM integration, browser automation, testing, and — as I extend it further — containerization, cloud deployment, and observability.

## What's built

- **Frontend:** React 18 + Vite + Tailwind CSS, shadcn/ui-style components
- **Backend:** FastAPI + Uvicorn, SQLite storage, multi-tenant with JWT-based auth
- **Auth:** Dual-token pattern — short-lived access token in frontend memory, long-lived refresh token in an httpOnly cookie, with silent refresh and a concurrency-safe auto-retry interceptor (see below)
- **LLM integration:** OpenAI `gpt-4o-mini` for resume/JD match scoring *and* for structured field extraction from scraped job postings, billed to each user's own API key
- **Browser automation:** Server-side Playwright (Python) to scrape job posting pages when a user pastes a URL instead of the job description
- **Deployment:** Dockerized (multi-stage frontend build, nginx reverse proxy) and deployed to AWS EC2, served over HTTPS (Let's Encrypt via Certbot)
- **CI/CD:** GitHub Actions — pytest + Playwright E2E + Docker build on every push/PR, gated behind branch protection; auto-deploy to EC2 on merge to `main`
- **Observability:** LangSmith tracing on both LLM call sites (latency, cost, success/failure), with credential and personal-data redaction before traces leave the server
- **Testing:** A Playwright (`@playwright/test`) end-to-end suite covering resume upload, JD submission, match result display, Kanban board, and the full auth flow — running entirely against a mock API layer; plus a pytest backend suite anchored by a cross-user data-isolation test

## Key decisions and trade-offs

Building the "auto-fill job details from a URL" feature surfaced most of the interesting engineering decisions in this project.

**Server-side scraping, not client-side.** Playwright runs in the FastAPI backend rather than the browser. This sidesteps CORS entirely, keeps the scraping logic and its security guards in one place, and lets the backend own the LLM extraction step in the same request without a client round-trip.

**Security guards before the happy path worked.** The moment users can submit arbitrary URLs to a server-side headless browser, that's a real SSRF (server-side request forgery) attack surface. Before the feature even worked end-to-end, I added scheme validation, DNS resolution checks, and rejection of private/loopback/link-local IP ranges — treating it as a security-first feature, not a bolt-on afterthought.

**A real debugging story.** Early testing against a real job posting (Cisco's careers site) returned a suspiciously generic, LLM-hallucinated-sounding job summary instead of the actual posting text. I didn't guess at the fix — I wrote a small standalone script to print exactly what the scraper was capturing and found it was returning **zero characters** of page text. The root cause: I was waiting for `domcontentloaded`, which fires before JavaScript-heavy sites (Workday-style career pages, in this case) render their actual content. The fix was to wait for `networkidle` with a graceful timeout fallback, so the scraper doesn't hang forever on pages with persistent background polling. This is the kind of debugging process — instrument, observe, isolate root cause, fix — that I'd want to walk through in an interview.

**Prefill, don't auto-submit.** The URL-fetch feature deliberately stops at prefilling the form fields rather than automatically creating the job entry. The user always reviews and edits the LLM-extracted title/company/description before saving — a human-in-the-loop design choice that trades a small amount of convenience for meaningfully better trust and error tolerance in an LLM-powered feature.

**Mock-first testing architecture.** The frontend ships with a full in-memory mock API layer (toggled via `VITE_USE_MOCK`), so the whole UI is developable, demoable, and testable without a running backend, an OpenAI API key, or real network calls. This made the E2E test suite fast, deterministic, and free to run in CI — a pattern I'd apply to any frontend with an external API dependency.

**Cost-aware LLM usage.** I measured the actual per-job LLM cost (roughly $0.001–0.003 depending on flow) and documented concrete levers to reduce it further — parsing `schema.org/JobPosting` structured data before falling back to an LLM call, trimming scraped page noise before it hits the prompt, and using strict JSON schema mode to eliminate costly validation-retry loops. Treating an LLM feature as having real unit economics, not just "call the API," is a habit I want to carry into any LLM-powered work.

**A dual-token auth pattern, chosen deliberately over the simpler option.** My first plan for multi-tenant auth was a single long-lived JWT in an httpOnly cookie — simple, and secure enough. I upgraded it to the pattern most production systems actually use: a 15-minute access token held only in frontend memory (never `localStorage`, gone on every reload) plus a 7-day refresh token in an httpOnly cookie, with silent refresh on page load and a transparent refresh-and-retry on any `401`. The interesting engineering problem this created: if several API calls hit an expired access token simultaneously, naively they'd each trigger their own refresh call. I built a single-flight guard — every concurrent caller awaits the *same* in-flight refresh promise — and verified it with a real concurrency test (three simultaneous requests against a real backend, confirmed via network inspection that exactly one `/api/auth/refresh` call fired, not three).

**Ownership checks live in the query, not as an afterthought.** Every SQLite query in the storage layer (`resume_store.py`, `job_store.py`, `match_store.py`) scopes by `WHERE user_id = ?` as part of the query itself — a row belonging to another user simply doesn't match, returning the identical "not found" result as a row that doesn't exist at all. I verified this wasn't just a design intention with an actual two-user pytest suite: sign up User A and User B, have A create data, assert B gets `404`/empty results through every endpoint — not just reasoning about it, but proving it against a real database.

**Observability isn't free of its own risks, and I caught mine before it shipped.** Adding LangSmith tracing to the two LLM call sites was meant to add visibility (latency, cost, success/failure) — but by default, the `@traceable` decorator captures a function's raw arguments, which meant the user's OpenAI API key and the full resume/JD text were being sent to a third-party service inside every trace. I noticed this myself while reviewing a live trace, not because a test caught it, and fixed it with a `process_inputs` callback that strips the API key entirely and redacts personal text fields before the trace ever leaves the server — then verified the fix against LangSmith's own API, not just by reading the code. A good reminder that adding an observability tool is itself a decision with its own security surface, not a purely additive, risk-free improvement.

**HTTPS on a containerized nginx needs a different Certbot flow than the tutorials assume.** Most Certbot guides assume nginx running directly on the host, with a plugin that auto-edits its config. Since my nginx lives inside a Docker container, I used Certbot in standalone mode on the EC2 host instead — briefly freeing port 80, obtaining the certificate to the host's filesystem, then mounting it *read-only* into the frontend container so nginx could reference it without the certificate files ever being baked into the image itself. Small architectural wrinkle, but the kind of thing that's invisible until you actually try to combine "containerized reverse proxy" with "the standard way people teach TLS setup."

**Real deploy failures don't always look like the tutorial's failures.** Getting CI's `deploy` job to actually reach EC2 surfaced two distinct, unrelated problems in sequence: first, the security group's SSH rule (originally scoped to my own home IP for safety) silently blocked GitHub's own runner infrastructure, which connects from Microsoft Azure's IP ranges, not mine — diagnosed from an `i/o timeout` with no other clue. After opening that up, a second failure appeared: the deploy secret used my DuckDNS hostname, and DNS resolution from GitHub's network itself timed out — fixed by switching to the raw Elastic IP, which skips DNS resolution entirely. Two separate root causes, each requiring reading the actual error text carefully rather than assuming the first fix would be the only one needed.

## Known limitations (and why they're intentional)

- **No refresh-token rotation.** The refresh token doesn't get replaced on each use, a further hardening step some production systems add. Acceptable at this scale; flagged as a specific future enhancement rather than an oversight.
- **No password reset or email verification.** Not required for a personal-scale multi-user app; would be the first thing added if this ever needed public signups.
- **Login-gated sites (LinkedIn, etc.) can't be auto-filled.** LinkedIn actively detects and blocks headless/automated access, even for public job postings. I deliberately chose not to build around this (credential-based login, anti-bot evasion) — that crosses into ToS-violation and account-risk territory that isn't appropriate for this feature. The scraper correctly falls back to "paste manually" for these cases.
- **A UI paste-via-keyboard-shortcut bug was found and deliberately deprioritized** rather than sunk into indefinitely — a judgment call about effort vs. value that I'd make the same way again.

## Roadmap — what I'd build next, and why in this order

I sequenced this roadmap so that each step introduces exactly one new variable to reason about, rather than debugging multiple unknowns at once:

1. **Multi-tenant support — done.** Migrated from flat JSON files to SQLite, added the dual-token JWT auth pattern described above, and scoped every resume/job/match record by `user_id`. Each user also brings their own OpenAI API key (encrypted at rest with Fernet symmetric encryption, decrypted only at the moment of an LLM call) — this was the direct answer to "my shared API key shouldn't pay for everyone else's usage" once the app could have more than one real user. Backed by a 35-test pytest suite (unit, integration, and the cross-user isolation tests) and an expanded Playwright E2E suite covering the full login/signup/logout flow.
2. **Containerization — done.** A Dockerfile per service (frontend, backend) plus a `docker-compose.yml` to run them together locally, learned and typed by hand rather than generated. Confirmed the anticipated wrinkle firsthand: `playwright install --with-deps` failed against a floating `python:3.11-slim` base image because it couldn't map dependency package names for the newer Debian release the tag resolved to — pinning to `python:3.11-slim-bookworm` fixed it. A second, separate lesson: Vite bakes `VITE_USE_MOCK` in at *build* time, so the frontend Dockerfile needed it wired through explicitly as a build arg — a container running the real backend was still silently serving a mock-mode bundle until that was fixed, a subtle build-time-vs-runtime-config bug that's easy to miss.
3. **Cloud deployment (AWS EC2) — done.** Deliberately manual first — SSH in, `docker compose up` — before any automation, to build a solid mental model of "what actually runs where" before abstracting it behind a pipeline. Debugged a real chain of first-deploy issues along the way: an `nginx.conf` filename typo, a `/usr/share` path typo in two different places, and a wrong upstream port in the reverse-proxy config — the kind of small, cascading mistakes that are genuinely common on a first production-style deploy, each traced from the actual nginx/Docker error output rather than guessed at.
4. **CI/CD (GitHub Actions) — done.** Built only after the manual deploy path was understood, per the reasoning above. CI runs pytest, the Playwright E2E suite, and a Docker build check on every push/PR, enforced via branch protection so a failing check actually blocks a merge, not just reports it. CD then extends this with a `deploy` job, gated behind all three checks passing and restricted to direct pushes on `main` (never PRs) — automating a process only once it was already fully understood by hand.
5. **LLM observability (LangSmith) — done.** Added tracing to both LLM call sites (match analysis, URL field extraction) for latency/cost/success visibility — and, in the process, caught and fixed a real privacy issue of my own making (see "Key decisions" above): the default trace capture included the OpenAI API key and raw personal text, both now redacted before any trace leaves the server.
6. **HTTPS + a real domain — done.** Added as a security-motivated late addition, not just a cosmetic one, once I realized login credentials and personal resume content were traveling in plaintext over the wire without it. Used a free DuckDNS subdomain plus Certbot in standalone mode (since nginx runs containerized, not on the host) — see "Key decisions" above for the full mechanics.

Each of these is scoped as an independent, learnable milestone — I can build and discuss any one of them without having built the others.

## What this project demonstrates

- Full-stack development (React + FastAPI) with a real, non-trivial feature (not a CRUD tutorial clone)
- Security-conscious design under a genuine attack surface (SSRF via user-submitted URLs)
- Methodical debugging of a subtle, real-world failure mode (JS-rendered content timing)
- Production-grade authentication (dual-token JWT pattern, single-flight refresh, encrypted per-user secrets) built and verified with real concurrency and cross-user isolation tests, not just implemented and assumed correct
- Test architecture that decouples UI testing from external API dependencies
- Treating LLM cost and reliability as first-class engineering concerns, not afterthoughts
- Deliberate, reasoned technical sequencing on a multi-step roadmap — sign of engineering judgment, not just task completion
- Knowing which code to build hands-on versus delegate: security-critical auth logic was built and reviewed personally, while lower-risk UI scaffolding (a settings page) was delegated and then independently re-tested rather than trusted at face value
- A real CI/CD pipeline (GitHub Actions, branch protection, gated auto-deploy) built and debugged against actual infrastructure, not just a workflow file that looks correct on paper
- Catching and fixing my own security/privacy gap (a credential and personal-data leak into a third-party observability tool) before it became a real problem, rather than after
