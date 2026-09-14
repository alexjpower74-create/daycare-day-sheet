// Printable daily register (NLR 39/17 s.45) against the real Worker: children, a drawn SVG signature per signed end, the moves
// line, "Recorded by … signature needed", "Changed by …", the kept note, and print media hiding the navigation.
import { test, expect } from '@playwright/test'
import { at, fresh, assertNoThirdParty, tap, keypad, api, bearer, signInViaApi, signOutViaApi, shot, SUPERVISOR_PIN, EDUCATOR_PIN } from '../helpers.mjs'

const PAGE_NOW = at('2026-09-14T17:00:00-02:30')
const t = (hhmm) => at(`2026-09-14T${hhmm}:00-02:30`)

async function tokenAt(request, pin, now) {
  const r = await api(request, 'POST', '/api/signin', { pin }, { 'X-Test-IP': `reg-${pin}` }, { now })
  expect(r.status).toBe(200)
  return r.body.token
}
const pathOf = (svg) => (svg.match(/ d="([^"]+)"/) || [])[1]

test.beforeEach(async ({ context, request }) => { await fresh(context, request, { now: PAGE_NOW }) })
test.afterEach(async ({ context }) => { assertNoThirdParty(context) })

test('the infant room register lists each child with signatures, moves, notes and the kept note, and prints without navigation', async ({ page, request }, testInfo) => {
  const door = (await api(request, 'POST', '/api/door/unlock', { pin: SUPERVISOR_PIN }, { 'X-Test-IP': 'reg-door' }, { now: t('07:00') })).body.token
  const marie = await tokenAt(request, EDUCATOR_PIN, t('07:00'))
  await signInViaApi(request, door, 'c_ava', 'p_ava_mother', { now: t('08:05') })
  const liam = await api(request, 'POST', '/api/staff/children/c_liam/in', { person_id: 'p_liam_father' }, bearer(marie), { now: t('08:10') })
  expect(liam.status).toBe(201)
  const nora = await signInViaApi(request, door, 'c_nora', 'p_nora_mother', { now: t('08:20') })
  for (const [room, time] of [['r_toddler', '10:00'], ['r_infant', '10:40']]) {
    expect((await api(request, 'POST', '/api/staff/children/c_ava/move', { room_id: room }, bearer(marie), { now: t(time) })).status).toBe(200)
  }
  await signOutViaApi(request, door, 'c_ava', 'p_ava_gran', { now: t('16:30') })
  await signOutViaApi(request, door, 'c_nora', 'p_nora_mother', { now: t('16:45') })
  const dana = await tokenAt(request, SUPERVISOR_PIN, t('16:50'))
  const reason = 'Came in at 8:15; the tablet was slow.'
  expect((await api(request, 'PUT', `/api/office/visits/${nora.visit.id}`, { in_date: '2026-09-14', in_time: '08:15', reason }, bearer(dana), { now: t('16:50') })).status).toBe(200)
  const reg = (await api(request, 'GET', '/api/office/register?date=2026-09-14&room_id=r_infant', undefined, bearer(dana), { now: PAGE_NOW })).body

  await page.goto('/office/')
  await keypad(page, SUPERVISOR_PIN, page.locator('#pin-enter'))
  await tap(page, page.getByRole('tab', { name: 'Today', exact: true }), 'Today tab')
  await tap(page, page.locator('a.print-register[data-room="r_infant"]'), 'Print the daily register (Infant room)')
  await page.waitForURL(/\/office\/register\/\?date=2026-09-14&room=r_infant$/)
  await expect(page.locator('#register-table')).toBeVisible()
  await expect(page.locator('h1')).toHaveText('Daily register: Infant room')
  await expect(page.locator('.sample-badge')).toBeVisible()

  expect(reg.rows.map((r) => r.child.name).sort()).toEqual(['Ava M. (SAMPLE)', 'Liam K. (SAMPLE)', 'Nora B. (SAMPLE)'])
  for (const row of reg.rows) {
    const rowEl = page.locator(`tr[data-register-row="${row.child.name}"]`)
    await expect(rowEl.first()).toContainText(row.child.name)
    const expected = row.visits.flatMap((v) => [v.in_signature_svg, v.out_signature_svg]).filter(Boolean)
    const drawn = rowEl.locator('svg.signature path')
    await expect(drawn, `${row.child.name}: one drawn signature per signed end`).toHaveCount(expected.length)
    for (let i = 0; i < expected.length; i++) expect(await drawn.nth(i).getAttribute('d')).toBe(pathOf(expected[i]))
    if (row.emergency) await expect(rowEl.first()).toContainText(row.emergency.name)
  }
  const ava = reg.rows.find((r) => r.child.name === 'Ava M. (SAMPLE)')
  expect(ava.moves.map((m) => m.label)).toEqual(['Went to Toddler room 10:00 AM, back 10:40 AM'])
  await expect(page.locator('tr[data-register-row="Ava M. (SAMPLE)"] .register-moves')).toHaveText('Went to Toddler room 10:00 AM, back 10:40 AM')
  await expect(page.locator('tr[data-register-row="Liam K. (SAMPLE)"] .register-notes')).toHaveText('Recorded by MT, signature needed')
  await expect(page.locator('tr[data-register-row="Nora B. (SAMPLE)"] .register-notes')).toHaveText(`Changed by Dana K. (SAMPLE): ${reason}`)
  await expect(page.locator('#kept-note')).toHaveText(reg.kept_note)
  await shot(page, testInfo, 'web', 'register')

  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('header.topbar')).toBeHidden()
  await expect(page.locator('#back')).toBeHidden()
  await expect(page.locator('#print')).toBeHidden()
  await expect(page.locator('#register-table')).toBeVisible()
  await expect(page.locator('#kept-note')).toBeVisible()
  await expect(page.locator('svg.signature').first()).toBeVisible()
  await shot(page, testInfo, 'web', 'register-print')
})

// The register never opens a browser dialog: problems are an on-page message in #register-error (role="alert").
function failOnDialog(page) {
  const dialogs = []
  page.on('dialog', (d) => { dialogs.push(`${d.type()}: ${d.message()}`); d.dismiss().catch(() => {}) })
  return dialogs
}

async function supervisorOnThisDevice(page) {
  await page.goto('/office/')
  await keypad(page, SUPERVISOR_PIN, page.locator('#pin-enter'))
  await expect(page.getByRole('tab', { name: 'Today', exact: true })).toBeVisible()
}

test('the register with no room, or a room the API does not know, shows an on-page alert and no browser dialog', async ({ page, request }) => {
  const dialogs = failOnDialog(page)
  await supervisorOnThisDevice(page)

  await page.goto('/office/register/?date=2026-09-14')
  const problem = page.locator('#register-error')
  await expect(problem).toHaveAttribute('role', 'alert')
  await expect(problem).toHaveText('Open the register from the office Today tab, where each room has "Print the daily register".')
  await expect(page.locator('#register-table')).toHaveCount(0)

  const dana = await tokenAt(request, SUPERVISOR_PIN, PAGE_NOW)
  const unknown = await api(request, 'GET', '/api/office/register?date=2026-09-14&room_id=r_nowhere', undefined, bearer(dana), { now: PAGE_NOW })
  expect(unknown.status, 'the API refuses an unknown room').toBeGreaterThanOrEqual(400)
  await page.goto('/office/register/?date=2026-09-14&room=r_nowhere')
  await expect(problem, 'the load error is the API text, on the page').toHaveText(unknown.body.error)
  await expect(page.locator('#register-table')).toHaveCount(0)

  expect(dialogs, 'browser dialogs opened by the register').toEqual([])
})

test('an educator on this device sees the supervisor-only message on the register page, not a dialog', async ({ page }) => {
  const dialogs = failOnDialog(page)
  await page.goto('/office/')
  await keypad(page, EDUCATOR_PIN, page.locator('#pin-enter'))
  await expect(page.locator('#office-refused')).toBeVisible()
  await page.goto('/office/register/?date=2026-09-14&room=r_infant')
  await expect(page.locator('#register-error')).toHaveText('Only the supervisor can open the office.')
  await expect(page.locator('#register-error')).toHaveAttribute('role', 'alert')
  expect(dialogs).toEqual([])
})

test('a visit with no sign-out reads Still here on today\'s register and Not signed out on an earlier date\'s', async ({ page, request }) => {
  const door = (await api(request, 'POST', '/api/door/unlock', { pin: SUPERVISOR_PIN }, { 'X-Test-IP': 'reg-still-door' }, { now: at('2026-09-11T07:00:00-02:30') })).body.token
  // Fri Sep 11: Owen in at 8:00 AM, never signed out.
  await signInViaApi(request, door, 'c_owen', 'p_owen_mother', { now: at('2026-09-11T08:00:00-02:30') })
  // Today (Mon Sep 14): Liam in at 8:10 AM, still in at 5:00 PM.
  await signInViaApi(request, door, 'c_liam', 'p_liam_mother', { now: t('08:10') })
  const dana = await tokenAt(request, SUPERVISOR_PIN, PAGE_NOW)
  const today = (await api(request, 'GET', '/api/office/register?date=2026-09-14&room_id=r_infant', undefined, bearer(dana), { now: PAGE_NOW })).body
  const earlier = (await api(request, 'GET', '/api/office/register?date=2026-09-11&room_id=r_infant', undefined, bearer(dana), { now: PAGE_NOW })).body
  expect(today.rows.find((r) => r.child.name === 'Liam K. (SAMPLE)').visits[0].out_at).toBeNull()
  expect(earlier.rows.find((r) => r.child.name === 'Owen P. (SAMPLE)').visits[0].out_at).toBeNull()

  await supervisorOnThisDevice(page)
  await page.goto('/office/register/?date=2026-09-14&room=r_infant')
  await expect(page.locator('tr[data-register-row="Liam K. (SAMPLE)"] .register-out'), 'today: open visit reads Still here').toHaveText('Still here')
  await page.goto('/office/register/?date=2026-09-11&room=r_infant')
  await expect(page.locator('h1')).toHaveText('Daily register: Infant room')
  await expect(page.locator('tr[data-register-row="Owen P. (SAMPLE)"] .register-out'), 'an earlier date: open visit reads Not signed out').toHaveText('Not signed out')
})
