import { defineConfig, devices } from "@playwright/test";

// Runs the app against the built-in mock API (VITE_USE_MOCK=1) so `npm test`
// is self-contained and needs no Python backend or network access.
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false,
  reporter: "list",
  use: {
    baseURL: "http://localhost:5174",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run dev -- --port 5174",
    port: 5174,
    reuseExistingServer: !process.env.CI,
    env: { VITE_USE_MOCK: "1" },
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
