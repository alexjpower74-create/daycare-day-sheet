// Shared e2e helpers. Lead-owned: slices import them and ask the lead for changes in their report.
// REAL input only: tap() hit-tests the target's centre with elementFromPoint before a real touch or click, typing is
// page.keyboard, signatures are real pointer/touch drags, and evaluate is only ever used to read. Setting up data through the
// API is fine; the thing under test is always driven through the page.
import { expect } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { DEVICES } from '../playwright.config.mjs'

export const NOW = '2026-09-14T11:30:00Z' // Mon Sep 14 2026, 9:00 AM NDT
export const at = (localIso) => new Date(localIso).toISOString() // e.g. at('2026-09-14T22:30:00-02:30')
export const CENTRE = 'SAMPLE Little Harbour Child Care (demo)'
export const SUPERVISOR_PIN = '4826'
export const EDUCATOR_PIN = '1593' // Marie T. (SAMPLE); Kevin 2604, Priya 3715
export const PORT = Number(process.env.E2E_PORT || 7803)
export const BASE = `http://127.0.0.1:${PORT}`
const HERE = path.dirname(fileURLToPath(import.meta.url))

// ---------- context setup ----------
const LOCAL = new Set(['127.0.0.1', 'localhost'])
const isThirdParty = (url) => /^https?:$/.test(url.protocol) && !LOCAL.has(url.hostname)

/** Pinned server clock and a record of anything that tried to leave this computer. */
export async function guardContext(context, { now = NOW } = {}) {
  await context.setExtraHTTPHeaders({ 'X-Test-Now': now })
  const offenders = []
  context.__offenders = offenders
  await context.route(isThirdParty, (route) => {
    offenders.push(route.request().url())
    return route.abort()
  })
}

/** Move the server clock the pages see (every later request from this context carries it). */
export async function setNow(context, now) {
  await context.setExtraHTTPHeaders({ 'X-Test-Now': now })
}

/** Fail when any request tried to reach a host other than 127.0.0.1. */
export function assertNoThirdParty(context) {
  expect(context.__offenders ?? [], 'requests that tried to leave 127.0.0.1').toEqual([])
}

/** Every test starts here: a clean SAMPLE centre and a guarded context. */
export async function fresh(context, request, { now = NOW } = {}) {
  await guardContext(context, { now })
  const r = await request.post('/api/test/reset', { headers: { 'X-Test-Now': now } })
  expect(r.status(), 'POST /api/test/reset').toBe(200)
}

/** Another person on another device: kind 'tablet' (door), 'phone' (staff or parent), 'desktop' (office). Same engine. */
export async function newContext(browser, kind, { now = NOW } = {}) {
  const context = await browser.newContext({ ...DEVICES[kind], baseURL: BASE })
  await guardContext(context, { now })
  return context
}

// ---------- real input ----------
export const isCoarse = (page) => page.evaluate(() => matchMedia('(pointer: coarse)').matches)

async function hitTest(locator, x, y) {
  return locator.evaluate((el, [px, py]) => {
    const t = document.elementFromPoint(px, py)
    return t === el || el.contains(t) ? '' : t ? t.outerHTML.slice(0, 160) : 'nothing'
  }, [x, y])
}

/** Hit-test the centre with elementFromPoint, then a real touch (coarse pointer) or mouse click. */
export async function tap(page, locator, label = String(locator)) {
  await expect(locator).toBeVisible()
  await locator.scrollIntoViewIfNeeded()
  let box = await locator.boundingBox()
  expect(box, `tap(${label}): no box`).not.toBeNull()
  // "In view" to Playwright includes under a sticky header, where a person could not tap it. Pages mark sticky headers
  // with data-sticky-header; only in that case scroll the target to the middle first. Anything else on top still fails.
  const headerBottom = await page.evaluate(() => Math.max(0, ...[...document.querySelectorAll('[data-sticky-header]')].map((h) => h.getBoundingClientRect().bottom)))
  if (box.y + box.height / 2 < headerBottom) {
    await locator.evaluate((el) => el.scrollIntoView({ block: 'center' }))
    box = await locator.boundingBox()
  }
  const x = box.x + box.width / 2
  const y = box.y + box.height / 2
  expect(await hitTest(locator, x, y), `tap(${label}) hit-test at ${Math.round(x)},${Math.round(y)}: something else is on top`).toBe('')
  if (await isCoarse(page)) await page.touchscreen.tap(x, y)
  else await page.mouse.click(x, y)
}

/** Tap into a field and type. clear: select what is there first so typing replaces it. */
export async function type(page, locator, text, { clear = false } = {}) {
  await tap(page, locator)
  await expect(locator).toBeFocused()
  const before = clear ? '' : await locator.inputValue()
  if (clear) { await page.keyboard.press('ControlOrMeta+a'); await page.keyboard.press('Backspace') }
  // Touch projects send text the way a phone's on-screen keyboard does (insertText): Chromium's emulated touch silently drops
  // key presses typed straight after a touch tap (found on Firewood Orders). Mouse projects use real key presses.
  if (await isCoarse(page)) await page.keyboard.insertText(String(text))
  else await page.keyboard.type(String(text))
  await expect(locator, 'type(): the field should hold what was typed').toHaveValue(before + String(text))
}

/** Tap PIN digits on an on-screen keypad (buttons .key[data-key]), then the submit button. */
export async function keypad(page, pin, submit) {
  for (const d of String(pin)) await tap(page, page.locator(`button.key[data-key="${d}"]`), `key ${d}`)
  if (submit) await tap(page, submit, 'keypad submit')
}

/**
 * Sign on a signature pad with a real drag: a zig-zag across the middle of the pad.
 * Chromium touch projects use CDP Input.dispatchTouchEvent (real touch input at the browser level, pointerType "touch").
 * WebKit under Playwright has no touch-move API, so WebKit and mouse projects drag with page.mouse (real input, pointerType
 * "mouse"). Pads must listen to Pointer Events and set touch-action: none.
 */
export async function drawSignature(page, pad) {
  await expect(pad).toBeVisible()
  await pad.scrollIntoViewIfNeeded()
  const box = await pad.boundingBox()
  expect(box, 'signature pad: no box').not.toBeNull()
  const pts = []
  for (let i = 0; i <= 12; i++) {
    pts.push([box.x + box.width * (0.15 + 0.7 * (i / 12)), box.y + box.height * (i % 2 ? 0.35 : 0.65)])
  }
  expect(await hitTest(pad, pts[0][0], pts[0][1]), 'signature pad: something else is on top where the stroke starts').toBe('')
  const browserName = page.context().browser()?.browserType().name()
  if ((await isCoarse(page)) && browserName === 'chromium') {
    const cdp = await page.context().newCDPSession(page)
    const touch = (type, [x, y]) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] })
    await touch('touchStart', pts[0])
    for (const p of pts.slice(1)) {
      await touch('touchMove', p)
      await page.waitForTimeout(8)
    }
    await touch('touchEnd', pts.at(-1))
    await cdp.detach()
  } else {
    await page.mouse.move(pts[0][0], pts[0][1])
    await page.mouse.down()
    for (const p of pts.slice(1)) await page.mouse.move(p[0], p[1], { steps: 3 })
    await page.mouse.up()
  }
}

/** Size + hit-test for a tap target (size from the box is fine; occlusion only from elementFromPoint). */
export async function expectTapTarget(page, locator, min = 44, label = String(locator)) {
  await locator.scrollIntoViewIfNeeded()
  const box = await locator.boundingBox()
  expect(box, `${label}: no box`).not.toBeNull()
  expect(box.height, `${label} height`).toBeGreaterThanOrEqual(min)
  expect(box.width, `${label} width`).toBeGreaterThanOrEqual(min)
  expect(await hitTest(locator, box.x + box.width / 2, box.y + box.height / 2), `${label}: something else is on top`).toBe('')
}

/** WCAG contrast of an element's computed text colour on its first opaque background up the tree. */
export async function contrastOf(locator) {
  return locator.evaluate((el) => {
    const parse = (s) => (s.match(/[\d.]+/g) || []).map(Number)
    const lum = ([r, g, b]) => {
      const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
      return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b)
    }
    const fg = parse(getComputedStyle(el).color)
    let n = el; let bg = null
    while (n && n.nodeType === 1) {
      const cs = getComputedStyle(n)
      const c = parse(cs.backgroundColor)
      if (c.length >= 3 && (c.length === 3 || c[3] > 0.99)) { bg = c; break }
      if (cs.backgroundImage && cs.backgroundImage.includes('gradient')) {
        const stops = cs.backgroundImage.match(/rgba?\([^)]*\)/g) || []
        const ratios = stops.map((s) => { const b = parse(s); const [a, d] = [lum(fg), lum(b)].sort((x, y) => y - x); return (a + 0.05) / (d + 0.05) })
        if (ratios.length) return Math.min(...ratios)
      }
      n = n.parentElement
    }
    bg = bg || [11, 16, 32]
    const [a, b] = [lum(fg), lum(bg)].sort((x, y) => y - x)
    return (a + 0.05) / (b + 0.05)
  })
}

/** The meter colour a person sees: the computed --state colour on an element with data-state, as "rgb(r, g, b)". */
export async function stateColour(locator) {
  return locator.evaluate((el) => {
    const probe = document.createElement('span')
    probe.style.color = 'var(--state)'
    el.appendChild(probe)
    const c = getComputedStyle(probe).color
    probe.remove()
    return c
  })
}
export const STATE_RGB = { ok: 'rgb(74, 222, 128)', at_limit: 'rgb(251, 191, 36)', over: 'rgb(248, 113, 113)', unset: 'rgb(148, 163, 184)' }

// ---------- API setup helpers (setup only; never for the thing under test) ----------
export async function api(request, method, url, data, headers = {}, { now = NOW } = {}) {
  const r = await request.fetch(url, { method, data, headers: { 'X-Test-Now': now, ...headers } })
  let body = null
  const text = await r.text()
  try { body = JSON.parse(text) } catch { body = text }
  return { status: r.status(), body, type: r.headers()['content-type'] || '' }
}

export const bearer = (token) => ({ Authorization: `Bearer ${token}` })

export async function staffToken(request, pin = EDUCATOR_PIN) {
  const r = await api(request, 'POST', '/api/signin', { pin }, { 'X-Test-IP': `setup-${pin}` })
  expect(r.status, `sign in with SAMPLE PIN ${pin}`).toBe(200)
  return r.body.token
}
export const supervisorToken = (request) => staffToken(request, SUPERVISOR_PIN)

export async function doorToken(request) {
  const r = await api(request, 'POST', '/api/door/unlock', { pin: SUPERVISOR_PIN }, { 'X-Test-IP': 'setup-door' })
  expect(r.status, 'unlock the door with the SAMPLE supervisor PIN').toBe(200)
  return r.body.token
}

/** A generated scribble in the API's signature shape (setup only; the page tests sign with drawSignature). */
export const sampleSignature = () => ({ w: 600, h: 200, strokes: [[40, 150, 120, 60, 200, 140, 280, 50, 360, 150, 440, 70, 540, 120]] })

/** Sign a child in or out through the door API (setup). */
export async function signInViaApi(request, token, childId, personId, { now = NOW } = {}) {
  const r = await api(request, 'POST', `/api/door/children/${childId}/in`, { person_id: personId, signature: sampleSignature() }, bearer(token), { now })
  expect(r.status, `signInViaApi ${childId}: ${JSON.stringify(r.body)}`).toBe(201)
  return r.body
}
export async function signOutViaApi(request, token, childId, personId, { now = NOW } = {}) {
  const r = await api(request, 'POST', `/api/door/children/${childId}/out`, { person_id: personId, signature: sampleSignature() }, bearer(token), { now })
  expect(r.status, `signOutViaApi ${childId}: ${JSON.stringify(r.body)}`).toBe(200)
  return r.body
}
/** Put a staff member (by their token) into a room, or out of every room with null (setup). */
export async function presenceViaApi(request, token, roomId, { now = NOW } = {}) {
  const r = await api(request, 'POST', '/api/staff/presence', { room_id: roomId }, bearer(token), { now })
  expect(r.status, `presenceViaApi ${roomId}: ${JSON.stringify(r.body)}`).toBe(200)
  return r.body
}

// ---------- screenshots ----------
/** Viewport screenshot into app/tests/<dir>/shots/<project>-<name>.png (dir: door | web | journey). Viewport, not full page:
 *  full-page captures misplace sticky and fixed bars on phone screens (found on Firewood Orders). */
export async function shot(page, testInfo, dir, name) {
  const out = path.join(HERE, dir, 'shots')
  mkdirSync(out, { recursive: true })
  await page.waitForTimeout(60)
  await page.screenshot({ path: path.join(out, `${testInfo.project.name}-${name}.png`), animations: 'disabled' })
}
