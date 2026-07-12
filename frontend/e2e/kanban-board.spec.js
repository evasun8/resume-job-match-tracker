import { test, expect } from "@playwright/test";
import { loginAsMockUser } from "./helpers.js";

test.describe("kanban board", () => {
  test.beforeEach(async ({ page }) => {
    await loginAsMockUser(page);
    await page.getByRole("tab", { name: "Board" }).click();
  });

  test("renders all five columns with seeded jobs", async ({ page }) => {
    for (const label of ["Saved", "Applied", "Interviewing", "Rejected", "Offer"]) {
      await expect(page.getByRole("heading", { name: label, level: 3 })).toBeVisible();
    }
    // Seeded mock jobs (mock.js): job 1 in Saved, job 2 in Applied.
    await expect(page.getByTestId("job-card-1")).toBeVisible();
    await expect(page.getByTestId("job-card-2")).toBeVisible();
  });

  test("dragging a card moves it to another column", async ({ page }) => {
    const card = page.getByTestId("job-card-1");
    const savedColumn = page.getByTestId("column-saved");
    const interviewingColumn = page.getByTestId("column-interviewing");

    await expect(savedColumn.getByTestId("job-card-1")).toBeVisible();

    await card.dragTo(interviewingColumn);

    await expect(interviewingColumn.getByTestId("job-card-1")).toBeVisible();
    await expect(savedColumn.getByTestId("job-card-1")).toHaveCount(0);
  });

  test("clicking a card opens the job detail dialog", async ({ page }) => {
    await page.getByTestId("job-card-2").click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0);
  });
});
