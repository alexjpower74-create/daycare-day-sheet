// M1 page check and screenshots against the ?mock=1 stand-in (dd1's Worker is not merged yet). NOT a Playwright spec and not
// evidence for the contract: the M2 specs run against the real Worker. What this does prove: the pages load without console
// errors in chromium and webkit, the flows work by real taps (elementFromPoint hit-test before every tap, touch on the phone),
// nothing scrolls sideways at 390, every visible button is at least 44 px, and "Ate all" is not covered right after a toast.
//   node tests/web/mock-shots.mjs                 all checks + shots into tests/web/shots/
//   ONLY=chromium-390 node tests/web/mock-shots.mjs   one engine and width
//   REAL=1 node tests/web/mock-shots.mjs          the same walk against a real Worker on E2E_PORT (TEST_MODE=1), set up through the API, no shots
//   NEG=overlay node tests/web/mock-shots.mjs     negative control: a transparent layer over "Ate all" must turn the run red
import { chromium, webkit } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { serve } from './serve.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, 'shots')
const REAL = process.env.REAL === '1'
const PORT = Number(process.env.E2E_PORT || 7801)
const NINE = '2026-09-14T11:30:00Z'
const Q = REAL ? '' : 'mock=1' // query that selects the mock
const BASE = `http://127.0.0.1:${PORT}`
const NEG = process.env.NEG || ''
mkdirSync(OUT, { recursive: true })

const DEVICES = {
  390: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  1280: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, hasTouch: false, isMobile: false },
}

class CheckFailed extends Error {}
const must = (cond, msg) => { if (!cond) throw new CheckFailed(msg) }

async function hitTest(locator, x, y) {
  return locator.evaluate((el, [px, py]) => {
    const t = document.elementFromPoint(px, py)
    return t === el || el.contains(t) ? '' : t ? t.outerHTML.slice(0, 140) : 'nothing'
  }, [x, y])
}

async function tap(page, locator, label) {
  await locator.waitFor({ state: 'visible', timeout: 8000 })
  await locator.scrollIntoViewIfNeeded()
  let box = await locator.boundingBox()
  const headerBottom = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('[data-sticky-header]')].map((h) => h.getBoundingClientRect().bottom)))
  if (box.y + box.height / 2 < headerBottom) {
    await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    box = await locator.boundingBox()
  }
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  const hit = await hitTest(locator, x, y)
  must(hit === '', `tap(${label}): something else is on top: ${hit}`)
  if (DEVICES[page.__width].hasTouch) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

async function typeInto(page, locator, text, label) {
  await tap(page, locator, label)
  if (DEVICES[page.__width].hasTouch) await page.keyboard.insertText(text)
  else await page.keyboard.type(text)
}

const shot = (page, name) => REAL ? Promise.resolve() : page.screenshot({ path: path.join(OUT, `${page.__project}-${name}.png`), animations: 'disabled' })

async function waitText(locator, text, label) {
  try {
    await locator.filter({ hasText: text }).first().waitFor({ state: 'visible', timeout: 8000 })
  } catch {
    throw new CheckFailed(`${label}: expected "${text}", got "${(await locator.first().textContent().catch(() => '')) || ''}"`)
  }
}

async function layoutChecks(page, where) {
  const sideways = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  must(sideways <= 0, `${where}: scrolls sideways by ${sideways}px`)
  if (page.__width !== 390) return
  const small = await page.evaluate(() => [...document.querySelectorAll('button, a.btn')]
    .filter((b) => b.offsetParent !== null && !b.closest('[hidden]'))
    .map((b) => { const r = b.getBoundingClientRect(); return { t: (b.textContent || b.getAttribute('aria-label') || '').trim().slice(0, 30), w: r.width, h: r.height } })
    .filter((r) => r.w < 44 || r.h < 44))
  must(small.length === 0, `${where}: buttons under 44 px: ${JSON.stringify(small)}`)
  const badge = await page.locator('.sample-badge').first().isVisible()
  must(badge, `${where}: SAMPLE badge not visible`)
}

async function run(engine, width) {
  const browser = await engine.launch()
  const context = await browser.newContext({ ...DEVICES[width], baseURL: BASE })
  if (REAL) { await context.setExtraHTTPHeaders({ 'X-Test-Now': NINE }); await setupReal() }
  if (engine === chromium) await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: BASE })
  const errors = []
  const offenders = []
  await context.route((u) => !['127.0.0.1', 'localhost'].includes(u.hostname), (r) => { offenders.push(r.request().url()); return r.abort() })
  const page = await context.newPage()
  const watch = (p) => {
    p.__width = width
    p.__project = `${engine.name()}-${width}`
    p.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`))
    // The browser logs every non-2xx fetch as "Failed to load resource" (the wrong-PIN 401 is one on purpose); the walk's own checks
    // catch a real failure, so only script errors and other console errors count here.
    p.on('console', (m) => { if (m.type() === 'error' && !/^Failed to load resource/.test(m.text())) errors.push(`console: ${m.text()}`) })
  }
  watch(page)
  const project = page.__project
  try {
    // Start page
    await page.goto(REAL ? '/' : '/?mock=1&mockreset=1')
    await waitText(page.locator('#today-line'), 'Monday, September 14', 'start page date from the API')
    await layoutChecks(page, 'start')
    await shot(page, 'start')

    // Staff sign in: wrong PIN, then Marie
    await page.goto('/room/')
    await page.locator('button.key[data-key="1"]').waitFor()
    await shot(page, 'room-signin')
    for (const d of '9999') await tap(page, page.locator(`button.key[data-key="${d}"]`), `key ${d}`)
    await tap(page, page.locator('#pin-enter'), 'Enter')
    await waitText(page.locator('#pin-error'), 'That PIN is not right.', 'wrong PIN')
    for (const d of '1593') await tap(page, page.locator(`button.key[data-key="${d}"]`), `key ${d}`)
    await tap(page, page.locator('#pin-enter'), 'Enter')
    await page.locator('button.room[data-room="r_infant"]').waitFor()
    must(await page.locator('button.room[data-room="r_infant"]').getAttribute('data-state') === 'at_limit', 'infant room should start at_limit')

    // Preschool is over; its label says so
    await tap(page, page.locator('button.room[data-room="r_preschool"]'), 'preschool card')
    must(await page.locator('button.room[data-room="r_preschool"]').getAttribute('aria-pressed') === 'true', 'preschool card pressed')
    await waitText(page.locator('#room-label'), 'Needs 1 more staff.', 'preschool label')
    await layoutChecks(page, 'room preschool')
    await shot(page, 'room-over')
    await tap(page, page.locator('button.room[data-room="r_infant"]'), 'infant card')
    await waitText(page.locator('#presence'), 'I\'m leaving this room', 'Marie is counted in the infant room')
    await layoutChecks(page, 'room infant')
    await shot(page, 'room')

    // Child sheet
    await tap(page, page.locator('button.child[data-child="c_ava"]'), 'Ava card')
    await page.locator('#child-sheet').waitFor()
    must(await page.locator('button.meal[aria-pressed="true"]').getAttribute('data-meal') === 'breakfast', 'breakfast preselected at 9:00 AM')
    await layoutChecks(page, 'child sheet')
    await shot(page, 'sheet')
    await tap(page, page.locator('button.meal[data-meal="lunch"]'), 'Lunch chip')
    if (NEG === 'overlay') {
      await page.locator('button.log[data-value="all"]').evaluate((el) => {
        const r = el.getBoundingClientRect()
        const d = document.createElement('div')
        d.style.cssText = `position:fixed;left:${r.left}px;top:${r.top}px;width:${r.width}px;height:${r.height}px;z-index:9999;background:transparent`
        document.body.append(d)
      })
    }
    const ateAll = page.locator('button.log[data-kind="meal"][data-value="all"]')
    await tap(page, ateAll, 'Ate all')
    await waitText(page.locator('#toast'), 'Saved: Lunch: ate all', 'toast after a log')
    const box = await ateAll.boundingBox()
    must(await hitTest(ateAll, box.x + box.width / 2, box.y + box.height / 2) === '', '"Ate all" is covered right after the toast')
    await waitText(page.locator('#today-logs [data-log]'), 'Lunch: ate all', 'Today list')
    await shot(page, 'sheet-toast')

    // Nap start, then Undo from the toast brings Nap start back
    await tap(page, page.locator('button.log[data-kind="nap_start"]'), 'Nap start')
    await page.locator('button.log[data-kind="nap_end"]').waitFor()
    await tap(page, page.locator('#toast button.undo'), 'toast Undo')
    await page.locator('button.log[data-kind="nap_start"]').waitFor()

    // Note, then move to the toddler room
    await typeInto(page, page.locator('#note-text'), 'Loved the water table.', 'note text')
    await tap(page, page.locator('#save-note'), 'Save note')
    await waitText(page.locator('#today-logs [data-log]'), 'Loved the water table.', 'note in Today')
    await tap(page, page.locator('button.move[data-room="r_toddler"]'), 'Move to toddler')
    await waitText(page.locator('#toast'), 'moved to Toddler room', 'move toast')
    await tap(page, page.locator('#child-sheet .sheet-close'), 'Close')
    await page.locator('#child-sheet').waitFor({ state: 'detached' })
    await waitText(page.locator('button.room[data-room="r_toddler"] .room-count'), '4 children', 'toddler count after move')
    must(await page.locator('button.room[data-room="r_infant"]').getAttribute('data-state') === 'ok', 'infant room ok after the move')

    // Record without a signature (Owen)
    await tap(page, page.locator('button.record[data-child="c_owen"]'), 'Record without a signature')
    await page.locator('#record-sheet button.person').first().waitFor()
    await layoutChecks(page, 'record sheet')
    await shot(page, 'record')
    await tap(page, page.locator('#record-sheet button.person[data-person="p_owen_mother"]'), 'Owen\'s mother')
    await page.locator('button.child[data-child="c_owen"]').waitFor()
    await waitText(page.locator('button.child[data-child="c_owen"]'), 'Signature needed', 'Owen card flag')

    // Staff note for Ava
    await tap(page, page.locator('button.room[data-room="r_toddler"]'), 'toddler card')
    await tap(page, page.locator('button.child[data-child="c_ava"]'), 'Ava card in toddler room')
    await tap(page, page.locator('#open-note'), 'Daily note')
    await page.waitForURL('**/room/note/?child=c_ava')
    await page.locator('#note [data-section="meals"]').waitFor()
    await typeInto(page, page.locator('#note-line'), 'A great morning.', 'note line')
    await tap(page, page.locator('#save-line'), 'Save line')
    await waitText(page.locator('#note [data-section="line"]'), 'A great morning.', 'line in the note')
    await tap(page, page.locator('#make-link'), 'Make parent link')
    await page.locator('#note-link').waitFor()
    const link = await page.locator('#note-link').inputValue()
    must(/\/note\/\?t=[A-Za-z0-9_-]{43}/.test(link), `parent link shape: ${link}`)
    await tap(page, page.locator('#copy-link'), 'Copy link')
    await waitText(page.locator('#copy-link'), 'Copied', 'Copy link says Copied')
    if (engine === chromium) must(await page.evaluate(() => navigator.clipboard.readText()) === link, 'clipboard holds the link')
    await layoutChecks(page, 'staff note')
    await shot(page, 'staff-note')

    // Parent note (same browser storage, so the mock knows the token)
    const parent = await context.newPage()
    watch(parent)
    await parent.goto(link)
    for (const sec of ['meals', 'sleep', 'toileting', 'mood', 'activities', 'staff-notes', 'line']) await parent.locator(`#note [data-section="${sec}"]`).waitFor()
    await waitText(parent.locator('#note [data-section="meals"]'), 'Lunch: Ate all', 'parent meals')
    await waitText(parent.locator('#note [data-section="staff-notes"]'), 'Loved the water table.', 'parent staff notes')
    await waitText(parent.locator('#note'), 'Daily record of sleeping, eating and toileting', 'infant record title')
    must(!/709-555/.test(await parent.locator('body').innerText()), 'a phone number is on the parent page')
    await layoutChecks(parent, 'parent note')
    await shot(parent, 'parent-note')
    await parent.emulateMedia({ media: 'print' })
    must(!(await parent.locator('#print').isVisible()), 'print media: #print hidden')
    must(await parent.locator('#note [data-section="meals"]').isVisible(), 'print media: sections visible')
    await shot(parent, 'parent-note-print')
    await parent.emulateMedia({ media: 'screen' })
    await parent.goto(`/note/?t=not-a-real-token${REAL ? '' : '&mock=1'}`)
    await waitText(parent.locator('#note-error'), 'We couldn\'t find that note. Ask the centre for a new link.', 'unknown token')
    must(await parent.locator('#note [data-section]').count() === 0, 'no note section on an unknown token')
    await shot(parent, 'parent-note-error')

    must(errors.length === 0, `console errors: ${errors.join(' | ')}`)
    must(offenders.length === 0, `requests left 127.0.0.1: ${offenders.join(' ')}`)
    console.log(`PASS ${project}`)
    return true
  } catch (e) {
    console.log(`FAIL ${project}: ${e.message}`)
    await page.screenshot({ path: path.join(OUT, `${project}-FAILED.png`) }).catch(() => {})
    return false
  } finally {
    await browser.close()
  }
}

// The mock's seeded day, made through the real API (setup only; the walk itself is all taps).
async function setupReal() {
  const call = async (method, path, body, token, ip = 'walk-setup') => {
    const r = await fetch(BASE + path, { method, headers: { 'X-Test-Now': NINE, 'X-Test-IP': ip, 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) }, body: body ? JSON.stringify(body) : undefined })
    const j = await r.json()
    if (r.status >= 300) throw new CheckFailed(`setup ${method} ${path}: ${r.status} ${JSON.stringify(j)}`)
    return j
  }
  await call('POST', '/api/test/reset')
  const door = (await call('POST', '/api/door/unlock', { pin: '4826' })).token
  const sig = { w: 600, h: 200, strokes: [[40, 150, 120, 60, 200, 140, 280, 50]] }
  for (const c of ['ava', 'liam', 'nora', 'jack', 'emma', 'leo', 'ben', 'lucy', 'sam', 'grace', 'eli', 'zoe', 'max', 'ruby', 'finn']) {
    await call('POST', `/api/door/children/c_${c}/in`, { person_id: `p_${c}_mother`, signature: sig }, door)
  }
  const pins = { r_infant: '1593', r_toddler: '2604', r_preschool: '3715' }
  let kevin
  for (const [room, pin] of Object.entries(pins)) {
    const t = (await call('POST', '/api/signin', { pin })).token
    await call('POST', '/api/staff/presence', { room_id: room }, t)
    if (room === 'r_toddler') kevin = t
  }
  await call('POST', '/api/staff/children/c_finn/move', { room_id: 'r_preschool' }, kevin)
  await call('POST', '/api/staff/children/c_ava/logs', { kind: 'meal', value: 'all', meal: 'breakfast' }, kevin)
  await call('POST', '/api/staff/children/c_liam/logs', { kind: 'nap_start' }, kevin)
}

const server = REAL ? null : await serve(PORT)
const results = []
const ONLY = process.env.ONLY || '' // e.g. ONLY=chromium-390
for (const [engine, width] of [[chromium, 390], [chromium, 1280], [webkit, 390], [webkit, 1280]]) {
  if (!ONLY || ONLY === `${engine.name()}-${width}`) results.push(await run(engine, width))
}
server?.close()
const allPass = results.every(Boolean)
if (NEG) {
  console.log(allPass ? `NEGATIVE CONTROL ${NEG}: still green, the check measured nothing` : `NEGATIVE CONTROL ${NEG}: red as it should be`)
  process.exit(allPass ? 1 : 0)
}
process.exit(allPass ? 0 : 1)
