import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
const baseURL = `http://localhost:${PORT}`;

/**
 * End-to-end tests run against a dedicated SQLite database (`prisma/e2e.db`) on a
 * separate port so the developer's demo data is never mutated. The database is
 * reset and seeded before the server starts; tests therefore start from the same
 * known baseline on every run.
 *
 * Workers are pinned to one because the suite intentionally drives shared state
 * (project creation, drawing, validation decisions) through a single database.
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["github"], ["html", { open: "never" }]]
    : [["list"], ["html", { open: "never" }]],
  use: {
    baseURL,
    locale: "en-GB",
    timezoneId: "Europe/Lisbon",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "off",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "setup",
      testMatch: /auth\.setup\.ts/,
    },
    {
      name: "desktop",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/engineer.json",
      },
      grepInvert: /@mobile|@anonymous|@technician/,
    },
    {
      name: "mobile",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Pixel 7"],
        viewport: { width: 390, height: 844 },
        storageState: "e2e/.auth/engineer.json",
      },
      grep: /@mobile/,
    },
    {
      name: "anonymous",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: { cookies: [], origins: [] },
      },
      grep: /@anonymous/,
    },
    {
      name: "technician",
      testIgnore: /auth\.setup\.ts/,
      dependencies: ["setup"],
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
        storageState: "e2e/.auth/technician.json",
      },
      grep: /@technician/,
    },
  ],
  webServer: {
    command:
      "npm run db:push -- --force-reset && npm run db:seed && npm run dev -- --port 3100",
    url: `${baseURL}/login`,
    cwd: process.cwd(),
    env: {
      DATABASE_URL: "file:./e2e.db",
      NEXT_TELEMETRY_DISABLED: "1",
    },
    reuseExistingServer: false,
    timeout: 240_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
