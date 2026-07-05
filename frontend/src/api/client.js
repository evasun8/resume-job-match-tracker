// API client for Resume & Job Match Tracker.
//
// Every function returns parsed JSON on 2xx and throws a normalized
// error object `{ status, detail }` on non-2xx (or network failure,
// where status is 0).
//
// While there is no live backend, the client defaults to an in-memory
// mock so `npm run dev` is fully clickable. Set VITE_USE_MOCK=0 to hit
// the real backend (proxied to http://localhost:8000, see vite.config.js).

import * as mock from "./mock.js";

const USE_MOCK = import.meta.env.VITE_USE_MOCK !== "0";
const BASE = "/api";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${BASE}${path}`, options);
  } catch (err) {
    throw { status: 0, detail: `Network error: ${err.message}` };
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    // Non-JSON body (or empty) — leave as null.
  }

  if (!res.ok) {
    throw {
      status: res.status,
      detail: (body && body.detail) || `Request failed with status ${res.status}`,
    };
  }
  return body;
}

// --- Resume ---

// GET /api/resume — 404 means "no resume yet" (callers should treat
// a thrown { status: 404 } as an expected empty state, not a failure).
export function getResume() {
  if (USE_MOCK) return mock.getResume();
  return request("/resume");
}

// POST /api/resume — payload: { text } OR { file } (exactly one).
export function saveResume(payload) {
  if (USE_MOCK) return mock.saveResume(payload);
  const form = new FormData();
  if (payload.file) form.append("file", payload.file);
  else if (payload.text != null) form.append("text", payload.text);
  return request("/resume", { method: "POST", body: form });
}

// --- Jobs ---

// POST /api/jobs — payload: { jd_text | jd_file, title?, company? }.
// Returns { job, match_result, match_error }; match_result may be null.
export function createJob(payload) {
  if (USE_MOCK) return mock.createJob(payload);
  const form = new FormData();
  if (payload.jd_file) form.append("jd_file", payload.jd_file);
  else if (payload.jd_text != null) form.append("jd_text", payload.jd_text);
  if (payload.title) form.append("title", payload.title);
  if (payload.company) form.append("company", payload.company);
  return request("/jobs", { method: "POST", body: form });
}

// POST /api/jobs/from-url — { url } -> { title, company, jd_text }.
// Does NOT create a job; only returns fields to prefill the form.
export function fetchJobFromUrl(url) {
  if (USE_MOCK) return mock.fetchJobFromUrl(url);
  return request("/jobs/from-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

// GET /api/jobs — array of job summaries (match_summary may be null).
export function listJobs() {
  if (USE_MOCK) return mock.listJobs();
  return request("/jobs");
}

// GET /api/jobs/{id} — { job, match_result | null }.
export function getJob(id) {
  if (USE_MOCK) return mock.getJob(id);
  return request(`/jobs/${id}`);
}

// PATCH /api/jobs/{id} — { status } → updated job object.
export function updateJobStatus(id, status) {
  if (USE_MOCK) return mock.updateJobStatus(id, status);
  return request(`/jobs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}
