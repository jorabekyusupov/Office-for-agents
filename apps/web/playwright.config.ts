import { defineConfig } from '@playwright/test';

const webOrigin = process.env.E2E_WEB_ORIGIN ?? 'http://127.0.0.1:3100';

export default defineConfig({
  testDir: './e2e',
  use: { baseURL: webOrigin, browserName: 'chromium', channel: 'chrome', headless: true },
  workers: 1,
  webServer: process.env.E2E_WEB_ORIGIN ? undefined : [
    { command: 'cd ../.. && API_PORT=3101 APP_ORIGIN=http://127.0.0.1:3100 API_ORIGIN=http://127.0.0.1:3101 pnpm --filter @ai-office/api dev', url: 'http://127.0.0.1:3101/health', reuseExistingServer: false },
    { command: 'cd ../.. && WORKER_HEALTH_PORT=3102 pnpm --filter @ai-office/worker dev', url: 'http://127.0.0.1:3102', reuseExistingServer: false },
    { command: 'cd ../.. && WEB_PORT=3100 NEXT_PUBLIC_API_ORIGIN=http://127.0.0.1:3101 pnpm --filter @ai-office/web dev', url: webOrigin, reuseExistingServer: false },
  ],
});
