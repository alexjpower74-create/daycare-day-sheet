// Targets and legibility for dd2's pages against the real Worker: SAMPLE on every page, no sideways scroll, tap targets that are
// big enough and are what a finger hits, primary button contrast, and an open child sheet whose controls never sit under its
// header or its toast.
import { test, expect } from '@playwright/test'
import {
  fresh, assertNoThirdParty, tap, keypad, expectTapTarget, contrastOf, api, bearer, staffToken, doorToken, signInViaApi,
  presenceViaApi, shot, EDUCATOR_PIN,
} from '../helpers.mjs'

const PAGES = ['/', '/room/', '/room/note/', '/note/', '/office/']

test.beforeEach(async ({ context, request }) => { await fresh(context, request) })
test.afterEach(async ({ context }) => { assertNoThirdParty(context) })

async function sidewaysScroll(page) {
  return page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
}

/** Every visible button and button-styled link in scope: centred in its scroller, then size + elementFromPoint. */
async function checkTargets(page, scope, where) {
  const targets = scope.locator('button, a.btn')
  const n = await targets.count()
  expect(n, `${where}: has buttons`).toBeGreaterThan(0)
  let checked = 0
  for (let i = 0; i < n; i++) {
    const el = targets.nth(i)
    if (!(await el.isVisible())) continue
    await el.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' }))
    const name = ((await el.getAttribute('aria-label')) || (await el.textContent()) || '').trim().replace(/\s+/g, ' ').slice(0, 40)
    await expectTapTarget(page, el, 44, `${where}: "${name}"`)
    checked++
  }
  return checked
}

test('SAMPLE is visible on every page and no page scrolls sideways', async ({ page }, testInfo) => {
  for (const path of PAGES) {
    await page.goto(path)
    await expect(page.locator('.sample-badge').first(), `SAMPLE badge on ${path}`).toBeVisible()
    await expect(page.locator('.sample-badge').first()).toHaveText('SAMPLE')
    expect(await sidewaysScroll(page), `${path} scrolls sideways`).toBeLessThanOrEqual(0)
    if (path === '/') await shot(page, testInfo, 'web', 'start')
  }
})

test('at 390 every button is at least 44 px and hit-tests to itself, and primary buttons have contrast of 4.5 or more', async ({ page, request }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('390'), 'Tap-target size is a phone check; the 1280 projects run the rest of the suite.')
  const marie = await staffToken(request)
  await presenceViaApi(request, marie, 'r_toddler') // Marie is counted elsewhere, so the infant room offers the primary "I'm in this room"
  const door = await doorToken(request)
  for (const c of ['ava', 'liam']) await signInViaApi(request, door, `c_${c}`, `p_${c}_mother`)
  await api(request, 'POST', '/api/staff/children/c_liam/logs', { kind: 'nap_start' }, bearer(marie))

  // Keypad
  await page.goto('/room/')
  const keypadChecked = await checkTargets(page, page.locator('main'), 'keypad')
  expect(keypadChecked).toBe(12)
  expect(await contrastOf(page.locator('#pin-enter')), 'Enter contrast').toBeGreaterThanOrEqual(4.5)
  await keypad(page, EDUCATOR_PIN, page.locator('#pin-enter'))
  await expect(page.locator('button.room[data-room="r_infant"]')).toBeVisible()
  expect(await sidewaysScroll(page), 'room view scrolls sideways').toBeLessThanOrEqual(0)

  // Room view
  await tap(page, page.locator('button.room[data-room="r_infant"]'), 'Infant room card')
  await expect(page.locator('#presence')).toHaveText('I\'m in this room')
  await expect(page.locator('#presence')).toHaveClass(/btn-primary/)
  expect(await contrastOf(page.locator('#presence')), '"I\'m in this room" contrast').toBeGreaterThanOrEqual(4.5)
  await checkTargets(page, page.locator('body'), 'room view')

  // Child sheet
  await tap(page, page.locator('button.child[data-child="c_ava"]'), 'Ava card')
  await expect(page.locator('#child-sheet #today-logs')).toBeVisible()
  expect(await sidewaysScroll(page), 'child sheet scrolls sideways').toBeLessThanOrEqual(0)
  expect(await contrastOf(page.locator('#save-note')), '"Save note" contrast').toBeGreaterThanOrEqual(4.5)
  await checkTargets(page, page.locator('#child-sheet'), 'child sheet')
  await tap(page, page.locator('#child-sheet').getByRole('button', { name: 'Close' }), 'Close')

  // Staff note
  await page.goto('/room/note/?child=c_ava')
  await expect(page.locator('#make-link')).toBeVisible()
  expect(await contrastOf(page.locator('#make-link')), '"Make parent link" contrast').toBeGreaterThanOrEqual(4.5)
  await tap(page, page.locator('#make-link'), 'Make parent link')
  await expect(page.locator('#copy-link')).toBeVisible()
  expect(await sidewaysScroll(page), 'staff note scrolls sideways').toBeLessThanOrEqual(0)
  await checkTargets(page, page.locator('body'), 'staff note')
  const url = await page.locator('#note-link').inputValue()

  // Parent note
  await page.goto(url)
  await expect(page.locator('#note [data-section="meals"]')).toBeVisible()
  expect(await sidewaysScroll(page), 'parent note scrolls sideways').toBeLessThanOrEqual(0)
  await checkTargets(page, page.locator('body'), 'parent note')
})

test('the open child sheet never has a control under its header or its toast', async ({ page, request }) => {
  const marie = await staffToken(request)
  await presenceViaApi(request, marie, 'r_infant')
  await signInViaApi(request, await doorToken(request), 'c_ava', 'p_ava_mother')
  await page.goto('/room/')
  await keypad(page, EDUCATOR_PIN, page.locator('#pin-enter'))
  await tap(page, page.locator('button.child[data-child="c_ava"]'), 'Ava card')
  const sheet = page.locator('#child-sheet')
  await expect(sheet.locator('#today-logs')).toBeVisible()

  const ateAll = sheet.locator('button.log[data-kind="meal"][data-value="all"]')
  await tap(page, ateAll, 'Ate all')
  await expect(page.locator('#toast .toast-text')).toHaveText('Saved: Breakfast: ate all')
  // Right after the toast appears, with no scrolling, "Ate all" is still what a finger hits.
  await expectTapTarget(page, ateAll, 44, '"Ate all" right after the toast')
  await tap(page, ateAll, 'Ate all again')
  await expect(page.locator('#toast .toast-text')).toHaveText('Saved: Breakfast: ate all')

  // Every control in the sheet body, scrolled to the very top of the body (just under the header and its toast line), is still
  // what a finger hits there: the header never overlaps the body.
  const controls = sheet.locator('.sheet-body button, .sheet-body a.btn')
  const n = await controls.count()
  expect(n).toBeGreaterThan(20)
  for (let i = 0; i < n; i++) {
    const el = controls.nth(i)
    await el.evaluate((e) => e.scrollIntoView({ block: 'start' }))
    await expectTapTarget(page, el, 44, `sheet control ${i} at the top of the sheet body`)
  }
})
