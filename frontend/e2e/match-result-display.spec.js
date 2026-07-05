import { test, expect } from "@playwright/test";
import { uploadResume } from "./helpers.js";

// Mock's sampleMatch() always returns the same categories/suggested_bullets
// content regardless of the randomized score/recommendation, so we assert
// against that fixed content rather than the randomized parts.
test.describe("match result display", () => {
  test("renders score, categories, and suggested bullets", async ({ page }) => {
    await uploadResume(page);
    await page.getByRole("textbox", { name: "Job description" }).fill(
      "We need a backend engineer with Python, Docker, and PostgreSQL experience."
    );
    await page.getByRole("button", { name: "Save & Analyze Match" }).click();

    await expect(page.getByText("Match score")).toBeVisible();
    for (const label of [
      "Hard Skills",
      "Tools & Platforms",
      "Years of Experience",
      "Certifications",
      "Soft Skills",
      "Education",
    ]) {
      await expect(page.getByRole("heading", { name: label })).toBeVisible();
    }

    // Fixed sample chips from mock.js's sampleMatch().
    await expect(page.getByText("Docker", { exact: true })).toBeVisible();
    await expect(page.getByText("Kubernetes", { exact: true })).toBeVisible();

    // Suggested bullets section.
    await expect(page.getByText(/Containerized and deployed 6 microservices/)).toBeVisible();
  });
});
