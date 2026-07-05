import { test, expect } from "@playwright/test";
import { uploadResume } from "./helpers.js";

test.describe("JD submission", () => {
  test("validation error on empty paste", async ({ page }) => {
    await uploadResume(page);
    await page.getByRole("button", { name: "Save & Analyze Match" }).click();
    await expect(page.getByText("Paste a job description first.")).toBeVisible();
  });

  test("submitting a JD shows the analysis result", async ({ page }) => {
    await uploadResume(page);
    await page.getByRole("textbox", { name: "Job title (optional)" }).fill("Backend Engineer");
    await page.getByRole("textbox", { name: "Company (optional)" }).fill("Test Co");
    await page.getByRole("textbox", { name: "Job description" }).fill(
      "We need a backend engineer with Python and Docker experience."
    );
    await page.getByRole("button", { name: "Save & Analyze Match" }).click();

    await expect(page.getByText(/Analysis result/)).toBeVisible();
  });

  test("simulated analysis failure still saves the job", async ({ page }) => {
    await uploadResume(page);
    await page.getByRole("textbox", { name: "Job description" }).fill(
      "This job description contains the word fail to trigger the mock failure path."
    );
    await page.getByRole("button", { name: "Save & Analyze Match" }).click();

    await expect(page.getByText("Job saved, but analysis failed")).toBeVisible();
    await page.getByRole("button", { name: "View it on the board" }).click();
    await expect(page.getByRole("tab", { name: "Board", selected: true })).toBeVisible();
  });
});
