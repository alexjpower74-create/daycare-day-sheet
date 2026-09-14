// Daily note: the staff note, the parent link on a parent's phone, live updates, midnight, unknown links and print.
// Real Worker; real taps and typing for everything under test. The parent page's 60-second poll is advanced with Playwright's
// clock (timers only; the page takes every date and time from the API).
import { test, expect } from '@playwright/test'
import {
  NOW, at, fresh, assertNoThirdParty, setNow, newContext, tap, type, keypad, api, bearer, staffToken, doorToken, signInViaApi,
  presenceViaApi, shot, EDUCATOR_PIN,
} from '../helpers.mjs'

const SECTIONS = ['meals', 'sleep', 'toileting', 'mood', 'activities', 'staff-notes', 'line']
const LATE = at('2026-09-14T23:59:00-02:30')
const MIDNIGHT = at('2026-09-15T00:00:00-02:30')
const plus = (minutes) => new Date(Date.parse(NOW) + minutes * 60_000).toISOString()
const section = (page, name) => page.locator(`#note [data-section="${name}"]`)

async function signInOnPage(page) {
  await page.goto('/room/')
  await keypad(page, EDUCATOR_PIN, page.locator('#pin-enter'))
  await expect(page.locator('button.room[data-room="r_infant"]')).toBeVisible()
}
async function openAva(page) {
  await tap(page, page.locator('button.child[data-child="c_ava"]'), 'Ava card')
  await expect(page.locator('#child-sheet #today-logs')).toBeVisible()
}

test.beforeEach(async ({ context, request }) => { await fresh(context, request) })
test.afterEach(async ({ context }) => { assertNoThirdParty(context) })

test('staff note, parent link on a parent phone: the same note, live, still there at 11:59 PM, gone at midnight', async ({ page, context, request, browser, browserName }, testInfo) => {
  test.setTimeout(120_000)
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  const marie = await staffToken(request)
  await presenceViaApi(request, marie, 'r_infant')
  await signInViaApi(request, await doorToken(request), 'c_ava', 'p_ava_mother')

  // Logs through the page
  await signInOnPage(page)
  await openAva(page)
  let minute = 0
  const log = async (selector, label) => {
    await setNow(context, plus(++minute))
    await tap(page, page.locator(`#child-sheet ${selector}`), label)
    await expect(page.locator('#toast .toast-text')).toHaveText(`Saved: ${label}`)
  }
  await tap(page, page.locator('#child-sheet button.meal[data-meal="lunch"]'), 'Lunch chip')
  await log('button.log[data-kind="meal"][data-value="all"]', 'Lunch: ate all')
  await log('button.log[data-kind="nap_start"]', 'Fell asleep')
  await log('button.log[data-kind="nap_end"]', 'Woke up')
  await log('button.log[data-kind="diaper"][data-value="wet"]', 'Wet diaper')
  await log('button.log[data-kind="mood"][data-value="happy"]', 'Happy')
  await setNow(context, plus(++minute))
  await type(page, page.locator('#note-text'), 'Loved the water table.')
  await tap(page, page.locator('#save-note'), 'Save note')
  await expect(page.locator('#toast .toast-text')).toHaveText('Saved: Loved the water table.')

  // The staff note shows each section
  await tap(page, page.locator('#open-note'), 'Daily note')
  await page.waitForURL(/\/room\/note\/\?child=c_ava$/)
  for (const s of SECTIONS) await expect(section(page, s), `staff note section ${s}`).toBeVisible()
  await expect(section(page, 'meals')).toContainText('Lunch: Ate all')
  await expect(section(page, 'sleep')).toContainText('9:02 AM to 9:03 AM (1 min)') // Nap start at minute 2, Nap end at minute 3
  await expect(section(page, 'toileting')).toContainText('Wet diaper')
  await expect(section(page, 'mood')).toContainText('Happy')
  await expect(section(page, 'staff-notes')).toContainText('Loved the water table.')

  await type(page, page.locator('#note-line'), 'A great morning.')
  await tap(page, page.locator('#save-line'), 'Save the line')
  await expect(section(page, 'line')).toContainText('A great morning.')
  const activity = page.locator('textarea.activity[data-room="r_infant"]')
  await type(page, activity, 'Sensory bins and a walk.')
  await tap(page, page.locator('button.save-activity[data-room="r_infant"]'), 'Save the activity')
  await expect(section(page, 'activities')).toContainText('Sensory bins and a walk.')

  // Make parent link, Copy link
  await tap(page, page.locator('#make-link'), 'Make parent link')
  await expect(page.locator('#note-link')).toHaveValue(/\/note\/\?t=[A-Za-z0-9_-]{43}$/)
  await expect(page.getByText('Works until midnight tonight.')).toBeVisible()
  const url = await page.locator('#note-link').inputValue()
  const token = new URL(url).searchParams.get('t')
  await tap(page, page.locator('#copy-link'), 'Copy link')
  await expect(page.locator('#copy-link')).toContainText('Copied')
  if (browserName === 'chromium') {
    expect(await page.evaluate(() => navigator.clipboard.readText()), 'clipboard holds the parent link').toBe(url)
  } else {
    testInfo.annotations.push({ type: 'skipped check', description: 'WebKit under Playwright cannot grant clipboard-read, so only "Copied" is asserted here; the chromium projects read the clipboard back.' })
  }
  await shot(page, testInfo, 'web', 'staff-note')

  // The parent opens the link on their own phone
  const parentContext = await newContext(browser, 'phone', { now: plus(++minute) })
  const parent = await parentContext.newPage()
  await parent.clock.install()
  await parent.goto(url)
  const note = (await api(request, 'GET', `/api/note/${token}`, undefined, {}, { now: plus(minute) })).body
  for (const s of SECTIONS) await expect(section(parent, s), `parent section ${s}`).toBeVisible()
  await expect(parent.locator('#note')).toContainText(note.child.name)
  await expect(parent.locator('#note')).toContainText(`Arrived ${note.arrived.time_label} with ${note.arrived.by}`)
  for (const m of note.meals) await expect(section(parent, 'meals')).toContainText(`${m.meal_label}: ${m.value_label}${m.time_label}`)
  for (const n of note.naps) await expect(section(parent, 'sleep')).toContainText(n.label)
  for (const t of note.toileting) await expect(section(parent, 'toileting')).toContainText(`${t.label}${t.time_label}`)
  for (const m of note.moods) await expect(section(parent, 'mood')).toContainText(`${m.label}${m.time_label}`)
  for (const a of note.activities) await expect(section(parent, 'activities')).toContainText(`${a.text}${a.room_name}`)
  for (const n of note.staff_notes) await expect(section(parent, 'staff-notes')).toContainText(`${n.text}${n.time_label} · ${n.by_initials}`)
  await expect(section(parent, 'line')).toHaveText(`A line from your educator${note.note_line}`)
  await expect(parent.locator('#note')).toContainText('Daily record of sleeping, eating and toileting')
  expect([note.meals.length, note.naps.length, note.toileting.length, note.moods.length, note.staff_notes.length]).toEqual([1, 1, 1, 1, 1])
  await expect(parent.locator('.sample-badge')).toBeVisible()
  expect(await parent.locator('body').innerText(), 'no phone number on the parent page').not.toMatch(/\d{3}[-. ]\d{3}[-. ]\d{4}/)

  // A log added on the staff page shows on the parent page after its next poll
  await page.goto('/room/')
  await openAva(page)
  await log('button.log[data-kind="mood"][data-value="tired"]', 'Tired')
  await expect(section(parent, 'mood')).not.toContainText('Tired')
  await parent.clock.runFor(61_000)
  await expect(section(parent, 'mood'), 'parent page after its next poll').toContainText('Tired')

  // 11:59 PM that night: still works
  await setNow(parentContext, LATE)
  await parent.reload()
  await expect(section(parent, 'mood')).toContainText('Tired')

  // 12:00 AM the next day: the poll removes the note, and so does a reload
  await setNow(parentContext, MIDNIGHT)
  const gone = await api(request, 'GET', `/api/note/${token}`, undefined, {}, { now: MIDNIGHT })
  expect(gone.status).toBe(410)
  await parent.clock.runFor(61_000)
  await expect(parent.locator('#note-error'), '#note-error after the poll at midnight').toHaveText(gone.body.error)
  await expect(parent.locator('#note [data-section]'), 'no child section after the poll at midnight').toHaveCount(0)
  await parent.reload()
  await expect(parent.locator('#note-error'), '#note-error after a reload at midnight').toHaveText(gone.body.error)
  await expect(parent.locator('#note [data-section]')).toHaveCount(0)
  await expect(parent.locator('#note')).not.toContainText('Ava')
  if (testInfo.project.name.endsWith('390')) await shot(parent, testInfo, 'web', 'parent-note-expired')

  assertNoThirdParty(parentContext)
  await parentContext.close()
})

test('an unknown link shows the API\'s 404 text and nothing of any child', async ({ page, request }, testInfo) => {
  const answer = await api(request, 'GET', '/api/note/not-a-real-token-at-all')
  expect(answer.status).toBe(404)
  await page.goto('/note/?t=not-a-real-token-at-all')
  await expect(page.locator('#note-error')).toHaveText(answer.body.error)
  await expect(page.locator('#note [data-section]')).toHaveCount(0)
  await expect(page.locator('.sample-badge')).toBeVisible()
  await shot(page, testInfo, 'web', 'parent-note-error')
})

test('print hides Print and every .no-print, and the note sections stay visible', async ({ page, request }, testInfo) => {
  const marie = await staffToken(request)
  await presenceViaApi(request, marie, 'r_infant')
  await signInViaApi(request, await doorToken(request), 'c_ava', 'p_ava_mother')
  await api(request, 'POST', '/api/staff/children/c_ava/logs', { kind: 'meal', value: 'all', meal: 'breakfast' }, bearer(marie))
  const link = await api(request, 'POST', '/api/staff/children/c_ava/note/link', undefined, bearer(marie))
  expect(link.status).toBe(201)
  await page.goto(link.body.url)
  for (const s of SECTIONS) await expect(section(page, s)).toBeVisible()
  await expect(page.locator('#print')).toBeVisible()
  await shot(page, testInfo, 'web', 'parent-note')

  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('#print')).toBeHidden()
  const noPrint = page.locator('.no-print')
  const count = await noPrint.count()
  expect(count, 'the page marks something .no-print').toBeGreaterThan(0)
  for (let i = 0; i < count; i++) await expect(noPrint.nth(i)).toBeHidden()
  for (const s of SECTIONS) await expect(section(page, s), `printed section ${s}`).toBeVisible()
  await expect(page.locator('.sample-badge')).toBeVisible()
  await shot(page, testInfo, 'web', 'parent-note-print')
})

// dd1's cross-review of dd2 M1, item 3: the "What we did today" boxes come from the note's rooms_today, so a room the child was in
// earlier today still gets its box after the child has moved back, even with no line written for it yet.
test('the staff note offers a "What we did today" box for every room the child was in today, in order', async ({ page, request }) => {
  const marie = await staffToken(request)
  await signInViaApi(request, await doorToken(request), 'c_ava', 'p_ava_mother')
  const move = async (room) => expect((await api(request, 'POST', '/api/staff/children/c_ava/move', { room_id: room }, bearer(marie))).status).toBe(200)
  await move('r_toddler')
  await move('r_infant')
  const note = (await api(request, 'GET', '/api/staff/children/c_ava/note', undefined, bearer(marie))).body
  expect(note.rooms_today.map((r) => r.room_id), 'API rooms_today').toEqual(['r_infant', 'r_toddler'])
  expect(note.activities).toEqual([])

  await signInOnPage(page)
  await page.goto('/room/note/?child=c_ava')
  const boxes = page.locator('textarea.activity')
  await expect(boxes, 'one box per room in rooms_today').toHaveCount(2)
  expect(await boxes.evaluateAll((els) => els.map((e) => e.dataset.room))).toEqual(['r_infant', 'r_toddler'])

  await type(page, page.locator('textarea.activity[data-room="r_toddler"]'), 'Painting with the toddlers.')
  await tap(page, page.locator('button.save-activity[data-room="r_toddler"]'), 'Save the toddler room line')
  await expect(section(page, 'activities')).toContainText('Painting with the toddlers.Toddler room')
  const after = (await api(request, 'GET', '/api/staff/children/c_ava/note', undefined, bearer(marie))).body
  expect(after.activities).toEqual([{ room_id: 'r_toddler', room_name: 'Toddler room', text: 'Painting with the toddlers.' }])
})
