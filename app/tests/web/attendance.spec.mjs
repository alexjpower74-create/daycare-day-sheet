// Office attendance against the real Worker: a normal day, a visit across midnight, a visit never signed out, an absence, the
// Week view cells and totals against the API, "Fix a time", "Mark away", and both CSV downloads byte for byte.
import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { at, fresh, assertNoThirdParty, tap, type, keypad, api, bearer, signInViaApi, signOutViaApi, shot, SUPERVISOR_PIN } from '../helpers.mjs'

const PAGE_NOW = at('2026-09-16T12:00:00-02:30') // Wed Sep 16, noon
const FROM = '2026-09-14'
const TO = '2026-09-20'
const minutesLabel = (n) => (n < 60 ? `${n} min` : n % 60 ? `${Math.floor(n / 60)} h ${n % 60} min` : `${n / 60} h`)
const cell = (page, child, date) => page.locator(`[data-cell="${child}:${date}"]`)

async function tokenAt(request, now, pin = SUPERVISOR_PIN) {
  const r = await api(request, 'POST', '/api/signin', { pin }, { 'X-Test-IP': `att-${pin}` }, { now })
  expect(r.status).toBe(200)
  return r.body.token
}

async function setUp(request) {
  const early = at('2026-09-14T07:00:00-02:30')
  const unlock = await api(request, 'POST', '/api/door/unlock', { pin: SUPERVISOR_PIN }, { 'X-Test-IP': 'att-door' }, { now: early })
  const door = unlock.body.token
  // A normal day: Liam 8:00 AM to 4:00 PM on Monday.
  await signInViaApi(request, door, 'c_liam', 'p_liam_mother', { now: at('2026-09-14T08:00:00-02:30') })
  await signOutViaApi(request, door, 'c_liam', 'p_liam_father', { now: at('2026-09-14T16:00:00-02:30') })
  // Across midnight: Ava 10:30 PM Monday to 1:15 AM Tuesday.
  await signInViaApi(request, door, 'c_ava', 'p_ava_mother', { now: at('2026-09-14T22:30:00-02:30') })
  await signOutViaApi(request, door, 'c_ava', 'p_ava_gran', { now: at('2026-09-15T01:15:00-02:30') })
  // Never signed out: Nora from 9:00 AM Tuesday.
  const nora = await signInViaApi(request, door, 'c_nora', 'p_nora_mother', { now: at('2026-09-15T09:00:00-02:30') })
  // Still here: Emma in at 8:30 AM today (Wednesday), not signed out yet.
  await signInViaApi(request, door, 'c_emma', 'p_emma_mother', { now: at('2026-09-16T08:30:00-02:30') })
  // An absence: Jack on holiday Tuesday.
  const office = await tokenAt(request, PAGE_NOW)
  const absence = await api(request, 'POST', '/api/office/absences', { child_id: 'c_jack', date: '2026-09-15', reason: 'holiday', note: '' }, bearer(office), { now: PAGE_NOW })
  expect(absence.status).toBe(201)
  return { office, noraVisit: nora.visit.id }
}

async function openAttendance(page) {
  await page.goto('/office/')
  await keypad(page, SUPERVISOR_PIN, page.locator('#pin-enter'))
  await tap(page, page.getByRole('tab', { name: 'Attendance', exact: true }), 'Attendance tab')
  await expect(page.locator('#attendance-table')).toBeVisible()
  await expect(page.locator('button.seg[data-view="week"]')).toHaveAttribute('aria-pressed', 'true')
}

test.beforeEach(async ({ context, request }) => { await fresh(context, request, { now: PAGE_NOW }) })
test.afterEach(async ({ context }) => { assertNoThirdParty(context) })

test('the Week view splits a visit across midnight and its totals match the API', async ({ page, request }, testInfo) => {
  const { office } = await setUp(request)
  const data = (await api(request, 'GET', `/api/office/attendance?from=${FROM}&to=${TO}`, undefined, bearer(office), { now: PAGE_NOW })).body
  const ava = data.children.find((c) => c.id === 'c_ava')
  expect([ava.days[FROM].minutes, ava.days['2026-09-15'].minutes, ava.minutes]).toEqual([90, 75, 165])

  await openAttendance(page)
  await expect(page.locator('#attendance-range')).toHaveText('Sep 14 to Sep 20, 2026')
  await expect(cell(page, 'c_ava', FROM), 'Ava Sep 14 cell').toHaveText('1 h 30 min')
  await expect(cell(page, 'c_ava', '2026-09-15'), 'Ava Sep 15 cell').toHaveText('1 h 15 min')
  await expect(page.locator('[data-total="c_ava"]')).toHaveText(minutesLabel(ava.minutes))
  await expect(page.locator('#attendance-total')).toHaveText(minutesLabel(data.totals.minutes))
  await expect(page.locator('#attendance-child-days')).toHaveText(String(data.totals.child_days))
  await expect(cell(page, 'c_liam', FROM)).toHaveText('8 h')
  await expect(cell(page, 'c_jack', '2026-09-15')).toHaveText('Away: Holiday')
  // Missing (booked, on or before today) vs upcoming (booked, after today) vs not booked.
  const liam = data.children.find((c) => c.id === 'c_liam')
  expect([liam.days['2026-09-15'].status, liam.days['2026-09-17'].status, liam.days['2026-09-19'].status]).toEqual(['missing', 'upcoming', 'not_booked'])
  await expect(cell(page, 'c_liam', '2026-09-15')).toHaveText('No record')
  await expect(cell(page, 'c_liam', '2026-09-17'), 'an upcoming day is an empty cell').toHaveText('')
  await expect(cell(page, 'c_liam', '2026-09-19')).toHaveText('')
  await shot(page, testInfo, 'web', 'office-attendance')
})

test('Not signed out, then Fix a time with a reason changes the cell and the API', async ({ page, request }) => {
  const { office } = await setUp(request)
  await openAttendance(page)
  const nora = cell(page, 'c_nora', '2026-09-15')
  await expect(nora).toContainText('Not signed out')
  await tap(page, nora.getByRole('button', { name: /Fix a time/ }).last(), 'Fix a time')
  const dialog = page.locator('#fix-dialog')
  await expect(dialog).toBeVisible()
  await expect(dialog.locator('input[name="out_date"]')).toHaveValue('2026-09-15')
  await dialog.locator('input[name="out_time"]').fill('17:00')
  await tap(page, dialog.locator('#fix-save'), 'Save the time without a reason')
  await expect(dialog.locator('textarea[name="reason"] + .field-error'), 'reason is required').toHaveText(/Say why the time is changing/)
  await type(page, dialog.locator('textarea[name="reason"]'), 'Forgot to sign out at pick-up.')
  await tap(page, dialog.locator('#fix-save'), 'Save the time')
  await expect(dialog).toHaveCount(0)
  await expect(nora).toHaveText('8 h')
  await expect(page.locator('#attendance-status')).toContainText('Time fixed.')
  const data = (await api(request, 'GET', `/api/office/attendance?from=${FROM}&to=${TO}`, undefined, bearer(office), { now: PAGE_NOW })).body
  const day = data.children.find((c) => c.id === 'c_nora').days['2026-09-15']
  expect([day.minutes, day.open]).toEqual([480, false])
})

test('Mark away with a reason shows Away: Sick', async ({ page, request }) => {
  const { office } = await setUp(request)
  await openAttendance(page)
  await tap(page, page.locator('#mark-away'), 'Mark away')
  const dialog = page.locator('#away-dialog')
  await dialog.locator('select[name="child_id"]').selectOption('c_owen')
  await dialog.locator('input[name="date"]').fill('2026-09-16')
  await dialog.locator('select[name="reason"]').selectOption('sick')
  await type(page, dialog.locator('input[name="note"]'), 'Fever')
  await tap(page, dialog.locator('#away-save'), 'Mark away (save)')
  await expect(dialog).toHaveCount(0)
  await expect(cell(page, 'c_owen', '2026-09-16')).toHaveText('Away: Sick')
  const data = (await api(request, 'GET', `/api/office/attendance?from=${FROM}&to=${TO}`, undefined, bearer(office), { now: PAGE_NOW })).body
  expect(data.children.find((c) => c.id === 'c_owen').days['2026-09-16']).toMatchObject({ status: 'away', absence: { reason: 'sick', note: 'Fever' } })
})

test('Download CSV and Download summary CSV save exactly what the API sends', async ({ page, request }) => {
  const { office } = await setUp(request)
  await openAttendance(page)
  for (const [button, path, name] of [
    ['#download-csv', `/api/office/attendance.csv?from=${FROM}&to=${TO}`, `attendance-${FROM}-to-${TO}.csv`],
    ['#download-summary', `/api/office/attendance-summary.csv?from=${FROM}&to=${TO}`, `attendance-summary-${FROM}-to-${TO}.csv`],
  ]) {
    const waiting = page.waitForEvent('download')
    await tap(page, page.locator(button), button)
    const download = await waiting
    expect(download.suggestedFilename()).toBe(name)
    const saved = readFileSync(await download.path())
    const fromApi = await (await request.fetch(path, { headers: { ...bearer(office), 'X-Test-Now': PAGE_NOW } })).body()
    expect(saved.length, `${name} size`).toBeGreaterThan(40)
    expect(Buffer.compare(saved, fromApi), `${name} byte for byte`).toBe(0)
  }
})

test('today\'s open visit reads Still here with no flag and no Fix a time; an earlier open visit still reads Not signed out', async ({ page, request }) => {
  const { office } = await setUp(request)
  const data = (await api(request, 'GET', `/api/office/attendance?from=${FROM}&to=${TO}`, undefined, bearer(office), { now: PAGE_NOW })).body
  const emma = data.children.find((c) => c.id === 'c_emma').days['2026-09-16']
  const nora = data.children.find((c) => c.id === 'c_nora').days['2026-09-15']
  expect([emma.status, emma.open, emma.still_here], 'API: Emma today').toEqual(['present', true, true])
  expect([nora.status, nora.open, nora.still_here], 'API: Nora yesterday').toEqual(['present', true, false])

  await openAttendance(page)
  const today = cell(page, 'c_emma', '2026-09-16')
  await expect(today, 'today\'s open visit reads Still here').toHaveText('Still here')
  await expect(today.locator('.fix-time'), 'no Fix a time on today\'s open visit').toHaveCount(0)
  await expect(today).not.toContainText('Not signed out')
  const earlier = cell(page, 'c_nora', '2026-09-15')
  await expect(earlier).toContainText('Not signed out')
  await expect(earlier.getByRole('button', { name: /Fix a time/ })).toHaveCount(1)
  await expect(earlier).not.toContainText('Still here')
})
