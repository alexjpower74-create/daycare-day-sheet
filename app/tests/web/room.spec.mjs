// Room view (staff phone) against the real Worker. Every action under test is a real tap, typing or keypad press; the API is
// only used to set up the day (children arriving at the door, staff tokens) and to read back what the page did.
import { test, expect } from '@playwright/test'
import {
  NOW, at, fresh, assertNoThirdParty, setNow, tap, type, keypad, stateColour, STATE_RGB, api, bearer, staffToken, doorToken,
  signInViaApi, presenceViaApi, shot, EDUCATOR_PIN,
} from '../helpers.mjs'

const POLL = 6_500 // one 5-second poll plus its answer
const plus = (minutes) => new Date(Date.parse(NOW) + minutes * 60_000).toISOString()
const card = (page, room) => page.locator(`button.room[data-room="${room}"]`)
const sheet = (page) => page.locator('#child-sheet')

async function signInOnPage(page, pin = EDUCATOR_PIN) {
  await page.goto('/room/')
  await keypad(page, pin, page.locator('#pin-enter'))
  await expect(card(page, 'r_infant')).toBeVisible()
}
async function openChild(page, id) {
  await tap(page, page.locator(`button.child[data-child="${id}"]`), `child ${id}`)
  await expect(sheet(page).locator('#today-logs')).toBeVisible()
}
async function closeSheet(page) {
  await tap(page, sheet(page).getByRole('button', { name: 'Close' }), 'Close')
  await expect(sheet(page)).toHaveCount(0)
}
const logsViaApi = async (request, token, id) => (await api(request, 'GET', `/api/staff/children/${id}`, undefined, bearer(token))).body.logs
const exactly = (text) => new RegExp(`^${text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)

test.beforeEach(async ({ context, request }) => { await fresh(context, request) })
test.afterEach(async ({ context }) => { assertNoThirdParty(context) })

test('a wrong PIN shows the API text and the answer is a 401', async ({ page }, testInfo) => {
  await page.goto('/room/')
  await expect(page.getByRole('heading', { name: 'Staff sign in' })).toBeVisible()
  await shot(page, testInfo, 'web', 'room-signin')
  const answer = page.waitForResponse((r) => r.url().endsWith('/api/signin') && r.request().method() === 'POST')
  await keypad(page, '9999', page.locator('#pin-enter'))
  expect((await answer).status(), 'POST /api/signin with a wrong PIN').toBe(401)
  await expect(page.locator('#pin-error')).toHaveText('That PIN is not right.')
})

test('the room card follows the meter: at the limit, over, no staff, and a move changes both cards', async ({ page, request }, testInfo) => {
  const reader = await staffToken(request)
  const door = await doorToken(request)
  await signInOnPage(page)
  const infant = card(page, 'r_infant')

  await tap(page, infant, 'Infant room card')
  await expect(infant).toHaveAttribute('aria-pressed', 'true')
  await expect(page.locator('#presence')).toHaveText('I\'m in this room')
  await tap(page, page.locator('#presence'), 'I\'m in this room')
  await expect(infant.locator('.room-count')).toHaveText('0 children · 1 staff')
  await expect(page.locator('#presence')).toHaveText('I\'m leaving this room')

  for (const c of ['ava', 'liam', 'nora']) await signInViaApi(request, door, `c_${c}`, `p_${c}_mother`)
  await expect(infant, 'room card data-state at_limit').toHaveAttribute('data-state', 'at_limit', { timeout: POLL })
  expect(await stateColour(infant), 'stateColour of the at_limit card').toBe(STATE_RGB.at_limit)
  const atLimit = (await api(request, 'GET', '/api/staff/today', undefined, bearer(reader))).body.rooms.find((r) => r.room.id === 'r_infant').meter
  await expect(page.locator('#room-label')).toHaveText(atLimit.label)
  await shot(page, testInfo, 'web', 'room')

  await signInViaApi(request, door, 'c_owen', 'p_owen_mother')
  await expect(infant, 'room card data-state over').toHaveAttribute('data-state', 'over', { timeout: POLL })
  expect(await stateColour(infant), 'stateColour of the over card').toBe(STATE_RGB.over)
  await expect(page.locator('#room-label')).toContainText('Needs 1 more staff.')
  await shot(page, testInfo, 'web', 'room-over')

  await tap(page, page.locator('#presence'), 'I\'m leaving this room')
  await expect(page.locator('#room-label')).toHaveText('4 children with no staff in the room.')
  await expect(infant).toHaveAttribute('data-state', 'over')
  expect(await stateColour(infant), 'stateColour with no staff').toBe(STATE_RGB.over)

  const toddler = card(page, 'r_toddler')
  await expect(toddler.locator('.room-count')).toHaveText('0 children · 0 staff')
  await expect(toddler).toHaveAttribute('data-state', 'ok')
  await openChild(page, 'c_ava')
  await tap(page, sheet(page).locator('button.move[data-room="r_toddler"]'), 'Move to Toddler room')
  await expect(page.locator('#toast .toast-text')).toHaveText('Ava M. (SAMPLE) moved to Toddler room.')
  await closeSheet(page)
  await expect(infant.locator('.room-count')).toHaveText('3 children · 0 staff')
  await expect(toddler.locator('.room-count')).toHaveText('1 child · 0 staff')
  await expect(toddler).toHaveAttribute('data-state', 'over')
  expect(await stateColour(toddler)).toBe(STATE_RGB.over)
})

const LOGS = [
  // [kind, value, label, meal chip to tap first]
  ['meal', 'all', 'Breakfast: ate all', null],
  ['meal', 'some', 'Lunch: ate some', 'lunch'],
  ['meal', 'none', 'Morning snack: ate none', 'am_snack'],
  ['meal', 'all', 'Afternoon snack: ate all', 'pm_snack'],
  ['diaper', 'wet', 'Wet diaper'], ['diaper', 'bm', 'BM diaper'], ['diaper', 'dry', 'Dry diaper'],
  ['toilet', 'went', 'Used the toilet'], ['toilet', 'tried', 'Tried the toilet'],
  ['mood', 'happy', 'Happy'], ['mood', 'okay', 'Okay'], ['mood', 'tired', 'Tired'], ['mood', 'upset', 'Upset'],
]

test('every quick log by real taps shows in Today and in the API with the exact label', async ({ page, context, request }, testInfo) => {
  const marie = await staffToken(request)
  await presenceViaApi(request, marie, 'r_infant')
  await signInViaApi(request, await doorToken(request), 'c_ava', 'p_ava_mother')
  await signInOnPage(page)
  await openChild(page, 'c_ava')
  await shot(page, testInfo, 'web', 'sheet')

  let minute = 0
  for (const [kind, value, label, meal] of LOGS) {
    await setNow(context, plus(++minute)) // a new minute per log, so "newest first" is a real order
    if (meal) await tap(page, sheet(page).locator(`button.meal[data-meal="${meal}"]`), `meal chip ${meal}`)
    await tap(page, sheet(page).locator(`button.log[data-kind="${kind}"][data-value="${value}"]`), label)
    await expect(page.locator('#toast .toast-text')).toHaveText(`Saved: ${label}`)
    await expect(page.locator('#today-logs [data-log] .log-label').first()).toHaveText(label)
  }
  await setNow(context, plus(++minute))
  await type(page, page.locator('#note-text'), 'Loved the water table.')
  await tap(page, page.locator('#save-note'), 'Save note')
  await expect(page.locator('#today-logs [data-log] .log-label').first()).toHaveText('Loved the water table.')
  await shot(page, testInfo, 'web', 'sheet-toast')

  const expected = [...LOGS.map((l) => l[2]), 'Loved the water table.']
  await expect(page.locator('#today-logs [data-log]')).toHaveCount(expected.length)
  for (const label of expected) await expect(page.locator('#today-logs .log-label').filter({ hasText: exactly(label) })).toHaveCount(1)
  const apiLabels = (await logsViaApi(request, marie, 'c_ava')).map((l) => l.label)
  expect(apiLabels.sort()).toEqual([...expected].sort())
})

test('the meal chip is Breakfast at 9:00 AM and Lunch at 12:00 PM', async ({ page, context, request }) => {
  await signInViaApi(request, await doorToken(request), 'c_ava', 'p_ava_mother')
  await signInOnPage(page)
  await openChild(page, 'c_ava')
  await expect(sheet(page).locator('button.meal[aria-pressed="true"]')).toHaveText('Breakfast')
  await setNow(context, at('2026-09-14T12:00:00-02:30'))
  await page.reload()
  await openChild(page, 'c_ava')
  await expect(sheet(page).locator('button.meal[aria-pressed="true"]')).toHaveText('Lunch')
  await expect(sheet(page).locator('button.meal[aria-pressed="true"]')).toHaveCount(1)
})

test('Nap start shows Asleep on the card and Nap end takes it away', async ({ page, request }) => {
  await signInViaApi(request, await doorToken(request), 'c_ava', 'p_ava_mother')
  await signInOnPage(page)
  const ava = page.locator('button.child[data-child="c_ava"]')
  await expect(ava).not.toContainText('Asleep')
  await openChild(page, 'c_ava')
  await tap(page, sheet(page).locator('button.log[data-kind="nap_start"]'), 'Nap start')
  await expect(sheet(page).locator('button.log[data-kind="nap_end"]')).toHaveText('Nap end')
  await closeSheet(page)
  await expect(ava.locator('.chip-asleep')).toHaveText('Asleep')
  await openChild(page, 'c_ava')
  await tap(page, sheet(page).locator('button.log[data-kind="nap_end"]'), 'Nap end')
  await expect(sheet(page).locator('button.log[data-kind="nap_start"]')).toHaveText('Nap start')
  await closeSheet(page)
  await expect(ava).not.toContainText('Asleep')
})

test('Undo removes a log from the page and from the API', async ({ page, request }) => {
  const marie = await staffToken(request)
  await signInViaApi(request, await doorToken(request), 'c_ava', 'p_ava_mother')
  await signInOnPage(page)
  await openChild(page, 'c_ava')
  await tap(page, sheet(page).locator('button.log[data-kind="mood"][data-value="happy"]'), 'Happy')
  const row = page.locator('#today-logs [data-log]').first()
  await expect(row.locator('.log-label')).toHaveText('Happy')
  const id = await row.getAttribute('data-log')
  expect((await logsViaApi(request, marie, 'c_ava')).map((l) => l.id)).toContain(id)
  await tap(page, row.locator('button.undo'), 'Undo in Today')
  await expect(page.locator(`#today-logs [data-log="${id}"]`)).toHaveCount(0)
  await expect(page.locator('#toast .toast-text')).toHaveText('Removed: Happy')
  expect((await logsViaApi(request, marie, 'c_ava')).map((l) => l.id)).not.toContain(id)
})

test('Record without a signature puts the child in the room and the visit awaits a signature', async ({ page, request }, testInfo) => {
  const marie = await staffToken(request)
  await signInOnPage(page)
  await expect(page.locator('button.child[data-child="c_owen"]')).toHaveCount(0)
  await tap(page, page.locator('button.record[data-child="c_owen"]'), 'Record without a signature')
  await expect(page.locator('#record-sheet')).toContainText('Who dropped off Owen P. (SAMPLE)?')
  await shot(page, testInfo, 'web', 'record')
  await tap(page, page.locator('#record-sheet button.person[data-person="p_owen_mother"]'), 'Owen\'s mother')
  await expect(page.locator('#record-sheet')).toHaveCount(0)
  await expect(page.locator('#toast .toast-text')).toContainText('Owen P. (SAMPLE) signed in at 9:00 AM by')
  const owen = page.locator('button.child[data-child="c_owen"]')
  await expect(owen).toBeVisible()
  await expect(owen).toContainText('Signature needed')
  const visit = (await api(request, 'GET', '/api/staff/children/c_owen', undefined, bearer(marie))).body.visit
  expect(visit.awaiting_signature).toBe('in')
  expect(visit.in_recorded_by).toEqual({ id: 's_marie', initials: 'MT' })
  expect(visit.in_signature_svg).toBeNull()
})
