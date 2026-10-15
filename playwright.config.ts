import { defineConfig, devices } from "@playwright/test";
import { E2E_PORT } from "./tests/e2e/users";

const BASE_URL = `http://localhost:${E2E_PORT}`;

export default defineConfig({
  testDir: "tests/e2e",
  // Tests share one database, so run them one at a time for predictable boards.
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 7_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    colorScheme: "dark",
    viewport: { width: 1440, height: 900 },
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    // Requires `next build` first (npm run test:e2e does both).
    command: "npm run e2e:server",
    url: `${BASE_URL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: "ignore",
    stderr: "pipe",
  },
});
