// The centre's name and SAMPLE badge come from the API, never from the page (docs/API.md: before the centre row exists,
// /api/info answers "" and pages show no name). The "before setup" test starts a second real Worker on 7801 from a freshly
// migrated D1 that nobody resets, so there is truly no centre row; the "after reset" test is its positive twin on the e2e Worker.
import { test, expect } from '@playwright/test'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { fresh, assertNoThirdParty, api } from '../helpers.mjs'

const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const EMPTY_PORT = 7801 // dd2's dev port; nothing else of dd2's uses it during a test run
const EMPTY = `http://127.0.0.1:${EMPTY_PORT}`
const PAGES = ['/', '/room/', '/room/note/?child=c_ava', '/note/?t=not-a-real-token', '/office/']

test.beforeEach(async ({ context, request }) => { await fresh(context, request) })
test.afterEach(async ({ context }) => { assertNoThirdParty(context) })

async function waitForInfo(url, timeoutMs = 120_000) {
  const until = Date.now() + timeoutMs
  while (Date.now() < until) {
    try {
      const r = await fetch(`${url}/api/info`)
      if (r.ok) return r.json()
    } catch { /* not up yet */ }
    await new Promise((resolve) => setTimeout(resolve, 500))
  }
  throw new Error(`no Worker answered on ${url}`)
}

test('before the centre row exists, no page shows a centre name, and the SAMPLE badge follows the API\'s sample flag', async ({ page }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('390'), 'Starts a second Worker; once per engine is enough.')
  test.setTimeout(180_000)
  const worker = spawn('node', ['tests/start-worker.mjs'], {
    cwd: APP, detached: true, stdio: 'ignore', env: { ...process.env, E2E_PORT: String(EMPTY_PORT), E2E_WORKER_DIR: '' },
  })
  try {
    const info = await waitForInfo(EMPTY)
    expect(info.centre_name, 'the Worker really has no centre row').toBe('')
    // API.md: the badge is driven by `sample`. Before setup this Worker answers sample: true (reported to the lead).
    const badges = info.sample === true ? 1 : 0
    for (const p of PAGES) {
      const answered = page.waitForResponse((r) => r.url() === `${EMPTY}/api/info`)
      await page.goto(`${EMPTY}${p}`)
      await answered
      await expect(page.locator('#centre-name'), `${p}: centre name`).toHaveText('')
      await expect(page.locator('.centre .sample-badge:visible'), `${p}: SAMPLE badge follows sample: ${info.sample}`).toHaveCount(badges)
      expect(await page.locator('body').innerText(), `${p}: no guessed name anywhere`).not.toContain('Little Harbour')
      expect(await page.title(), `${p}: title`).not.toContain('Little Harbour')
    }
  } finally {
    try { process.kill(-worker.pid, 'SIGTERM') } catch { /* already gone */ }
  }
})

test('after setup the name on every page is exactly the API\'s centre_name, with the SAMPLE badge because sample is true', async ({ page, request }) => {
  const info = (await api(request, 'GET', '/api/info')).body
  expect([info.centre_name, info.sample]).toEqual(['SAMPLE Little Harbour Child Care (demo)', true])
  for (const p of PAGES) {
    await page.goto(p)
    await expect(page.locator('#centre-name'), `${p}: centre name`).toHaveText(info.centre_name)
    await expect(page.locator('.centre .sample-badge'), `${p}: SAMPLE badge`).toBeVisible()
  }
})
