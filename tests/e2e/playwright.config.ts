import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against production builds of web, admin and api
 * (`pnpm build` first). The API needs a migrated database (`pnpm db:migrate`).
 */
const isCI = Boolean(process.env.CI);

export default defineConfig({
  testDir: './specs',
  globalSetup: './global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'mobile-chromium', use: { ...devices['Pixel 7'] } },
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  // The API starts first: the web pages call it while rendering.
  webServer: [
    {
      command: 'pnpm --filter @jordan-sports/api run start',
      url: 'http://127.0.0.1:4000/healthz',
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @jordan-sports/web run start',
      url: 'http://127.0.0.1:3000/ar',
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
    {
      command: 'pnpm --filter @jordan-sports/admin run start',
      url: 'http://127.0.0.1:3001/ar/sign-in',
      reuseExistingServer: !isCI,
      timeout: 60_000,
    },
  ],
});
