// docs/shots/: screenshots of every main screen from a running `npm run demo` (SAMPLE centre and people only).
//   tablet  = Chromium 1024x768 with touch (the door tablet)
//   phone   = WebKit 390x844 with touch (staff phone and parent phone)
//   desktop = Chromium 1280x800 (start page, office, printable register)
// Viewport captures on purpose: full-page captures misplace sticky headers on phone screens (found on Firewood Orders).
// Sign-ins go through the on-screen keypad like a person's would. Nothing here is a test; the tests live in app/tests.
// Usage: npm run demo   (in another terminal), then   node tools/docs-shots.mjs [base, default http://127.0.0.1:7801]
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(new URL('../app/package.json', import.meta.url))
const { chromium, webkit } = require('@playwright/test')
const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT = path.join(ROOT, 'docs', 'shots')
const BASE = process.argv[2] || 'http://127.0.0.1:7801'
mkdirSync(OUT, { recursive: true })

async function json(url, opts = {}) {
  const r = await fetch(BASE + url, { ...opts, headers: { 'content-type': 'application/json', ...(opts.headers || {}) } })
  if (!r.ok) throw new Error(`${url} answered ${r.status}: ${await r.text()}`)
  return r.json()
}
const post = (url, body, token) => json(url, { method: 'POST', body: JSON.stringify(body ?? {}), headers: token ? { Authorization: `Bearer ${token}` } : {} })

// Real SAMPLE rows from the demo: a child not in yet (for the signature pad), a child who is in (for the pick-up list),
// and a fresh parent link for Ava.
const door = (await post('/api/door/unlock', { pin: '4826' })).token
const kids = (await json('/api/door/children', { headers: { Authorization: `Bearer ${door}` } })).children
const notIn = kids.find((k) => k.status === 'not_in_yet')
const inNow = kids.find((k) => k.id === 'c_ava' && k.status === 'in') || kids.find((k) => k.status === 'in')
const staff = (await post('/api/signin', { pin: '1593' })).token
const link = (await post('/api/staff/children/c_ava/note/link', {}, staff)).url
const today = (await json('/api/info')).today
await post('/api/signout', {}, staff)
await post('/api/signout', {}, door)

const PROFILES = {
  tablet: { engine: chromium, use: { viewport: { width: 1024, height: 768 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true } },
  phone: { engine: webkit, use: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true } },
  desktop: { engine: chromium, use: { viewport: { width: 1280, height: 800 } } },
}

async function open(kind) {
  const browser = await PROFILES[kind].engine.launch()
  const context = await browser.newContext(PROFILES[kind].use)
  const page = await context.newPage()
  const shot = async (name) => {
    await page.waitForLoadState('networkidle', { timeout: 3000 }).catch(() => {})
    await page.waitForTimeout(600)
    await page.screenshot({ path: path.join(OUT, `${kind}-${name}.png`), animations: 'disabled' })
    console.log(`docs/shots/${kind}-${name}.png`)
  }
  const keypad = async (pin) => {
    for (const d of pin) await page.locator(`button.key[data-key="${d}"]`).click()
    await page.locator('#pin-enter').click()
  }
  return { browser, page, shot, keypad }
}

// ---- door tablet ----
{
  const { browser, page, shot, keypad } = await open('tablet')
  await page.goto(BASE + '/door/')
  await page.locator('button.key[data-key="1"]').waitFor()
  await shot('door-setup')
  await keypad('4826')
  await page.locator('button.child').first().waitFor()
  await shot('door-grid')
  if (inNow) {
    await page.locator(`button.child[data-child="${inNow.id}"]`).click()
    await page.locator('#action-out').waitFor()
    await shot('door-sheet')
    await page.locator('#action-out').click()
    await page.locator('#someone-else').waitFor()
    await shot('door-pick-up')
    await page.locator('#someone-else').click()
    await page.locator('#not-on-list').waitFor()
    await shot('door-not-on-list')
    await page.locator('#back').click()
    await page.locator('#back').click().catch(() => {})
    await page.goto(BASE + '/door/')
    await page.locator('button.child').first().waitFor()
  }
  if (notIn) {
    await page.locator(`button.child[data-child="${notIn.id}"]`).click()
    await page.locator('#action-in').click()
    await page.locator('button.person').first().click()
    await page.locator('#pad').waitFor()
    await shot('door-sign-here')
  }
  await browser.close()
}

// ---- staff phone and parent phone ----
{
  const { browser, page, shot, keypad } = await open('phone')
  await page.goto(BASE + '/')
  await shot('start')
  await page.goto(BASE + '/room/')
  await page.locator('button.key[data-key="1"]').waitFor()
  await shot('room-sign-in')
  await keypad('1593')
  await page.locator('button.room[data-room="r_toddler"]').click()
  await page.locator('#room-label').waitFor()
  await shot('room-toddler-over')
  await page.locator('button.room[data-room="r_infant"]').click()
  await page.locator('button.child').first().click()
  await page.locator('#child-sheet button.log').first().waitFor()
  await shot('room-child-sheet')
  await page.goto(`${BASE}/room/note/?child=c_ava`)
  await page.locator('#make-link').waitFor()
  await shot('staff-note')
  await page.goto(BASE + link)
  await page.locator('#note [data-section]').first().waitFor()
  await shot('parent-note')
  await browser.close()
}

// ---- office and register ----
{
  const { browser, page, shot, keypad } = await open('desktop')
  await page.goto(BASE + '/')
  await shot('start')
  await page.goto(BASE + '/office/')
  await keypad('4826')
  for (const [tab, name] of [['Today', 'office-today'], ['Attendance', 'office-attendance'], ['Rooms and ratios', 'office-ratios'], ['Children', 'office-children']]) {
    await page.getByRole('tab', { name: tab }).click()
    await shot(name)
  }
  await page.goto(`${BASE}/office/register/?date=${today}&room=r_infant`)
  await page.waitForTimeout(800)
  await shot('register-infant-room')
  await browser.close()
}
