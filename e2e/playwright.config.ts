import { randomBytes } from 'node:crypto';
import { defineConfig, devices } from '@playwright/test';
import { API_LOG, API_PORT, WEB_URL } from './servers';

// Local runs read TEST_DATABASE_URL from the repo's .env; CI sets it directly.
try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  // No .env file.
}

/**
 * End-to-end: the real web app (Vite) and API (Node) against the test database, which is
 * rebuilt before each run. Emails go to the API log, where the tests read their links.
 */
export default defineConfig({
  testDir: '.',
  outputDir: '.output/results',
  workers: 1,
  forbidOnly: !!process.env.CI,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: WEB_URL,
    locale: 'es-CO',
    timezoneId: 'America/Bogota',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chrome',
      // Locally, the installed Google Chrome; CI installs Playwright's Chromium instead.
      use: { ...devices['Desktop Chrome'], channel: process.env.CI ? undefined : 'chrome' },
    },
  ],
  webServer: [
    {
      cwd: '../apps/api',
      command: `mkdir -p "$(dirname '${API_LOG}')" && pnpm db:reset-test && exec pnpm exec tsx src/server.ts > '${API_LOG}' 2>&1`,
      url: `http://localhost:${API_PORT}/api/health`,
      env: {
        NODE_ENV: 'test',
        // CI connects the API with the limited login hosted environments use (README).
        DATABASE_URL: process.env.E2E_APP_DATABASE_URL ?? process.env.TEST_DATABASE_URL ?? '',
        PORT: String(API_PORT),
        APP_URL: WEB_URL,
        AUTH_SECRET: randomBytes(32).toString('base64'),
        EMAIL_DAILY_LIMIT: '1000',
        // Every spec signs in a new user from this machine; the API's own tests cover the limit.
        AUTH_SIGN_IN_LIMIT: '50',
      },
      reuseExistingServer: false,
      timeout: 60_000,
    },
    {
      cwd: '../apps/web',
      command: `pnpm exec vite --port ${new URL(WEB_URL).port} --strictPort`,
      url: WEB_URL,
      env: { API_PROXY_TARGET: `http://localhost:${API_PORT}` },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
});
