import { defineConfig, devices } from "@playwright/test";

// Гейт верности (конвейер v2): визуал-регрессия + поведение против контракта.
// baseURL переопределяется PLAYWRIGHT_BASE_URL → тот же сьют гоняется против прода (деплой-гейт).
// Vite base = /app/, поэтому baseURL включает /app/.
const BASE = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173/app/";

export default defineConfig({
  testDir: "./tests-e2e",
  snapshotDir: "./tests-e2e/__snapshots__",
  // baseline визуала утверждает ЧЕЛОВЕК (npx playwright test --update-snapshots).
  // CI/агент НИКОГДА не обновляет эталон — иначе тихо благословит дрейф.
  updateSnapshots: "none",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: BASE,
    viewport: { width: 390, height: 844 }, // Telegram моб.
    trace: "on-first-retry",
  },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 390, height: 844 } } },
    { name: "webkit", use: { ...devices["iPhone 13"] } }, // Telegram iOS = WebKit webview
  ],
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173/app/",
    reuseExistingServer: true,
    timeout: 30_000,
  },
});
