import { defineConfig } from "@playwright/test";
const appPort = Number(process.env.PAINT_TEST_PORT || 14420);
export default defineConfig({
  testDir: "tests",
  timeout: 45000,
  use: {
    baseURL: `http://127.0.0.1:${appPort}`,
    viewport: { width: 390, height: 844 },
  },
  webServer: {
    command: `npm run dev -- --port ${appPort}`,
    url: `http://127.0.0.1:${appPort}`,
    reuseExistingServer: false,
  },
  reporter: "list",
});
