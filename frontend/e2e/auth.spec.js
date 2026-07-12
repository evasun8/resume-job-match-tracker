import { test, expect } from "@playwright/test";
import { loginAsMockUser } from "./helpers.js";

// FE-15: covers the auth flow itself, independent of any resume/job data.
// Uses the seeded mock account from mock.js (demo@example.com/demopass123)
// -- mock mode supports exactly one account, so signup tests use a
// different, unseeded email to exercise the "new account" path distinctly
// from the "existing account" login path.
test.describe("authentication", () => {
  test("logging in with correct credentials shows the authenticated app", async ({ page }) => {
    await loginAsMockUser(page);
    await expect(page.getByText("demo@example.com")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Add Job / Analyze" })).toBeVisible();
  });

  test("logging in with the wrong password shows an error, not the app", async ({ page }) => {
    await page.goto("/");
    await page.getByLabel("Email").fill("demo@example.com");
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Log in" }).click();

    await expect(page.getByText("Login failed")).toBeVisible();
    await expect(page.getByText("Invalid email or password.")).toBeVisible();
    // Still on the login form, not the app shell.
    await expect(page.getByRole("button", { name: "Log out" })).toHaveCount(0);
  });

  test("signing up with a new account shows the authenticated app", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Sign up" }).click();
    await page.getByLabel("Email").fill("newuser@example.com");
    await page.getByLabel("Password").fill("newpass1234");
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("newuser@example.com")).toBeVisible();
  });

  test("signing up with an already-registered email shows an error", async ({ page }) => {
    await page.goto("/");
    await page.getByRole("tab", { name: "Sign up" }).click();
    await page.getByLabel("Email").fill("demo@example.com");
    await page.getByLabel("Password").fill("somepassword1");
    await page.getByRole("button", { name: "Sign up" }).click();

    await expect(page.getByText("Sign up failed")).toBeVisible();
    await expect(page.getByText("Email already registered.")).toBeVisible();
  });

  test("logging out returns to the login page", async ({ page }) => {
    await loginAsMockUser(page);
    await page.getByRole("button", { name: "Log out" }).click();

    await expect(page.getByRole("button", { name: "Log in" })).toBeVisible();
    await expect(page.getByText("demo@example.com")).toHaveCount(0);
  });

  test("visiting the app while logged out shows the login page, not a broken board", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Sign in to your account")).toBeVisible();
    await expect(page.getByRole("tab", { name: "Board" })).toHaveCount(0);
  });
});
