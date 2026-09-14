// Daycare Day Sheet end-to-end suite. Lead-owned: slices ask the lead for changes in their report.
// Every spec runs against the real Worker (it serves app/public), started fresh by tests/start-worker.mjs on E2E_PORT
// with TEST_MODE=1. One worker: the specs share one D1.
//   dd2:  E2E_PORT=7803 npx playwright test tests/web
//   dd1:  E2E_PORT=7804 npx playwright test tests/door
//   lead: E2E_PORT=7808 npx playwright test tests/journey    QA: E2E_PORT=7809 npx playwright test
// E2E_WORKER_DIR points the server at a copy of worker/ (negative controls); default ../worker.
// Devices: the door tablet is 1024x768 with touch; staff phones are 390 wide with touch; the office is also checked at 1280.
import { defineConfig } from '@playwright/test'

const PORT = Number(process.env.E2E_PORT || 7803)

export const DEVICES = {
  tablet: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  phone: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
}

const engines = ['chromium', 'webkit']

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.mjs',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 60_000,
  expect: { timeout: 8_000 },
  outputDir: './tests/results',
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: {
    command: 'node tests/start-worker.mjs',
    url: `http://127.0.0.1:${PORT}/api/info`,
    reuseExistingServer: false,
    timeout: 120_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: { E2E_PORT: String(PORT), E2E_WORKER_DIR: process.env.E2E_WORKER_DIR || '' },
  },
  projects: engines.flatMap((e) => [
    { name: `${e}-tablet`, use: { browserName: e, ...DEVICES.tablet }, testMatch: ['door/**/*.spec.mjs', 'journey/**/*.spec.mjs'] },
    { name: `${e}-390`, use: { browserName: e, ...DEVICES.phone }, testMatch: ['web/**/*.spec.mjs'] },
    { name: `${e}-1280`, use: { browserName: e, ...DEVICES.desktop }, testMatch: ['web/**/*.spec.mjs'] },
  ]),
})
