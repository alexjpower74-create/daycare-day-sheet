// The whole day across both slices, lead-owned. Runs in the tablet projects (chromium-tablet, webkit-tablet):
// the door tablet is this project's page; the educator's phone and the parent's phone are 390 contexts; the office is 1280.
// A parent signs Ava in on the tablet → the educator goes into the infant room, logs lunch and a nap → the parent link opens
// on the parent's phone with those logs → the neighbour is not offered and "Someone else" is blocked at pick-up → the
// grandmother signs Ava out → the office attendance shows the pair → at midnight the parent link stops working.
// Real input throughout; the API is only read to confirm what the pages did.
import { test, expect } from '@playwright/test'
import {
  NOW, CENTRE, SUPERVISOR_PIN, EDUCATOR_PIN, fresh, newContext, setNow, tap, keypad, drawSignature, api, bearer,
  supervisorToken, doorToken, stateColour, STATE_RGB, assertNoThirdParty, shot,
} from '../helpers.mjs'

const T = {
  dropOff: NOW, //                          9:00 AM NDT
  napStart: '2026-09-14T15:10:00Z', //     12:40 PM
  napEnd: '2026-09-14T16:35:00Z', //        2:05 PM
  link: '2026-09-14T16:40:00Z', //          2:10 PM
  lastMinute: '2026-09-15T02:29:59Z', //   11:59:59 PM
  pickUp: '2026-09-14T19:00:00Z', //        4:30 PM
  office: '2026-09-14T19:05:00Z', //        4:35 PM
  nextDay: '2026-09-15T02:30:30Z', //      12:00:30 AM Sep 15
}

test('a day at SAMPLE Little Harbour: door, room, note, pick-up, office, midnight', async ({ page, context, request, browser }, testInfo) => {
  test.setTimeout(180_000)
  await fresh(context, request)

  // ---- 9:00 AM, door tablet: Sarah (mother) signs Ava in ----
  await page.goto('/door/')
  await expect(page.getByText('Set up this tablet')).toBeVisible()
  await keypad(page, SUPERVISOR_PIN, page.locator('#pin-enter'))
  await expect(page.getByText(CENTRE).first()).toBeVisible()
  await expect(page.locator('.sample-badge').first()).toBeVisible()
  await tap(page, page.locator('button.child[data-child="c_ava"]'), 'Ava card')
  await tap(page, page.locator('#action-in'), 'Sign in')
  await expect(page.getByText('Who is dropping off?')).toBeVisible()
  await tap(page, page.locator('button.person[data-person="p_ava_mother"]'), 'Sarah')
  await expect(page.locator('#pad-done')).toBeDisabled()
  await drawSignature(page, page.locator('#pad'))
  await tap(page, page.locator('#pad-done'), 'Done')
  await expect(page.locator('#confirm')).toContainText('Signed in')
  await expect(page.locator('#confirm')).toContainText('Sarah M. (SAMPLE)')
  const door = await doorToken(request)
  const afterIn = await api(request, 'GET', '/api/door/children/c_ava', null, bearer(door))
  expect(afterIn.body.child.status, 'the API agrees Ava is in').toBe('in')
  expect(afterIn.body.visit.in_signature_svg, 'the drawn signature was stored').toContain('<path')
  await shot(page, testInfo, 'journey', '1-door-signed-in')

  // ---- the educator's phone: Marie goes into the infant room, logs lunch and a nap ----
  const staff = await newContext(browser, 'phone')
  const phone = await staff.newPage()
  await phone.goto('/room/')
  await keypad(phone, EDUCATOR_PIN, phone.locator('#pin-enter'))
  await tap(phone, phone.locator('button.room[data-room="r_infant"]'), 'Infant room card')
  await expect(phone.locator('#presence')).toHaveText(/I'm in this room/)
  await tap(phone, phone.locator('#presence'), "I'm in this room")
  await expect(phone.locator('#presence')).toHaveText(/I'm leaving this room/)
  const infantCard = phone.locator('button.room[data-room="r_infant"]')
  await expect(infantCard).toHaveAttribute('data-state', 'ok')
  expect(await stateColour(infantCard)).toBe(STATE_RGB.ok)
  await expect(phone.locator('#room-label')).toHaveText('1 child, 1 staff. Room for 2 more.')

  await tap(phone, phone.locator('button.child[data-child="c_ava"]'), 'Ava in the room')
  await expect(phone.locator('#child-sheet')).toBeVisible()
  await tap(phone, phone.locator('button.meal[data-meal="lunch"]'), 'Lunch chip')
  await tap(phone, phone.locator('button.log[data-kind="meal"][data-value="all"]'), 'Ate all')
  await expect(phone.locator('#toast')).toContainText('Lunch: ate all')

  await setNow(staff, T.napStart)
  await tap(phone, phone.locator('button.log[data-kind="nap_start"]'), 'Nap start')
  await expect(phone.locator('button.log[data-kind="nap_end"]')).toBeVisible()
  await setNow(staff, T.napEnd)
  await tap(phone, phone.locator('button.log[data-kind="nap_end"]'), 'Nap end')
  await expect(phone.locator('button.log[data-kind="nap_start"]')).toBeVisible()

  await setNow(staff, T.link)
  await tap(phone, phone.locator('#open-note'), 'Daily note')
  await expect(phone).toHaveURL(/\/room\/note\/\?child=c_ava/)
  await tap(phone, phone.locator('#make-link'), 'Make parent link')
  await expect(phone.getByText('Works until midnight tonight.')).toBeVisible()
  const link = await phone.locator('#note-link').inputValue()
  expect(link, 'the parent link').toMatch(/\/note\/\?t=[A-Za-z0-9_-]{43}$/)
  await shot(phone, testInfo, 'journey', '2-staff-note-link')

  // ---- the parent's phone: the note shows what Marie logged ----
  const parent = await newContext(browser, 'phone', { now: T.link })
  const parentPage = await parent.newPage()
  await parentPage.goto(new URL(link, 'http://127.0.0.1').pathname + new URL(link, 'http://127.0.0.1').search)
  const note = parentPage.locator('#note')
  await expect(note).toContainText('Ava M. (SAMPLE)')
  await expect(parentPage.locator('.sample-badge').first()).toBeVisible()
  await expect(note.locator('[data-section="meals"]')).toContainText('Lunch')
  await expect(note.locator('[data-section="meals"]')).toContainText('Ate all')
  await expect(note.locator('[data-section="sleep"]')).toContainText('12:40 PM to 2:05 PM (1 h 25 min)')
  await expect(note).toContainText('Sarah M. (SAMPLE)')
  await shot(parentPage, testInfo, 'journey', '3-parent-note')

  // ---- 4:30 PM, door tablet: the neighbour is not on the pick-up list; Joan (grandmother) signs Ava out ----
  await setNow(context, T.pickUp)
  await page.goto('/door/')
  await tap(page, page.locator('button.child[data-child="c_ava"]'), 'Ava card')
  await tap(page, page.locator('#action-out'), 'Sign out')
  await expect(page.getByText('Who is picking up?')).toBeVisible()
  await expect(page.locator('button.person[data-person="p_ava_gran"]')).toBeVisible()
  await expect(page.locator('button.person[data-person="p_ava_neighbour"]'), 'the neighbour may drop off but not pick up').toHaveCount(0)
  await tap(page, page.locator('#someone-else'), 'Someone else')
  await expect(page.locator('#not-on-list')).toContainText('Not on the list')
  await expect(page.locator('#not-on-list')).toContainText('Get the supervisor.')
  const stillIn = await api(request, 'GET', '/api/door/children/c_ava', null, bearer(door), { now: T.pickUp })
  expect(stillIn.body.child.status, 'nobody signed Ava out').toBe('in')
  await shot(page, testInfo, 'journey', '4-door-not-on-list')
  await tap(page, page.locator('#back'), 'Back')
  await tap(page, page.locator('button.person[data-person="p_ava_gran"]'), 'Joan')
  await drawSignature(page, page.locator('#pad'))
  await tap(page, page.locator('#pad-done'), 'Done')
  await expect(page.locator('#confirm')).toContainText('Signed out')
  await expect(page.locator('#confirm')).toContainText('Joan M. (SAMPLE)')

  // ---- 4:35 PM, office: attendance shows the pair, 9:00 AM to 4:30 PM = 7 h 30 min ----
  const office = await newContext(browser, 'desktop', { now: T.office })
  const desk = await office.newPage()
  await desk.goto('/office/')
  await keypad(desk, SUPERVISOR_PIN, desk.locator('#pin-enter'))
  await tap(desk, desk.getByRole('tab', { name: 'Attendance' }), 'Attendance tab')
  const cell = desk.locator('[data-cell="c_ava:2026-09-14"]')
  await expect(cell).toContainText('7 h 30 min')
  const sup = await supervisorToken(request)
  const att = await api(request, 'GET', '/api/office/attendance?from=2026-09-14&to=2026-09-14', null, bearer(sup), { now: T.office })
  expect(att.body.children.find((c) => c.id === 'c_ava').minutes, 'the API counts the same pair').toBe(450)
  await shot(desk, testInfo, 'journey', '5-office-attendance')

  // ---- midnight: the parent link works at 11:59:59 PM and not a second after 12:00 AM ----
  await setNow(parent, T.lastMinute)
  await parentPage.reload()
  await expect(parentPage.locator('#note [data-section="meals"]')).toContainText('Ate all')
  await setNow(parent, T.nextDay)
  await parentPage.reload()
  await expect(parentPage.locator('#note-error')).toContainText('stopped working at midnight')
  await expect(parentPage.locator('[data-section]'), 'none of the child is left on the page').toHaveCount(0)
  await shot(parentPage, testInfo, 'journey', '6-parent-link-expired')

  for (const c of [context, staff, parent, office]) assertNoThirdParty(c)
  await Promise.all([staff.close(), parent.close(), office.close()])
})
