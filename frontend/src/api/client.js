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

// --- Auth-attached requests (FE-12) ---
//
// AuthContext owns the access token as React state, but this module (a
// plain JS file, not a component) needs its own copy to attach to every
// call -- setAccessToken() is how AuthContext pushes updates here whenever
// its own state changes (login, signup, refresh, logout).
let _accessToken = null;
let _onAuthExpired = null; // callback AuthContext registers via onAuthExpired()

export function setAccessToken(token) {
  _accessToken = token;
}

// AuthContext calls this once on mount so that if the single-flight refresh
// below ever fails outright (refresh cookie itself expired/invalid), the
// app's React state is told to log out -- this module has no way to touch
// React state directly otherwise.
export function onAuthExpired(callback) {
  _onAuthExpired = callback;
}

// Single-flight guard: if several authorizedRequest() calls hit 401
// simultaneously (e.g. a view firing 3 API calls at once right as the
// access token expires), they must trigger exactly ONE /auth/refresh call,
// not one each. Every caller awaits this same in-flight promise instead of
// starting a new refresh of their own.
let _refreshInFlight = null;

async function ensureFreshToken() {
  if (_refreshInFlight) return _refreshInFlight;

  _refreshInFlight = (async () => {
    try {
      const { access_token } = await refreshAccessToken();
      _accessToken = access_token;
      return access_token;
    } catch (err) {
      // Refresh cookie itself is missing/expired -- there's no recovering
      // from this without the user logging in again.
      _accessToken = null;
      _onAuthExpired?.();
      throw err;
    } finally {
      // Cleared whether refresh succeeded or failed, so the *next* 401
      // (e.g. after the next natural 15-minute expiry) starts a fresh
      // single-flight cycle rather than reusing this resolved/rejected one.
      _refreshInFlight = null;
    }
  })();

  return _refreshInFlight;
}

// Wraps request() for every endpoint that requires a logged-in user:
// attaches the current access token, and on a 401, attempts exactly one
// transparent refresh-and-retry before giving up and propagating the
// original error to the caller.
async function authorizedRequest(path, options = {}) {
  const attempt = (token) =>
    request(path, {
      ...options,
      credentials: "include",
      headers: { ...(options.headers || {}), Authorization: `Bearer ${token}` },
    });

  try {
    return await attempt(_accessToken);
  } catch (err) {
    // Skip the refresh dance entirely if we already know there's no
    // session (e.g. this call happened before any login) -- retrying
    // would just fail the same way and waste a round trip.
    if (err.status !== 401 || _accessToken === null) throw err;

    try {
      const freshToken = await ensureFreshToken();
      return await attempt(freshToken);
    } catch {
      // Refresh failed -- surface the ORIGINAL 401 from the first attempt,
      // not the refresh endpoint's own error, since that's what's
      // meaningful to the calling component (its request failed).
      throw err;
    }
  }
}

// --- Auth ---
// These bypass authorizedRequest() above because they need
// `credentials: 'include'` for the httpOnly refresh_token cookie, but must
// NOT attach an access token or trigger the refresh-retry logic themselves
// -- login/signup/logout/refresh are exactly the endpoints that run before
// a valid access token exists yet.

export function signup(email, password) {
  if (USE_MOCK) return mock.signup(email, password);
  return request("/auth/signup", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
}

export function login(email, password) {
  if (USE_MOCK) return mock.login(email, password);
  return request("/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ email, password }),
  });
}

export function logout() {
  if (USE_MOCK) return mock.logout();
  return request("/auth/logout", { method: "POST", credentials: "include" });
}

// Uses the httpOnly refresh cookie (sent automatically via credentials:
// 'include') to mint a fresh access token — no access token is sent here,
// since the whole point is this works even after the old one expired.
export function refreshAccessToken() {
  if (USE_MOCK) return mock.refreshAccessToken();
  return request("/auth/refresh", { method: "POST", credentials: "include" });
}

// Requires a valid access token — passed explicitly here (rather than read
// from shared state) since AuthContext owns the in-memory token, not this
// module.
export function getCurrentUser(accessToken) {
  if (USE_MOCK) return mock.getCurrentUser(accessToken);
  return request("/auth/me", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
}

// --- Settings (FE-13) ---

// GET /api/auth/me — { id, email, openai_api_key_masked }. Unlike
// getCurrentUser() above (which AuthContext calls with an explicit token
// during login flows), this goes through authorizedRequest() like every
// other in-app data fetch.
export function getSettings() {
  if (USE_MOCK) return mock.getSettings();
  return authorizedRequest("/auth/me");
}

// PATCH /api/auth/me — { openai_api_key } → { openai_api_key_masked }.
// 400 { detail } if the key is empty or doesn't start with "sk-".
export function updateApiKey(key) {
  if (USE_MOCK) return mock.updateApiKey(key);
  return authorizedRequest("/auth/me", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ openai_api_key: key }),
  });
}

// --- Resume ---

// GET /api/resume — 404 means "no resume yet" (callers should treat
// a thrown { status: 404 } as an expected empty state, not a failure).
export function getResume() {
  if (USE_MOCK) return mock.getResume();
  return authorizedRequest("/resume");
}

// POST /api/resume — payload: { text } OR { file } (exactly one).
export function saveResume(payload) {
  if (USE_MOCK) return mock.saveResume(payload);
  const form = new FormData();
  if (payload.file) form.append("file", payload.file);
  else if (payload.text != null) form.append("text", payload.text);
  return authorizedRequest("/resume", { method: "POST", body: form });
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
  return authorizedRequest("/jobs", { method: "POST", body: form });
}

// POST /api/jobs/from-url — { url } -> { title, company, jd_text }.
// Does NOT create a job; only returns fields to prefill the form.
export function fetchJobFromUrl(url) {
  if (USE_MOCK) return mock.fetchJobFromUrl(url);
  return authorizedRequest("/jobs/from-url", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url }),
  });
}

// GET /api/jobs — array of job summaries (match_summary may be null).
export function listJobs() {
  if (USE_MOCK) return mock.listJobs();
  return authorizedRequest("/jobs");
}

// GET /api/jobs/{id} — { job, match_result | null }.
export function getJob(id) {
  if (USE_MOCK) return mock.getJob(id);
  return authorizedRequest(`/jobs/${id}`);
}

// PATCH /api/jobs/{id} — { status } → updated job object.
export function updateJobStatus(id, status) {
  if (USE_MOCK) return mock.updateJobStatus(id, status);
  return authorizedRequest(`/jobs/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ status }),
  });
}
