// In-memory mock backend implementing the documented API contract.
// Enabled via VITE_USE_MOCK=1 (see client.js). Lets the whole UI be
// developed and demoed without a running backend.

const delay = (ms = 400) => new Promise((r) => setTimeout(r, ms));

let resume = null;
let nextId = 3;

const sampleMatch = (score, rec) => ({
  overall_score: score,
  recommendation: rec,
  recommendation_reasoning:
    rec === "apply"
      ? "Strong overlap on core hard skills and tooling; the missing items are learnable gaps rather than disqualifiers."
      : "Several required hard skills and the certification requirement are missing; the role's core stack diverges from the resume.",
  scoring_method_explanation:
    "Each category is weighted (hard skills and tools weigh most), matched items add to the category score and missing items subtract. The overall score is the weighted average across the six categories, on a 0-100 scale.",
  categories: {
    hard_skills: { matched: ["Python", "REST API design"], missing: ["Go"] },
    tools_platforms: { matched: ["Docker", "PostgreSQL"], missing: ["Kubernetes", "Terraform"] },
    years_experience: { matched: ["5+ years backend development"], missing: [] },
    certifications: { matched: [], missing: ["AWS Solutions Architect"] },
    soft_skills: { matched: ["Cross-team collaboration", "Mentoring"], missing: [] },
    education: { matched: ["BS in Computer Science"], missing: [] },
  },
  suggested_bullets: [
    {
      target_gap: "Kubernetes",
      suggested_text:
        "Containerized and deployed 6 microservices with Docker Compose, establishing the migration path to Kubernetes-based orchestration.",
    },
    {
      target_gap: "AWS Solutions Architect certification",
      suggested_text:
        "Designed and operated AWS infrastructure (EC2, RDS, S3) serving 50k monthly users, applying Well-Architected Framework principles.",
    },
  ],
});

let jobs = [
  {
    id: 1,
    title: "Senior Backend Engineer",
    company: "Acme Corp",
    status: "saved",
    created_at: "2026-06-28T10:00:00Z",
    updated_at: "2026-06-28T10:00:00Z",
    jd_text: "We are looking for a Senior Backend Engineer...",
    _match: sampleMatch(78, "apply"),
  },
  {
    id: 2,
    title: null,
    company: "Globex",
    status: "applied",
    created_at: "2026-06-29T15:30:00Z",
    updated_at: "2026-06-30T09:00:00Z",
    jd_text: "Platform engineer role...",
    _match: null, // analysis failed for this one
  },
];

const publicJob = ({ _match, jd_text, ...j }) => ({ ...j, jd_text });

// --- Auth mock ---
// One seeded account (mirrors the seeded resume/jobs above), plus support
// for signing up additional accounts in-memory (FE-15's E2E suite exercises
// both). Real tokens aren't meaningful in mock mode, so these are opaque
// placeholder strings rather than actual JWTs.
const MOCK_USER = { id: 1, email: "demo@example.com" };
const MOCK_PASSWORD = "demopass123";
const MOCK_ACCESS_TOKEN = "mock-access-token";
const signedUpEmails = new Set(); // additional accounts created via signup()
let mockLoggedIn = false;
let currentEmail = null; // whichever account is currently "logged in"
let mockApiKey = null;

export async function signup(email, password) {
  await delay(300);
  if (email === MOCK_USER.email || signedUpEmails.has(email)) {
    throw { status: 409, detail: "Email already registered." };
  }
  signedUpEmails.add(email);
  mockLoggedIn = true;
  currentEmail = email;
  return { access_token: MOCK_ACCESS_TOKEN, expires_in: 900 };
}

export async function login(email, password) {
  await delay(300);
  if (email !== MOCK_USER.email || password !== MOCK_PASSWORD) {
    throw { status: 401, detail: "Invalid email or password." };
  }
  mockLoggedIn = true;
  currentEmail = email;
  return { access_token: MOCK_ACCESS_TOKEN, expires_in: 900 };
}

export async function logout() {
  await delay(150);
  mockLoggedIn = false;
  currentEmail = null;
  return { status: "ok" };
}

export async function refreshAccessToken() {
  await delay(150);
  if (!mockLoggedIn) throw { status: 401, detail: "Invalid or expired refresh token." };
  return { access_token: MOCK_ACCESS_TOKEN, expires_in: 900 };
}

const maskKey = (key) => `${key.slice(0, 3)}...${key.slice(-4)}`;

export async function getCurrentUser(accessToken) {
  await delay(150);
  if (!mockLoggedIn || accessToken !== MOCK_ACCESS_TOKEN) {
    throw { status: 401, detail: "Not authenticated." };
  }
  return {
    id: MOCK_USER.id,
    email: currentEmail,
    openai_api_key_masked: mockApiKey ? maskKey(mockApiKey) : null,
  };
}

// FE-13: GET /api/auth/me via the in-app authorized path (same shape as
// getCurrentUser, but callers don't pass a token explicitly).
export async function getSettings() {
  await delay(150);
  if (!mockLoggedIn) throw { status: 401, detail: "Not authenticated." };
  return {
    id: MOCK_USER.id,
    email: currentEmail,
    openai_api_key_masked: mockApiKey ? maskKey(mockApiKey) : null,
  };
}

// FE-13: PATCH /api/auth/me — mirrors BE-12's validation: 400 unless the
// key is non-empty and starts with "sk-".
export async function updateApiKey(key) {
  await delay(300);
  if (!mockLoggedIn) throw { status: 401, detail: "Not authenticated." };
  const trimmed = (key || "").trim();
  if (!trimmed || !trimmed.startsWith("sk-")) {
    throw {
      status: 400,
      detail: 'That doesn\'t look like a valid OpenAI API key — keys start with "sk-".',
    };
  }
  mockApiKey = trimmed;
  return { openai_api_key_masked: maskKey(mockApiKey) };
}

export async function getResume() {
  await delay();
  if (!resume) throw { status: 404, detail: "No resume uploaded yet" };
  return resume;
}

export async function saveResume(payload) {
  await delay();
  const text = payload.file ? `(contents of ${payload.file.name})` : payload.text;
  if (!payload.file && !payload.text) {
    throw { status: 400, detail: "Provide either a file or text" };
  }
  resume = {
    filename: payload.file ? payload.file.name : null,
    text,
    updated_at: new Date().toISOString(),
  };
  return resume;
}

export async function createJob(payload) {
  await delay(1500); // simulate LLM round-trip
  if (!resume) throw { status: 409, detail: "Upload a resume first" };
  if (!payload.jd_text && !payload.jd_file) {
    throw { status: 400, detail: "Provide either jd_text or jd_file" };
  }
  const now = new Date().toISOString();
  // Simulate an occasional LLM failure when the JD contains "fail".
  const failed = (payload.jd_text || "").toLowerCase().includes("fail");
  const match = failed ? null : sampleMatch(Math.floor(40 + Math.random() * 55), Math.random() > 0.4 ? "apply" : "do-not-apply");
  const job = {
    id: nextId++,
    title: payload.title || null,
    company: payload.company || null,
    status: "saved",
    created_at: now,
    updated_at: now,
    jd_text: payload.jd_text || `(contents of ${payload.jd_file.name})`,
    _match: match,
  };
  jobs.push(job);
  return {
    job: publicJob(job),
    match_result: match,
    match_error: failed ? "LLM analysis failed after retries" : null,
  };
}

export async function fetchJobFromUrl(url) {
  await delay(1200); // simulate page scrape + LLM extraction round-trip
  if (!url || !url.trim()) throw { status: 400, detail: "Enter a URL first." };
  if (url.includes("blocked")) {
    throw {
      status: 502,
      detail: "The page took too long to load. Try pasting the description instead.",
    };
  }
  if (url.includes("empty")) {
    throw {
      status: 422,
      detail:
        "Could not find a job description on that page. It may require login, be blocked " +
        "to automated tools, or not be a job posting. Try pasting the description instead.",
    };
  }
  return {
    title: "Senior Backend Engineer",
    company: "Acme Corp",
    jd_text:
      "We are looking for a Senior Backend Engineer with 5+ years of experience in Python, " +
      "REST API design, Docker and PostgreSQL. AWS Solutions Architect certification preferred.",
  };
}

export async function listJobs() {
  await delay();
  return jobs.map((j) => ({
    id: j.id,
    title: j.title,
    company: j.company,
    status: j.status,
    created_at: j.created_at,
    updated_at: j.updated_at,
    match_summary: j._match
      ? { overall_score: j._match.overall_score, recommendation: j._match.recommendation }
      : null,
  }));
}

export async function getJob(id) {
  await delay();
  const job = jobs.find((j) => j.id === Number(id));
  if (!job) throw { status: 404, detail: "Job not found" };
  return { job: publicJob(job), match_result: job._match };
}

export async function updateJobStatus(id, status) {
  await delay(300);
  const valid = ["saved", "applied", "interviewing", "rejected", "offer"];
  if (!valid.includes(status)) throw { status: 400, detail: "Invalid status value" };
  const job = jobs.find((j) => j.id === Number(id));
  if (!job) throw { status: 404, detail: "Job not found" };
  job.status = status;
  job.updated_at = new Date().toISOString();
  return publicJob(job);
}
