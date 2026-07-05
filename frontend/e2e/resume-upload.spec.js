import { test, expect } from "@playwright/test";
import { SAMPLE_RESUME_PATH } from "./helpers.js";

test.describe("resume upload", () => {
  test("paste-mode resume save shows stored state", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("textbox", { name: "Resume text" }).fill("Experienced engineer with Python skills.");
    await page.getByRole("button", { name: "Save resume" }).click();

    await expect(page.getByText("Stored")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });

  test("upload-mode resume save shows stored state", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Upload file" }).click();
    await page.locator('input[type="file"]').setInputFiles(SAMPLE_RESUME_PATH);
    await page.getByRole("button", { name: "Save resume" }).click();

    await expect(page.getByText("Stored")).toBeVisible();
    await expect(page.getByRole("alert")).toHaveCount(0);
  });
});
