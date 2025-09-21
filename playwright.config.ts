import { defineConfig, devices } from '@playwright/test';

const FRONTEND_PORT = Number(process.env.FRONTEND_DEV_PORT || 4173);
const API_PORT = Number(process.env.FRONTEND_API_PORT || 4010);

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 5 * 60 * 1000,
  expect: {
    timeout: 15_000,
  },
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: `http://127.0.0.1:${FRONTEND_PORT}`,
    trace: 'on-first-retry',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: [
    {
      command: `node tests/mocks/frontend-api-server.js`,
      port: API_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
      env: {
        FRONTEND_API_PORT: String(API_PORT),
      },
    },
    {
      command: `npm --workspace revenuepilot-frontend run dev -- --host 127.0.0.1 --port ${FRONTEND_PORT} --strictPort`,
      port: FRONTEND_PORT,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      env: {
        VITE_API_URL: `http://127.0.0.1:${API_PORT}`,
        NODE_ENV: 'development',
      },
    },
  ],
  projects: [
    {
      name: 'chromium',
      use: devices['Desktop Chrome'],
    },
  ],
});
