// Playwright E2E 設定（#9）。ユニットテスト(node --test)とは別系統。
// 実行: npm run test:e2e （初回のみ `npx playwright install chromium` が必要）
const { defineConfig, devices } = require('@playwright/test');

const PORT = process.env.E2E_PORT || 8181;

module.exports = defineConfig({
  testDir: './e2e',
  timeout: 30000,
  expect: { timeout: 5000 },
  fullyParallel: false,
  reporter: 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    headless: true
  },
  webServer: {
    command: 'node server.js',
    url: `http://localhost:${PORT}`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
    timeout: 30000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ]
});
