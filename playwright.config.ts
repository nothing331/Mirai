import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  webServer: { command: "npm run dev", port: 3000, reuseExistingServer: false, env: { ...process.env, IMAGE_EDIT_PROVIDER: "fake" } },
  use: { baseURL: "http://127.0.0.1:3000", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
