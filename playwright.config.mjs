import { defineConfig, devices } from '@playwright/test';

const isRemoteRun = Boolean(process.env.LEXYOS_BASE_URL);
const port = Number(process.env.LEXYOS_E2E_PORT ?? 5199);
const localBaseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: './tests/e2e',
  timeout: isRemoteRun ? 120_000 : 60_000,
  expect: { timeout: isRemoteRun ? 20_000 : 10_000 },
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ['list'],
    ['html', { outputFolder: 'proof/playwright-report', open: 'never' }],
    ['json', { outputFile: 'proof/playwright-results.json' }],
  ],
  outputDir: 'proof/playwright-artifacts',
  use: {
    baseURL: process.env.LEXYOS_BASE_URL ?? localBaseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: isRemoteRun ? undefined : {
    command: `node scripts/reset-data.mjs && HOST=127.0.0.1 PORT=${port} LEXYOS_DATA_PATH=./data/lexyos.json npm start`,
    url: `${localBaseURL}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    {
      name: process.env.LEXYOS_E2E_TARGET ?? (isRemoteRun ? 'remote-chromium' : 'local-chromium'),
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
