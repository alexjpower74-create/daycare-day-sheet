// Targets and legibility for dd2's pages against the real Worker: SAMPLE on every page, no sideways scroll, tap targets that are
// big enough and are what a finger hits, primary button contrast, and an open child sheet whose controls never sit under its
// header or its toast.
import { test, expect } from '@playwright/test'
import {
  NOW, fresh, assertNoThirdParty, tap, keypad, expectTapTarget, contrastOf, api, bearer, staffToken, doorToken, signInViaApi,
  presenceViaApi, shot, EDUCATOR_PIN, SUPERVISOR_PIN,
} from '../helpers.mjs'

const PAGES = ['/', '/room/', '/room/note/', '/note/', '/office/']

test.beforeEach(async ({ context, request }) => { await fresh(context, request) })
test.afterEach(async ({ context }) => { assertNoThirdParty(context) })

/** How far the page scrolls sideways; when it does, the result also names the elements that stick out (for the failure message). */
async function sidewaysScroll(page) {
  const { over, culprits } = await page.evaluate(() => {
    const width = document.documentElement.clientWidth
    const over = document.documentElement.scrollWidth - width
    const name = (el) => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ''}${typeof el.className === 'string' && el.className.trim() ? `.${el.className.trim().split(/\s+/).join('.')}` : ''}`
    // Page coordinates (a sweep's scrollIntoView can leave the page scrolled sideways, which shifts every viewport rect left).
    const culprits = over <= 0 ? [] : [...document.querySelectorAll('body *')]
      .map((el) => ({ el, right: el.getBoundingClientRect().right + window.scrollX }))
      .filter(({ right }) => right > width + 1)
      .sort((x, y) => y.right - x.right)
      .slice(0, 8)
      .map(({ el, right }) => `${name(el)} → ${Math.round(right)}px (in ${el.parentElement ? name(el.parentElement) : '-'})`)
    culprits.unshift(`scrollX ${window.scrollX}`)
    return { over, culprits }
  })
  if (over > 0) console.log(`sideways by ${over}px: ${culprits.join(' | ')}`)
  return over
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

const OFFICE_TABS = ['Today', 'Children', 'Rooms and ratios', 'Staff', 'Attendance']

/** The demo day (every room busy, 15 weekdays of attendance, absences, a visit never signed out). */
async function demoDay(request) {
  const r = await api(request, 'POST', '/api/test/seed', { scenario: 'demo' })
  expect(r.status, `demo seed: ${JSON.stringify(r.body)}`).toBe(200)
  return r.body
}

test('the office: every tab, and every visible button on it and in its dialogs, is at least 44 px and hit-tests to itself', async ({ page, request }) => {
  test.setTimeout(240_000)
  await demoDay(request)
  await page.goto('/office/')
  await checkTargets(page, page.locator('main'), 'office keypad')
  await keypad(page, SUPERVISOR_PIN, page.locator('#pin-enter'))
  await expect(page.getByRole('tab')).toHaveCount(OFFICE_TABS.length)
  expect(await sidewaysScroll(page), 'office scrolls sideways').toBeLessThanOrEqual(0)

  for (const name of OFFICE_TABS) {
    const tab = page.getByRole('tab', { name, exact: true })
    await tap(page, tab, `tab ${name}`)
    await expect(tab).toHaveAttribute('aria-selected', 'true')
    await expect(page.locator('#office-panel .office-title')).toBeVisible()
    if (name === 'Children') {
      await tap(page, page.locator('[data-child-row="c_ava"]'), 'Ava in the children list')
      await expect(page.locator('[data-person-row]').first()).toBeVisible()
    }
    await checkTargets(page, page.locator('body'), `office ${name}`)
    for (const s of await page.locator('label.switch').all()) {
      if (await s.isVisible()) await expectTapTarget(page, s, 44, `office ${name}: switch "${(await s.textContent()).trim()}"`)
    }
    expect(await sidewaysScroll(page), `office ${name} scrolls sideways`).toBeLessThanOrEqual(0)
  }

  // The attendance dialogs
  await tap(page, page.locator('#mark-away'), 'Mark away')
  await expect(page.locator('#away-dialog')).toBeVisible()
  await checkTargets(page, page.locator('#away-dialog'), 'Mark away dialog')
  await tap(page, page.locator('#away-dialog').getByRole('button', { name: 'Cancel' }), 'Cancel Mark away')
  await expect(page.locator('#away-dialog')).toHaveCount(0)
  await tap(page, page.locator('[data-cell] .fix-time').first(), 'a Fix a time button')
  await expect(page.locator('#fix-dialog')).toBeVisible()
  await checkTargets(page, page.locator('#fix-dialog'), 'Fix a time dialog')
})

test('the printable register at 1280: every visible button is at least 44 px and hit-tests to itself', async ({ page, request }, testInfo) => {
  test.skip(!testInfo.project.name.endsWith('1280'), 'The register is a desk page: checked at 1280.')
  const seeded = await demoDay(request)
  await page.goto('/office/')
  await keypad(page, SUPERVISOR_PIN, page.locator('#pin-enter'))
  await expect(page.getByRole('tab', { name: 'Today', exact: true })).toBeVisible()
  await page.goto(`/office/register/?date=${seeded.today}&room=r_infant`)
  await expect(page.locator('#register-table')).toBeVisible()
  const checked = await checkTargets(page, page.locator('body'), 'register')
  expect(checked, 'Office and Print').toBe(2)
  expect(await sidewaysScroll(page), 'register scrolls sideways').toBeLessThanOrEqual(0)
})
