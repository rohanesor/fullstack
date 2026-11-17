import { defineConfig, devices } from '@playwright/test';

// Starts a fresh backend (demo data, throwaway SQLite DB) and the Vite dev server, then runs the end-to-end suite.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: 'http://127.0.0.1:5173', trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] }, testMatch: /mobile\.spec\.ts/ },
  ],
  webServer: [
    { command: 'node e2e/start-backend.mjs', url: 'http://127.0.0.1:8000/api/v1/health', reuseExistingServer: false, timeout: 60_000 },
    { command: 'npm run dev -- --host 127.0.0.1 --strictPort', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI, timeout: 60_000 },
  ],
});
