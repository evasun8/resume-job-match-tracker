import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const SAMPLE_RESUME_PATH = path.join(__dirname, "fixtures", "sample-resume.txt");

// Ensures a resume is saved so JD submission/match-analysis flows can
// proceed. Mock state is a server-process singleton, so each spec calls
// this independently rather than relying on cross-spec ordering.
export async function uploadResume(page, text = "Experienced backend engineer with Python and Docker skills.") {
  await page.goto("/");
  await page.getByRole("textbox", { name: "Resume text" }).fill(text);
  await page.getByRole("button", { name: "Save resume" }).click();
  await expectResumeSaved(page);
}

async function expectResumeSaved(page) {
  await page.getByText("Stored").waitFor({ state: "visible" });
}
