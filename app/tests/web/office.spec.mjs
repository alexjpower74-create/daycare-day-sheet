// Office against the real Worker: who may open it, children and their people, ratios that change the room view, staff PINs.
// Every action under test is a real tap, typing, keypad press or a native select/date fill; the API sets up and reads back.
import { test, expect } from '@playwright/test'
import {
  at, fresh, assertNoThirdParty, newContext, tap, type, keypad, api, bearer, doorToken, signInViaApi, signOutViaApi, presenceViaApi, staffToken,
  stateColour, STATE_RGB, shot, SUPERVISOR_PIN, EDUCATOR_PIN,
} from '../helpers.mjs'

async function officeSignIn(page, pin = SUPERVISOR_PIN) {
  await page.goto('/office/')
  await keypad(page, pin, page.locator('#pin-enter'))
}
async function openTab(page, name) {
  const tab = page.getByRole('tab', { name, exact: true })
  await tap(page, tab, `tab ${name}`)
  await expect(tab).toHaveAttribute('aria-selected', 'true')
}

test.beforeEach(async ({ context, request }) => { await fresh(context, request) })
test.afterEach(async ({ context }) => { assertNoThirdParty(context) })

test('an educator\'s PIN signs in but the office says only the supervisor can open it', async ({ page }, testInfo) => {
  await officeSignIn(page, EDUCATOR_PIN)
  await expect(page.locator('#office-refused')).toHaveText('Only the supervisor can open the office.')
  await expect(page.getByRole('tab')).toHaveCount(0)
  await shot(page, testInfo, 'web', 'office-refused')
})

test('Today shows the counts, the room meters and a register link per room', async ({ page, request }, testInfo) => {
  const marie = await staffToken(request)
  await presenceViaApi(request, marie, 'r_infant')
  const door = await doorToken(request)
  for (const c of ['ava', 'liam', 'nora']) await signInViaApi(request, door, `c_${c}`, `p_${c}_mother`)
  await officeSignIn(page)
  await openTab(page, 'Today')
  await expect(page.locator('#count-in .count-number')).toHaveText('3')
  const today = (await api(request, 'GET', '/api/staff/today', undefined, bearer(marie))).body
  await expect(page.locator('#count-not-in .count-number')).toHaveText(String(today.not_in_yet.length))
  const infant = page.locator('[data-room-card="r_infant"]')
  await expect(infant).toHaveAttribute('data-state', 'at_limit')
  expect(await stateColour(infant)).toBe(STATE_RGB.at_limit)
  await expect(infant.locator('.meter-label')).toHaveText(today.rooms[0].meter.label)
  await expect(page.locator('a.print-register')).toHaveCount(3)
  await shot(page, testInfo, 'web', 'office-today')
})

test('a person added with May pick up off is refused at the door list, and switching it on changes the API', async ({ page, request }, testInfo) => {
  const door = await doorToken(request)
  await officeSignIn(page)
  await openTab(page, 'Children')
  await tap(page, page.locator('#add-child'), 'Add a child')
  const form = page.locator('#child-form')
  await type(page, form.locator('input[name="name"]'), 'Kai N. (SAMPLE)')
  await form.locator('input[name="dob"]').fill('2025-02-01')
  await form.locator('select[name="home_room_id"]').selectOption('r_infant')
  await form.locator('input[name="start_date"]').fill('2026-09-01')
  await tap(page, page.locator('#save-child'), 'Add child')
  await expect(page.locator('#child-status')).toHaveText('Added Kai N. (SAMPLE).')
  const childId = await page.locator('[data-child-row]').filter({ hasText: 'Kai N. (SAMPLE)' }).getAttribute('data-child-row')
  expect(childId).toBeTruthy()

  const add = page.locator('#add-person')
  await type(page, add.locator('input[name="name"]'), 'Rita N. (SAMPLE)')
  await type(page, add.locator('input[name="relationship"]'), 'Aunt')
  await expect(add.locator('input[name="may_pick_up"]')).not.toBeChecked()
  await tap(page, page.locator('#save-person'), 'Add a person')
  await expect(page.locator('#people-status')).toHaveText('Added Rita N. (SAMPLE).')
  const row = page.locator('[data-person-row]').filter({ hasText: 'Rita N. (SAMPLE)' })
  const personId = await row.getAttribute('data-person-row')
  await expect(row.locator('input[name="may_pick_up"]')).not.toBeChecked()

  const doorPerson = async () => (await api(request, 'GET', `/api/door/children/${childId}`, undefined, bearer(door))).body.people.find((p) => p.id === personId)
  expect(await doorPerson(), 'door list after adding with May pick up off').toMatchObject({ name: 'Rita N. (SAMPLE)', relationship: 'Aunt', may_pick_up: false })
  await shot(page, testInfo, 'web', 'office-children')

  await tap(page, page.locator(`[data-person-row="${personId}"] label.switch-may_pick_up`), 'May pick up switch')
  await expect(page.locator('#people-status')).toHaveText('Saved Rita N. (SAMPLE): May pick up on.')
  await expect(page.locator(`[data-person-row="${personId}"] input[name="may_pick_up"]`)).toBeChecked()
  expect(await doorPerson(), 'door list after switching May pick up on').toMatchObject({ may_pick_up: true })
})

test('Rooms and ratios: an edit to 1:4 turns the room view at the limit, clearing it shows Not set, and the cited number comes back', async ({ page, request, browser }, testInfo) => {
  const marie = await staffToken(request)
  await presenceViaApi(request, marie, 'r_infant')
  const door = await doorToken(request)
  for (const c of ['ava', 'liam', 'nora', 'owen']) await signInViaApi(request, door, `c_${c}`, `p_${c}_mother`)

  await officeSignIn(page)
  await openTab(page, 'Rooms and ratios')
  await expect(page.getByText('Your licence may differ.')).toBeVisible()
  const per = page.locator('input[name="per-infant"]')
  const max = page.locator('input[name="max-infant"]')
  await expect(per).toHaveValue('3')
  await expect(max).toHaveValue('6')
  await type(page, per, '4', { clear: true })
  await tap(page, page.locator('button.save-ratio[data-group="infant"]'), 'Save infant ratio')
  await expect(page.locator('#ratio-status-infant')).toHaveText('Saved. The room view uses it now.')
  await page.reload()
  await expect(page.locator('input[name="per-infant"]'), 'ratio form after reload').toHaveValue('4')
  await expect(page.locator('[data-rule="infant"]')).toContainText('Changed from the cited number.')
  await shot(page, testInfo, 'web', 'office-rooms')

  const phone = await newContext(browser, 'phone')
  const room = await phone.newPage()
  await room.goto('/room/')
  await keypad(room, EDUCATOR_PIN, room.locator('#pin-enter'))
  const card = room.locator('button.room[data-room="r_infant"]')
  await expect(card, 'room view card with 4 infants, 1 staff at 1:4').toHaveAttribute('data-state', 'at_limit')
  expect(await stateColour(card)).toBe(STATE_RGB.at_limit)
  assertNoThirdParty(phone)
  await phone.close()

  await type(page, page.locator('input[name="per-infant"]'), '', { clear: true })
  await tap(page, page.locator('button.save-ratio[data-group="infant"]'), 'Save the cleared number')
  await expect(page.locator('[data-not-set="infant"]')).toContainText('Not set.')
  await openTab(page, 'Today')
  const infant = page.locator('[data-room-card="r_infant"]')
  await expect(infant).toHaveAttribute('data-state', 'unset')
  await expect(infant.locator('.state-pill')).toHaveText('Not set')

  await openTab(page, 'Rooms and ratios')
  await tap(page, page.locator('button.reset-ratio[data-group="infant"]'), 'Back to the cited number')
  await expect(page.locator('#ratio-status-infant')).toHaveText('Back to the cited number.')
  await expect(page.locator('input[name="per-infant"]')).toHaveValue('3')
  await expect(page.locator('input[name="max-infant"]')).toHaveValue('6')
  const rule = (await api(request, 'GET', '/api/office/ratios', undefined, bearer(await staffToken(request, SUPERVISOR_PIN)))).body.rules.find((r) => r.age_group === 'infant')
  expect([rule.children_per_caregiver, rule.max_children, rule.edited]).toEqual([3, 6, false])
})

test('adding staff with a PIN someone already has shows the API message under the PIN field', async ({ page, request }, testInfo) => {
  await officeSignIn(page)
  await openTab(page, 'Staff')
  const form = page.locator('[data-staff-form="new"]')
  await type(page, form.locator('input[name="name"]'), 'Jo B. (SAMPLE)')
  await form.locator('select[name="role"]').selectOption('educator')
  await type(page, form.locator('input[name="pin"]'), EDUCATOR_PIN)
  await tap(page, form.getByRole('button', { name: 'Add staff' }), 'Add staff')
  const refusal = await api(request, 'POST', '/api/office/staff', { name: 'Jo B. (SAMPLE)', role: 'educator', pin: EDUCATOR_PIN, active: true },
    bearer(await staffToken(request, SUPERVISOR_PIN)))
  expect([refusal.status, refusal.body.code, refusal.body.field]).toEqual([409, 'pin_taken', 'pin'])
  await expect(form.locator('input[name="pin"] + .field-error')).toHaveText(refusal.body.error)
  await expect(form.locator('input[name="pin"]')).toHaveAttribute('aria-invalid', 'true')
  await shot(page, testInfo, 'web', 'office-staff')
  // Nothing was added by either try.
  const list = (await api(request, 'GET', '/api/office/staff', undefined, bearer(await staffToken(request, SUPERVISOR_PIN)))).body.staff
  expect(list.some((s) => s.name === 'Jo B. (SAMPLE)')).toBe(false)
})


test('Today follows up from the API: a pending signature for a child who went home is listed, and Fix a time clears a visit left open', async ({ page, request }, testInfo) => {
  const door = (await api(request, 'POST', '/api/door/unlock', { pin: SUPERVISOR_PIN }, { 'X-Test-IP': 'fu-door' }, { now: at('2026-09-10T07:00:00-02:30') })).body.token
  // Thu Sep 10: Ava in at 9:00 AM and never signed out.
  await signInViaApi(request, door, 'c_ava', 'p_ava_mother', { now: at('2026-09-10T09:00:00-02:30') })
  // Fri Sep 11: Marie records Liam's drop-off without a signature; he goes home at 4:00 PM, so he is not here today.
  const marie = (await api(request, 'POST', '/api/signin', { pin: EDUCATOR_PIN }, { 'X-Test-IP': 'fu-marie' }, { now: at('2026-09-11T07:30:00-02:30') })).body.token
  expect((await api(request, 'POST', '/api/staff/children/c_liam/in', { person_id: 'p_liam_father' }, bearer(marie), { now: at('2026-09-11T08:00:00-02:30') })).status).toBe(201)
  await signOutViaApi(request, door, 'c_liam', 'p_liam_mother', { now: at('2026-09-11T16:00:00-02:30') })

  const dana = await staffToken(request, SUPERVISOR_PIN)
  const follow = (await api(request, 'GET', '/api/office/follow-ups', undefined, bearer(dana))).body
  expect(follow.pending_signatures.map((p) => [p.child.id, p.which])).toEqual([['c_liam', 'in']])
  expect(follow.not_signed_out.map((v) => v.child.id)).toEqual(['c_ava'])
  const today = (await api(request, 'GET', '/api/staff/today', undefined, bearer(dana))).body
  expect(today.rooms.flatMap((r) => r.children.map((c) => c.id)), 'Liam is not in the building').not.toContain('c_liam')

  await officeSignIn(page)
  await openTab(page, 'Today')
  const liam = page.locator('[data-signature-needed="c_liam"]')
  await expect(liam, 'a pending signature for a child who went home').toContainText('Liam K. (SAMPLE)')
  await expect(liam).toContainText(`Drop-off ${follow.pending_signatures[0].date_label}, ${follow.pending_signatures[0].time_label}`)
  const ava = page.locator('[data-not-signed-out="c_ava"]')
  await expect(ava).toContainText(`${follow.not_signed_out[0].date_label}, in at ${follow.not_signed_out[0].in_label}`)
  await expect(ava).toContainText('Thu Sep 10')
  expect(await page.locator('#office-panel').innerText(), 'no ISO date on the Today tab').not.toMatch(/\b\d{4}-\d{2}-\d{2}\b/)
  await shot(page, testInfo, 'web', 'office-today-follow-ups')

  await tap(page, ava.getByRole('button', { name: 'Fix a time' }), 'Fix a time for Ava')
  const dialog = page.locator('#fix-dialog')
  await expect(dialog.locator('input[name="out_date"]')).toHaveValue('2026-09-10')
  await dialog.locator('input[name="out_time"]').fill('17:00')
  await type(page, dialog.locator('textarea[name="reason"]'), 'Picked up at 5; the tablet was off.')
  await tap(page, dialog.locator('#fix-save'), 'Save the time')
  await expect(dialog).toHaveCount(0)
  await expect(ava, 'the fixed visit leaves the list').toHaveCount(0)
  await expect(page.locator('#follow-up-status')).toContainText('Time fixed.')
  const after = (await api(request, 'GET', '/api/office/follow-ups', undefined, bearer(dana))).body
  expect(after.not_signed_out).toEqual([])
  expect(after.pending_signatures.map((p) => p.child.id)).toEqual(['c_liam'])
})
