import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './e2e', fullyParallel: false, workers: 1, retries: 0, timeout: 120000,
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8080', headless: true,
    screenshot: 'only-on-failure', trace: 'retain-on-failure', viewport: { width: 1440, height: 1000 } },
  reporter: [['list'], ['html', { open: 'never' }]],
});
