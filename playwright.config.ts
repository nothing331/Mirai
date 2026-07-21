import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.E2E_PORT ?? 3000);
const serverCommand = process.env.E2E_PORT ? `npm run start -- --port ${port}` : `npm run dev -- --port ${port}`;

export default defineConfig({
  testDir: "./e2e",
  webServer: { command: serverCommand, port, reuseExistingServer: false, env: { ...process.env, IMAGE_EDIT_PROVIDER: "fake" } },
  use: { baseURL: `http://127.0.0.1:${port}`, trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
