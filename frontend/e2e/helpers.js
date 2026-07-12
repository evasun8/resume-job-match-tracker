import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SAMPLE_RESUME_PATH = path.join(__dirname, "fixtures", "sample-resume.txt");

// FE-15: every view now requires an authenticated session (FE-11/FE-12), so
// every spec must log in before doing anything else. Uses the seeded mock
// account from mock.js (MOCK_USER/MOCK_PASSWORD) -- mock mode has exactly
// one account, so there's no signup step needed here.
export async function loginAsMockUser(page) {
  await page.goto("/");
  await page.getByLabel("Email").fill("demo@example.com");
  await page.getByLabel("Password").fill("demopass123");
  await page.getByRole("button", { name: "Log in" }).click();
  // Waiting for the header's "Log out" button is a reliable signal that
  // the authenticated app shell has actually rendered, not just that the
  // login form was submitted (which could still be pending/failed).
  await page.getByRole("button", { name: "Log out" }).waitFor({ state: "visible" });
}

// Ensures a resume is saved so JD submission/match-analysis flows can
// proceed. Mock state is a server-process singleton, so each spec calls
// this independently rather than relying on cross-spec ordering.
export async function uploadResume(page, text = "Experienced backend engineer with Python and Docker skills.") {
  await loginAsMockUser(page);
  await page.getByRole("textbox", { name: "Resume text" }).fill(text);
  await page.getByRole("button", { name: "Save resume" }).click();
  await expectResumeSaved(page);
}

async function expectResumeSaved(page) {
  await page.getByText("Stored").waitFor({ state: "visible" });
}
