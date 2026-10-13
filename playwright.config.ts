import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: "html",
  use: {
    baseURL: "http://localhost:3000",
    trace: "on-first-retry",
  },
  webServer: {
    command: "npm run build && npm run start",
    url: "http://localhost:3000",
    reuseExistingServer: !process.env.CI,
  },
  projects: [
    {
      name: "Desktop Chrome",
      testDir: "./tests/e2e",
      testIgnore: ["a11y/**"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "Mobile Chrome",
      testDir: "./tests/e2e",
      testIgnore: ["a11y/**"],
      use: { ...devices["Pixel 7"] },
    },
    {
      name: "a11y",
      testDir: "./tests/e2e/a11y",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
