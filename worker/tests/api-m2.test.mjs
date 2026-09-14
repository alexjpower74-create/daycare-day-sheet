// M2 API suite: the office, attendance and its CSVs, fixing a time, the register, and the demo seed. Fresh SAMPLE centre per test.
import assert from 'node:assert/strict'
import { beforeEach, test } from 'node:test'
import { call, doorToken, nl, PIN, presence, reset, SIG, SIG_SVG, signIn, signOut, staffToken, T9 } from './api-helpers.mjs'

beforeEach(reset)

const sup = (now = T9) => staffToken(PIN.dana, now)
const GOOD_CHILD = { name: 'Nell P. (SAMPLE)', dob: '2025-02-01', home_room_id: 'r_infant', schedule: 'part_time', days: ['wed', 'mon'],
  start_date: '2026-09-01', end_date: null }
const ATT_HEADER = 'Date,Child,Room,In,Dropped off by,Out,Picked up by,Minutes,Hours,Away,Note'
const SUM_HEADER = 'Child,Room,Days present,Minutes,Hours,Days away,Sick,Holiday,Appointment,Family reasons,Other,Not signed out'

function refused(r, field, { status = 400, code = 'bad_request' } = {}) {
  assert.deepEqual([r.status, r.body.code, r.body.field], [status, code, field], JSON.stringify(r.body))
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cell = ''
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++ } else if (ch === '"') quoted = false
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === ',') { row.push(cell); cell = '' } else if (ch === '\r' && text[i + 1] === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; i++ } else cell += ch
  }
  if (cell || row.length) rows.push([...row, cell])
  return rows
}

// ---------- children ----------

test('children: create, list, change part of a child, and an end date in the past makes the child inactive', async () => {
  const dana = await sup()
  const r = await call('POST', '/api/office/children', { token: dana, body: GOOD_CHILD })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  const id = r.body.child.id
  assert.match(id, /^c_[0-9a-f]{16}$/)
  assert.deepEqual({ ...r.body.child, id: 'x' }, { id: 'x', name: 'Nell P. (SAMPLE)', initials: 'NP', dob: '2025-02-01', age_label: '1 year 7 months',
    home_room_id: 'r_infant', room_id: null, room_name: 'Infant room', schedule: 'part_time', days: ['mon', 'wed'], start_date: '2026-09-01',
    end_date: null, active: true })
  const list = await call('GET', '/api/office/children', { token: dana })
  assert.equal(list.body.children.length, 20)
  const nell = list.body.children.find((c) => c.id === id)
  assert.deepEqual([nell.people, nell.emergency], [[], null])
  const ava = list.body.children.find((c) => c.id === 'c_ava')
  assert.deepEqual([ava.people.length, ava.emergency.id, ava.emergency.phone], [4, 'p_ava_mother', '709-555-0101'])
  const put = await call('PUT', `/api/office/children/${id}`, { token: dana, body: { name: 'Nell Q. (SAMPLE)', home_room_id: 'r_toddler' } })
  assert.equal(put.status, 200, JSON.stringify(put.body))
  assert.deepEqual([put.body.child.name, put.body.child.initials, put.body.child.home_room_id, put.body.child.dob, put.body.child.days],
    ['Nell Q. (SAMPLE)', 'NQ', 'r_toddler', '2025-02-01', ['mon', 'wed']])
  const ended = await call('PUT', `/api/office/children/${id}`, { token: dana, body: { end_date: '2026-09-13' } })
  assert.deepEqual([ended.status, ended.body.child.active, ended.body.child.end_date], [200, false, '2026-09-13'])
  const again = await call('GET', '/api/office/children', { token: dana })
  assert.equal(again.body.children.at(-1).id, id, 'inactive children come after the active ones')
  const door = await doorToken()
  assert.ok(!(await call('GET', '/api/door/children', { token: door })).body.children.some((c) => c.id === id))
  assert.equal((await call('PUT', '/api/office/children/c_nobody', { token: dana, body: { name: 'X' } })).status, 404)
  assert.equal((await call('GET', '/api/office/children', { token: await staffToken(PIN.marie) })).status, 403)
})

const postChild = async (body) => call('POST', '/api/office/children', { token: await sup(), body })

test('children: name is 1 to 60 characters', async () => {
  for (const name of ['', '   ', 'x'.repeat(61), 42, undefined]) refused(await postChild({ ...GOOD_CHILD, name }), 'name')
  assert.equal((await postChild({ ...GOOD_CHILD, name: 'x'.repeat(60) })).status, 201)
})

test('children: dob is a real date, not in the future', async () => {
  for (const dob of ['2026-02-30', '2026-09-15', '14/09/2025', null, undefined]) refused(await postChild({ ...GOOD_CHILD, dob }), 'dob')
  assert.equal((await postChild({ ...GOOD_CHILD, dob: '2026-09-14' })).status, 201)
})

test('children: home_room_id is an open room', async () => {
  const dana = await sup()
  const spare = await call('POST', '/api/office/rooms', { token: dana, body: { name: 'Spare room', age_group: 'infant' } })
  await call('PUT', `/api/office/rooms/${spare.body.room.id}`, { token: dana, body: { active: false } })
  for (const home of ['r_attic', 7, undefined, spare.body.room.id]) refused(await postChild({ ...GOOD_CHILD, home_room_id: home }), 'home_room_id')
})

test('children: schedule is full_time or part_time', async () => {
  for (const schedule of ['weekends', '', undefined]) refused(await postChild({ ...GOOD_CHILD, schedule }), 'schedule')
  assert.equal((await postChild({ ...GOOD_CHILD, schedule: 'full_time' })).status, 201)
})

test('children: days are 1 to 7 of mon…sun with no repeats', async () => {
  for (const days of [[], ['mon', 'mon'], ['monday'], 'mon', ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun', 'mon'], undefined]) {
    refused(await postChild({ ...GOOD_CHILD, days }), 'days')
  }
  const all = await postChild({ ...GOOD_CHILD, days: ['sun', 'sat', 'fri', 'thu', 'wed', 'tue', 'mon'] })
  assert.deepEqual(all.body.child.days, ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])
})

test('children: start_date is a real date', async () => {
  for (const start of ['2026-13-01', '', undefined]) refused(await postChild({ ...GOOD_CHILD, start_date: start }), 'start_date')
})

test('children: end_date is empty or on or after the start date', async () => {
  for (const end of ['2026-08-31', 'soon']) refused(await postChild({ ...GOOD_CHILD, end_date: end }), 'end_date')
  assert.equal((await postChild({ ...GOOD_CHILD, end_date: '2026-09-01' })).status, 201)
  const dana = await sup()
  refused(await call('PUT', '/api/office/children/c_ava', { token: dana, body: { end_date: '2025-12-31' } }), 'end_date')
  refused(await call('PUT', '/api/office/children/c_ava', { token: dana, body: { dob: '2030-01-01' } }), 'dob')
})

// ---------- people, rooms, ratios, staff, absences ----------

test('people: add, change, remove; the emergency contact moves; phone is 10 digits; the door never sees a phone', async () => {
  const dana = await sup()
  const door = await doorToken()
  const add = await call('POST', '/api/office/children/c_ava/people', { token: dana,
    body: { name: 'Mary B. (SAMPLE)', relationship: 'Aunt', phone: '(709) 555-0199', may_pick_up: false, emergency_contact: true } })
  assert.equal(add.status, 201, JSON.stringify(add.body))
  const mary = add.body.person.id
  assert.deepEqual({ ...add.body.person, id: 'x' }, { id: 'x', child_id: 'c_ava', name: 'Mary B. (SAMPLE)', relationship: 'Aunt',
    may_pick_up: false, emergency_contact: true, active: true, phone: '709-555-0199' })
  const kids = async () => (await call('GET', '/api/office/children', { token: dana })).body.children.find((c) => c.id === 'c_ava')
  let ava = await kids()
  assert.equal(ava.emergency.id, mary)
  assert.equal(ava.people.find((p) => p.id === 'p_ava_mother').emergency_contact, false, 'setting it clears it on the others')
  const doorAva = async () => (await call('GET', '/api/door/children/c_ava', { token: door })).body
  const seen = await doorAva()
  assert.deepEqual(seen.people.find((p) => p.id === mary), { id: mary, name: 'Mary B. (SAMPLE)', relationship: 'Aunt', may_pick_up: false })
  assert.doesNotMatch(JSON.stringify(seen), /phone|709-555/)
  await signIn(door, 'c_ava', 'p_ava_mother')
  const out = (person) => call('POST', '/api/door/children/c_ava/out', { token: door, body: { person_id: person, signature: { w: 600, h: 200, strokes: [[10, 10, 200, 100]] } } })
  assert.equal((await out(mary)).status, 403)
  assert.equal((await call('PUT', `/api/office/people/${mary}`, { token: dana, body: { may_pick_up: true } })).status, 200)
  assert.equal((await doorAva()).people.find((p) => p.id === mary).may_pick_up, true)
  assert.equal((await out(mary)).status, 200)
  assert.equal((await call('PUT', '/api/office/people/p_ava_father', { token: dana, body: { emergency_contact: true } })).status, 200)
  ava = await kids()
  assert.deepEqual([ava.emergency.id, ava.people.find((p) => p.id === mary).emergency_contact], ['p_ava_father', false])
  const post = (body) => call('POST', '/api/office/children/c_ava/people', { token: dana, body: { name: 'Pat C. (SAMPLE)', relationship: 'Uncle', ...body } })
  for (const phone of ['12345', '709-555-01999', 'call me', 7095550100]) refused(await post({ phone }), 'phone')
  refused(await post({ name: '' }), 'name')
  refused(await post({ relationship: '' }), 'relationship')
  refused(await post({ may_pick_up: 'yes' }), 'may_pick_up')
  refused(await post({ emergency_contact: 1 }), 'emergency_contact')
  refused(await call('PUT', `/api/office/people/${mary}`, { token: dana, body: { name: '' } }), 'name')
  assert.deepEqual([(await post({ phone: null })).body.person.phone, (await post({})).body.person.phone], [null, null])
  const gone = await call('DELETE', `/api/office/people/${mary}`, { token: dana })
  assert.deepEqual([gone.status, gone.body.person.active], [200, false])
  assert.ok(!(await doorAva()).people.some((p) => p.id === mary))
  assert.equal((await kids()).people.find((p) => p.id === mary).active, false, 'history keeps the name')
  assert.equal((await call('POST', '/api/office/children/c_nobody/people', { token: dana, body: { name: 'X', relationship: 'Y' } })).status, 404)
  assert.equal((await call('PUT', '/api/office/people/p_nobody', { token: dana, body: { name: 'X' } })).status, 404)
})

test('rooms: list, add, change, and a room with children signed in cannot be closed', async () => {
  const dana = await sup()
  const door = await doorToken()
  const marie = await staffToken(PIN.marie)
  const list = await call('GET', '/api/office/rooms', { token: dana })
  assert.deepEqual(list.body.rooms, [
    { id: 'r_infant', name: 'Infant room', age_group: 'infant', active: true, sort: 1 },
    { id: 'r_toddler', name: 'Toddler room', age_group: 'toddler', active: true, sort: 2 },
    { id: 'r_preschool', name: 'Preschool room', age_group: 'preschool', active: true, sort: 3 }])
  const add = await call('POST', '/api/office/rooms', { token: dana, body: { name: 'Pre-kindergarten room', age_group: 'prek' } })
  assert.equal(add.status, 201, JSON.stringify(add.body))
  assert.deepEqual({ ...add.body.room, id: 'x' }, { id: 'x', name: 'Pre-kindergarten room', age_group: 'prek', active: true, sort: 4 })
  for (const [body, field] of [[{ name: '', age_group: 'prek' }, 'name'], [{ name: 'X', age_group: 'teen' }, 'age_group'],
    [{ name: 'X', age_group: 'prek', active: 'yes' }, 'active'], [{ name: 'X', age_group: 'prek', sort: 1.5 }, 'sort']]) {
    refused(await call('POST', '/api/office/rooms', { token: dana, body }), field)
  }
  const today = await call('GET', '/api/staff/today', { token: marie })
  assert.deepEqual(today.body.rooms.at(-1).meter.label, 'No children in the room.')
  assert.equal(today.body.rooms.length, 4)
  const renamed = await call('PUT', `/api/office/rooms/${add.body.room.id}`, { token: dana, body: { name: 'Pre-K room', sort: 0 } })
  assert.deepEqual([renamed.body.room.name, renamed.body.room.sort], ['Pre-K room', 0])
  assert.equal((await call('GET', '/api/office/rooms', { token: dana })).body.rooms[0].name, 'Pre-K room')
  await signIn(door, 'c_ava', 'p_ava_mother')
  await presence(marie, 'r_infant')
  const busy = await call('PUT', '/api/office/rooms/r_infant', { token: dana, body: { active: false } })
  assert.equal(busy.status, 409)
  assert.deepEqual(busy.body, { error: 'Infant room has children signed in. Move them to another room or sign them out first.', code: 'bad_state' })
  await signOut(door, 'c_ava', 'p_ava_father', nl('09:30'))
  const closed = await call('PUT', '/api/office/rooms/r_infant', { token: dana, body: { active: false }, now: nl('09:31') })
  assert.deepEqual([closed.status, closed.body.room.active], [200, false])
  const after = await call('GET', '/api/staff/today', { token: marie, now: nl('09:32') })
  assert.ok(!after.body.rooms.some((r) => r.room.id === 'r_infant'))
  assert.equal(after.body.me.room_id, null, 'staff in a closed room are no longer counted there')
  assert.ok(!(await call('GET', '/api/door/children', { token: door, now: nl('09:32') })).body.rooms.some((m) => m.room_id === 'r_infant'))
  assert.equal((await call('PUT', '/api/office/rooms/r_nobody', { token: dana, body: { name: 'X' } })).status, 404)
})

test('ratios: list with the note, change, back to the cited number, edited; the next meter uses the saved numbers', async () => {
  const dana = await sup()
  const door = await doorToken()
  const marie = await staffToken(PIN.marie)
  const list = await call('GET', '/api/office/ratios', { token: dana })
  assert.equal(list.body.note, 'Numbers from the Child Care Regulations, NLR 39/17 section 54. Your licence may differ. Check it and change them here.')
  assert.deepEqual(list.body.rules.map((r) => [r.age_group, r.edited]), [['infant', false], ['toddler', false], ['preschool', false], ['prek', false],
    ['school_age', false], ['toddler_preschool', false]])
  const four = await call('PUT', '/api/office/ratios/infant', { token: dana, body: { children_per_caregiver: 4 } })
  assert.deepEqual(four.body.rule, { age_group: 'infant', label: 'Infant (birth up to 2 years)', children_per_caregiver: 4, max_children: 6,
    default_children_per_caregiver: 3, default_max_children: 6, citation: 'NLR 39/17 s.54(1)', edited: true })
  await presence(marie, 'r_infant')
  for (const [child, person] of [['c_ava', 'p_ava_mother'], ['c_liam', 'p_liam_mother'], ['c_nora', 'p_nora_mother']]) await signIn(door, child, person)
  const owen = await signIn(door, 'c_owen', 'p_owen_mother')
  assert.deepEqual([owen.meter.state, owen.meter.allowed, owen.meter.children_per_caregiver, owen.meter.needs_staff, owen.meter.label],
    ['at_limit', 4, 4, 0, '4 children, 1 staff. At the limit.'])
  const infant = async () => (await call('GET', '/api/staff/today', { token: marie })).body.rooms.find((r) => r.room.id === 'r_infant').meter
  assert.equal((await infant()).state, 'at_limit')
  await call('PUT', '/api/office/ratios/infant', { token: dana, body: { max_children: 3 } })
  assert.equal((await infant()).label, '4 children, 1 staff. Over the most this room can hold (3).')
  const back = await call('POST', '/api/office/ratios/infant/reset', { token: dana })
  assert.deepEqual([back.status, back.body.rule.children_per_caregiver, back.body.rule.max_children, back.body.rule.edited], [200, 3, 6, false])
  const m = await infant()
  assert.deepEqual([m.state, m.needs_staff, m.label], ['over', 1, '4 children, 1 staff. Over the ratio: 1 staff can have 3. Needs 1 more staff.'])
  for (const body of [{ children_per_caregiver: 0 }, { children_per_caregiver: 51 }, { children_per_caregiver: 'four' }, { children_per_caregiver: 2.5 }]) {
    refused(await call('PUT', '/api/office/ratios/infant', { token: dana, body }), 'children_per_caregiver')
  }
  for (const body of [{ max_children: 61 }, { max_children: 0 }]) refused(await call('PUT', '/api/office/ratios/infant', { token: dana, body }), 'max_children')
  assert.equal((await call('PUT', '/api/office/ratios/teen', { token: dana, body: {} })).status, 404)
  assert.equal((await call('POST', '/api/office/ratios/teen/reset', { token: dana })).status, 404)
  const same = await call('PUT', '/api/office/ratios/toddler', { token: dana, body: { children_per_caregiver: 5, max_children: 10 } })
  assert.equal(same.body.rule.edited, false, 'the cited numbers typed in again are not an edit')
})

test('staff: list without PINs, add, change PIN and role, pin_taken, and there is always an active supervisor', async () => {
  const dana = await sup()
  const list = await call('GET', '/api/office/staff', { token: dana })
  assert.deepEqual(list.body.staff.map((s) => s.id), ['s_dana', 's_kevin', 's_marie', 's_priya'])
  assert.deepEqual(Object.keys(list.body.staff[0]).sort(), ['active', 'id', 'initials', 'name', 'role'])
  const add = await call('POST', '/api/office/staff', { token: dana, body: { name: 'Rosa L. (SAMPLE)', role: 'educator', pin: '8080' } })
  assert.equal(add.status, 201, JSON.stringify(add.body))
  const rosa = add.body.staff.id
  assert.deepEqual({ ...add.body.staff, id: 'x' }, { id: 'x', name: 'Rosa L. (SAMPLE)', initials: 'RL', role: 'educator', active: true })
  assert.equal((await call('POST', '/api/signin', { body: { pin: '8080' } })).body.staff.id, rosa)
  const taken = await call('POST', '/api/office/staff', { token: dana, body: { name: 'Sam T. (SAMPLE)', role: 'educator', pin: '1593' } })
  assert.equal(taken.status, 409)
  assert.deepEqual(taken.body, { error: 'Another staff member already has that PIN.', code: 'pin_taken', field: 'pin' })
  refused(await call('PUT', `/api/office/staff/${rosa}`, { token: dana, body: { pin: '4826' } }), 'pin', { status: 409, code: 'pin_taken' })
  assert.equal((await call('PUT', `/api/office/staff/${rosa}`, { token: dana, body: { pin: '8080' } })).status, 200, 'her own PIN again is fine')
  assert.equal((await call('PUT', `/api/office/staff/${rosa}`, { token: dana, body: { pin: '9091' } })).status, 200)
  assert.equal((await call('POST', '/api/signin', { body: { pin: '8080' } })).status, 401)
  const rosaToken = await staffToken('9091')
  for (const [body, field] of [[{ role: 'educator', pin: '7777' }, 'name'], [{ name: 'X', role: 'boss', pin: '7777' }, 'role'],
    [{ name: 'X', role: 'educator' }, 'pin'], [{ name: 'X', role: 'educator', pin: '12' }, 'pin'], [{ name: 'X', role: 'educator', pin: '7777', active: 'no' }, 'active']]) {
    refused(await call('POST', '/api/office/staff', { token: dana, body }), field)
  }
  const off = await call('PUT', `/api/office/staff/${rosa}`, { token: dana, body: { active: false } })
  assert.deepEqual([off.status, off.body.staff.active], [200, false])
  assert.equal((await call('GET', '/api/staff/today', { token: rosaToken })).status, 401, 'an inactive staff member\'s token stops')
  assert.equal((await call('POST', '/api/signin', { body: { pin: '9091' } })).status, 401)
  for (const body of [{ role: 'educator' }, { active: false }]) {
    const last = await call('PUT', '/api/office/staff/s_dana', { token: dana, body })
    assert.deepEqual([last.status, last.body.code], [409, 'bad_state'], JSON.stringify(body))
  }
  const wanda = await call('POST', '/api/office/staff', { token: dana, body: { name: 'Wanda E. (SAMPLE)', role: 'supervisor', pin: '5150' } })
  assert.equal(wanda.status, 201)
  assert.equal((await call('PUT', '/api/office/staff/s_dana', { token: dana, body: { role: 'educator' } })).status, 200)
  assert.equal((await call('GET', '/api/office/staff', { token: dana })).status, 403, 'the role comes from the staff row, not the token')
  const wandaToken = await staffToken('5150')
  assert.equal((await call('PUT', `/api/office/staff/${wanda.body.staff.id}`, { token: wandaToken, body: { active: false } })).status, 409)
  assert.equal((await call('PUT', '/api/office/staff/s_nobody', { token: wandaToken, body: { name: 'X' } })).status, 404)
})

test('absences: every reason, one per child per day, not on a day the child was signed in, and removing one', async () => {
  const dana = await sup()
  const door = await doorToken()
  const ids = {}
  for (const [child, reason, label] of [['c_liam', 'sick', 'Sick'], ['c_nora', 'holiday', 'Holiday'], ['c_owen', 'appointment', 'Appointment'],
    ['c_jack', 'family', 'Family reasons'], ['c_emma', 'other', 'Other']]) {
    const r = await call('POST', '/api/office/absences', { token: dana, body: { child_id: child, date: '2026-09-15', reason, note: 'SAMPLE note.' } })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    assert.deepEqual({ ...r.body.absence, id: 'x' }, { id: 'x', child_id: child, date: '2026-09-15', reason, reason_label: label, note: 'SAMPLE note.' })
    ids[child] = r.body.absence.id
  }
  const dup = await call('POST', '/api/office/absences', { token: dana, body: { child_id: 'c_liam', date: '2026-09-15', reason: 'other' } })
  assert.deepEqual([dup.status, dup.body.code], [409, 'bad_state'])
  const post = (body) => call('POST', '/api/office/absences', { token: dana, body: { child_id: 'c_ben', date: '2026-09-16', reason: 'sick', ...body } })
  refused(await post({ reason: 'bored' }), 'reason')
  refused(await post({ date: '2026-02-30' }), 'date')
  refused(await post({ child_id: 'c_nobody' }), 'child_id')
  refused(await post({ note: 'x'.repeat(201) }), 'note')
  await signIn(door, 'c_ben', 'p_ben_mother')
  const came = await post({ date: '2026-09-14' })
  assert.equal(came.status, 409)
  assert.deepEqual(came.body, { error: 'Ben C. (SAMPLE) was signed in that day.', code: 'bad_state' })
  const tue = nl('08:00', '2026-09-15')
  const liam = async () => (await call('GET', '/api/door/children', { token: door, now: tue })).body.children.find((c) => c.id === 'c_liam')
  assert.deepEqual([(await liam()).status, (await liam()).status_label], ['away', 'Away today: Sick'])
  const today = await call('GET', '/api/staff/today', { token: await staffToken(PIN.marie, tue), now: tue })
  assert.deepEqual(today.body.away.find((a) => a.child.id === 'c_liam')?.reason_label, 'Sick')
  assert.deepEqual((await call('DELETE', `/api/office/absences/${ids.c_liam}`, { token: dana })).body, { ok: true })
  assert.equal((await call('DELETE', `/api/office/absences/${ids.c_liam}`, { token: dana })).status, 404)
  assert.equal((await liam()).status, 'not_in_yet')
  assert.equal((await call('POST', '/api/office/absences', { token: await staffToken(PIN.marie), body: {} })).status, 403)
})

// ---------- attendance ----------

test('attendance across midnight: Ava 10:30 PM Sep 14 to 1:15 AM Sep 15 is 90 minutes on Sep 14 and 75 on Sep 15, in the JSON and the CSV', async () => {
  const door = await doorToken(nl('22:00'))
  const inn = await signIn(door, 'c_ava', 'p_ava_mother', nl('22:30'))
  await signOut(door, 'c_ava', 'p_ava_father', nl('01:15', '2026-09-15'))
  const now = nl('01:20', '2026-09-15')
  const dana = await sup(now)
  const a = await call('GET', '/api/office/attendance?from=2026-09-14&to=2026-09-15', { token: dana, now })
  assert.equal(a.status, 200, JSON.stringify(a.body))
  assert.deepEqual(a.body.dates, ['2026-09-14', '2026-09-15'])
  const ava = a.body.children.find((c) => c.id === 'c_ava')
  assert.deepEqual(ava.days['2026-09-14'], { status: 'present', minutes: 90, open: false, absence: null,
    parts: [{ visit_id: inn.visit.id, in_label: '10:30 PM', out_label: '1:15 AM Sep 15', minutes: 90, continues: true, continued: false }] })
  assert.deepEqual(ava.days['2026-09-15'], { status: 'present', minutes: 75, open: false, absence: null,
    parts: [{ visit_id: inn.visit.id, in_label: '10:30 PM Sep 14', out_label: '1:15 AM', minutes: 75, continues: false, continued: true }] })
  assert.deepEqual([ava.name, ava.room_name, ava.minutes, ava.days_present, ava.days_away, ava.not_signed_out],
    ['Ava M. (SAMPLE)', 'Infant room', 165, 2, 0, 0])
  assert.deepEqual(a.body.totals, { minutes: 165, child_days: 2 })
  const csv = await call('GET', '/api/office/attendance.csv?from=2026-09-14&to=2026-09-15', { token: dana, now })
  const lines = csv.body.split('\r\n')
  assert.ok(lines.includes('2026-09-14,Ava M. (SAMPLE),Infant room,10:30 PM,Sarah M. (SAMPLE),1:15 AM Sep 15,Tom M. (SAMPLE),90,1.50,,Continues past midnight'), csv.body)
  assert.ok(lines.includes('2026-09-15,Ava M. (SAMPLE),Infant room,10:30 PM Sep 14,Sarah M. (SAMPLE),1:15 AM,Tom M. (SAMPLE),75,1.25,,Continued from the day before'), csv.body)
  assert.equal(lines.filter((l) => l.includes('Ava M.')).length, 2)
})

test('attendance: a normal day pair is one part of 450 minutes', async () => {
  const door = await doorToken()
  const inn = await signIn(door, 'c_ava', 'p_ava_mother')
  await signOut(door, 'c_ava', 'p_ava_gran', nl('16:30'))
  const now = nl('16:35')
  const dana = await sup(now)
  const a = await call('GET', '/api/office/attendance?from=2026-09-14&to=2026-09-14', { token: dana, now })
  const ava = a.body.children.find((c) => c.id === 'c_ava')
  assert.deepEqual(ava.days['2026-09-14'].parts, [{ visit_id: inn.visit.id, in_label: '9:00 AM', out_label: '4:30 PM', minutes: 450, continues: false, continued: false }])
  assert.deepEqual([ava.minutes, ava.days_present, a.body.totals], [450, 1, { minutes: 450, child_days: 1 }])
  assert.equal(a.body.children.find((c) => c.id === 'c_liam').days['2026-09-14'].status, 'missing')
  const csv = await call('GET', '/api/office/attendance.csv?from=2026-09-14&to=2026-09-14', { token: dana, now })
  assert.deepEqual(csv.body.split('\r\n').slice(0, 2), [ATT_HEADER, '2026-09-14,Ava M. (SAMPLE),Infant room,9:00 AM,Sarah M. (SAMPLE),4:30 PM,Joan M. (SAMPLE),450,7.50,,'])
})

test('attendance on the DST fall-back night: 11:00 PM Oct 31 to 3:00 AM Nov 1 counts its 300 real minutes', async () => {
  const door = await doorToken(nl('22:00', '2026-10-31'))
  await signIn(door, 'c_ava', 'p_ava_mother', nl('23:00', '2026-10-31'))
  await signOut(door, 'c_ava', 'p_ava_father', nl('03:00', '2026-11-01'))
  const now = nl('03:05', '2026-11-01')
  const a = await call('GET', '/api/office/attendance?from=2026-10-31&to=2026-11-01', { token: await sup(now), now })
  const ava = a.body.children.find((c) => c.id === 'c_ava')
  assert.deepEqual([ava.days['2026-10-31'].minutes, ava.days['2026-11-01'].minutes, ava.minutes], [60, 240, 300])
  assert.deepEqual([ava.days['2026-10-31'].status, ava.days['2026-10-31'].parts[0].out_label], ['present', '3:00 AM Nov 1'])
})

test('attendance: open visits are present with 0 minutes and Not signed out, in the JSON, the CSV and the summary', async () => {
  const fri = nl('09:00', '2026-09-11')
  const door = await doorToken(fri)
  const inn = await signIn(door, 'c_ava', 'p_ava_mother', fri)
  const now = nl('10:00')
  const dana = await sup(now)
  const q = '?from=2026-09-11&to=2026-09-14'
  const a = await call('GET', `/api/office/attendance${q}`, { token: dana, now })
  const ava = a.body.children.find((c) => c.id === 'c_ava')
  assert.deepEqual(ava.days['2026-09-11'], { status: 'present', minutes: 0, open: true, absence: null,
    parts: [{ visit_id: inn.visit.id, in_label: '9:00 AM', out_label: null, minutes: 0, continues: false, continued: false }] })
  assert.deepEqual(['2026-09-12', '2026-09-13', '2026-09-14'].map((d) => ava.days[d].status), ['not_booked', 'not_booked', 'missing'])
  assert.deepEqual([ava.minutes, ava.days_present, ava.not_signed_out, a.body.totals], [0, 1, 1, { minutes: 0, child_days: 1 }])
  const csv = await call('GET', `/api/office/attendance.csv${q}`, { token: dana, now })
  assert.ok(csv.body.split('\r\n').includes('2026-09-11,Ava M. (SAMPLE),Infant room,9:00 AM,Sarah M. (SAMPLE),,,0,0.00,,Not signed out'), csv.body)
  const summary = parseCsv((await call('GET', `/api/office/attendance-summary.csv${q}`, { token: dana, now })).body)
  assert.deepEqual(summary.find((r) => r[0] === 'Ava M. (SAMPLE)'), ['Ava M. (SAMPLE)', 'Infant room', '1', '0', '0.00', '0', '0', '0', '0', '0', '0', '1'])
  assert.equal(summary.at(-1)[11], '1')
})

test('attendance: missing, upcoming, not booked and away are told apart, and a child who starts later is not booked before then', async () => {
  const now = nl('17:00')
  const dana = await sup(now)
  await call('POST', '/api/office/absences', { token: dana, now, body: { child_id: 'c_liam', date: '2026-09-15', reason: 'sick', note: 'Fever.' } })
  const nell = await call('POST', '/api/office/children', { token: dana, now, body: { ...GOOD_CHILD, start_date: '2026-09-16', days: ['wed'] } })
  const a = await call('GET', '/api/office/attendance?from=2026-09-14&to=2026-09-20', { token: dana, now })
  const kid = (id) => a.body.children.find((c) => c.id === id)
  const statuses = (id) => a.body.dates.map((d) => kid(id).days[d].status)
  assert.deepEqual(statuses('c_liam'), ['missing', 'away', 'upcoming', 'upcoming', 'upcoming', 'not_booked', 'not_booked'])
  assert.deepEqual(kid('c_liam').days['2026-09-15'].absence, { id: kid('c_liam').days['2026-09-15'].absence.id, child_id: 'c_liam', date: '2026-09-15',
    reason: 'sick', reason_label: 'Sick', note: 'Fever.' })
  assert.deepEqual([kid('c_liam').days_away, kid('c_liam').away_by_reason], [1, { sick: 1, holiday: 0, appointment: 0, family: 0, other: 0 }])
  assert.deepEqual(statuses('c_isla'), ['not_booked', 'upcoming', 'not_booked', 'upcoming', 'not_booked', 'not_booked', 'not_booked'])
  assert.deepEqual(statuses('c_owen'), ['missing', 'not_booked', 'upcoming', 'not_booked', 'upcoming', 'not_booked', 'not_booked'])
  assert.deepEqual(statuses(nell.body.child.id), ['not_booked', 'not_booked', 'upcoming', 'not_booked', 'not_booked', 'not_booked', 'not_booked'])
  // Seen on Thursday Sep 17, Wednesday has passed: Liam's Sep 16 and 17 are missing, Sep 18 is still upcoming.
  const thu = nl('17:00', '2026-09-17')
  const later = await call('GET', '/api/office/attendance?from=2026-09-14&to=2026-09-20', { token: await sup(thu), now: thu })
  assert.deepEqual(later.body.dates.map((d) => later.body.children.find((c) => c.id === 'c_liam').days[d].status),
    ['missing', 'away', 'missing', 'missing', 'upcoming', 'not_booked', 'not_booked'])
  const csv = await call('GET', '/api/office/attendance.csv?from=2026-09-14&to=2026-09-20', { token: dana, now })
  assert.ok(csv.body.split('\r\n').includes('2026-09-15,Liam K. (SAMPLE),Infant room,,,,,0,0.00,Sick,Fever.'), csv.body)
  const summary = parseCsv((await call('GET', '/api/office/attendance-summary.csv?from=2026-09-14&to=2026-09-20', { token: dana, now })).body)
  assert.deepEqual(summary.find((r) => r[0] === 'Liam K. (SAMPLE)'), ['Liam K. (SAMPLE)', 'Infant room', '0', '0', '0.00', '1', '1', '0', '0', '0', '0', '0'])
  refused(await call('GET', '/api/office/attendance?from=2026-09-20&to=2026-09-14', { token: dana, now }), 'to')
  refused(await call('GET', '/api/office/attendance?from=2026-06-01&to=2026-09-01', { token: dana, now }), 'to')
  assert.equal((await call('GET', '/api/office/attendance?from=2026-06-02&to=2026-09-01', { token: dana, now })).status, 200, '92 days is allowed')
  refused(await call('GET', '/api/office/attendance?from=soon&to=2026-09-01', { token: dana, now }), 'from')
})

test('summary CSV: exact header, one row per registered child, and the Total row equals the column sums', async () => {
  const door = await doorToken(nl('08:00'))
  await signIn(door, 'c_ava', 'p_ava_mother', nl('09:00'))
  await signOut(door, 'c_ava', 'p_ava_father', nl('16:30'))
  await signIn(door, 'c_jack', 'p_jack_mother', nl('08:00'))
  await signOut(door, 'c_jack', 'p_jack_father', nl('12:00'))
  await signIn(door, 'c_liam', 'p_liam_mother', nl('09:05'))
  const now = nl('10:00', '2026-09-15')
  const dana = await sup(now)
  for (const [child, reason] of [['c_ben', 'holiday'], ['c_emma', 'sick']]) {
    await call('POST', '/api/office/absences', { token: dana, now, body: { child_id: child, date: '2026-09-15', reason } })
  }
  const r = await call('GET', '/api/office/attendance-summary.csv?from=2026-09-14&to=2026-09-15', { token: dana, now })
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8')
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="attendance-summary-2026-09-14-to-2026-09-15.csv"')
  const rows = parseCsv(r.body)
  assert.equal(rows[0].join(','), SUM_HEADER)
  const kids = rows.slice(1, -1)
  const total = rows.at(-1)
  assert.equal(kids.length, 19)
  assert.deepEqual(total.slice(0, 2), ['Total', ''])
  for (const i of [2, 3, 5, 6, 7, 8, 9, 10, 11]) {
    assert.equal(Number(total[i]), kids.reduce((s, row) => s + Number(row[i]), 0), `column ${rows[0][i]}`)
  }
  assert.equal(total[4], (Math.round((Number(total[3]) * 100) / 60) / 100).toFixed(2))
  assert.deepEqual(total, ['Total', '', '3', '690', '11.50', '2', '1', '1', '0', '0', '0', '1'])
})

test('CSV: CRLF lines, quoting of Smith, "Junior", the formula guard on =SUM(A1), and the filenames', async () => {
  const dana = await sup()
  const door = await doorToken()
  const odd = await call('POST', '/api/office/children', { token: dana, body: { ...GOOD_CHILD, name: '=SUM(A1) (SAMPLE)', home_room_id: 'r_preschool',
    dob: '2022-03-03', days: ['mon', 'tue', 'wed', 'thu', 'fri'] } })
  const kim = await call('POST', `/api/office/children/${odd.body.child.id}/people`, { token: dana, body: { name: 'Kim R. (SAMPLE)', relationship: 'Mother', may_pick_up: true } })
  const smith = await call('POST', '/api/office/children/c_ben/people', { token: dana, body: { name: 'Smith, "Junior" (SAMPLE)', relationship: 'Uncle', may_pick_up: true } })
  await signIn(door, odd.body.child.id, kim.body.person.id)
  await signIn(door, 'c_ben', smith.body.person.id, nl('09:10'))
  await signOut(door, 'c_ben', smith.body.person.id, nl('15:00'))
  await call('POST', '/api/office/absences', { token: dana, body: { child_id: 'c_liam', date: '2026-09-14', reason: 'other', note: '-5 with the wind chill, stayed home' } })
  const now = nl('15:05')
  const token = await sup(now)
  const r = await call('GET', '/api/office/attendance.csv?from=2026-09-14&to=2026-09-14', { token, now })
  assert.equal(r.status, 200)
  assert.equal(r.headers.get('content-type'), 'text/csv; charset=utf-8')
  assert.equal(r.headers.get('content-disposition'), 'attachment; filename="attendance-2026-09-14-to-2026-09-14.csv"')
  const text = r.body
  assert.ok(text.endsWith('\r\n'))
  assert.doesNotMatch(text, /[^\r]\n/, 'every line ends CRLF')
  const lines = text.split('\r\n')
  assert.equal(lines[0], ATT_HEADER)
  assert.ok(lines.includes("2026-09-14,'=SUM(A1) (SAMPLE),Preschool room,9:00 AM,Kim R. (SAMPLE),,,0,0.00,,Not signed out"), text)
  assert.ok(lines.includes('2026-09-14,Ben C. (SAMPLE),Preschool room,9:10 AM,"Smith, ""Junior"" (SAMPLE)",3:00 PM,"Smith, ""Junior"" (SAMPLE)",350,5.83,,'), text)
  assert.ok(lines.includes(`2026-09-14,Liam K. (SAMPLE),Infant room,,,,,0,0.00,Other,"'-5 with the wind chill, stayed home"`), text)
  assert.ok(!/(^|,)[=+\-@]/m.test(text), 'no cell starts with a formula character')
  const s = await call('GET', '/api/office/attendance-summary.csv?from=2026-09-14&to=2026-09-14', { token, now })
  assert.ok(s.body.split('\r\n').some((l) => l.startsWith("'=SUM(A1) (SAMPLE),Preschool room,1,0,0.00,")), s.body)
  assert.equal((await call('GET', '/api/office/attendance.csv?from=2026-09-14&to=2026-09-14', { token: await staffToken(PIN.marie, now), now })).status, 403)
})

// ---------- fixing a time, the register ----------

test('fix a time: reason required, out before in and future refused, the edit is listed with who, why and the old time, and the CSV uses it', async () => {
  const door = await doorToken()
  const { visit } = await signIn(door, 'c_ava', 'p_ava_mother')
  const put = async (body, now) => call('PUT', `/api/office/visits/${visit.id}`, { token: await sup(now), body, now })
  const at5 = nl('17:00')
  refused(await put({ out_time: '16:30', reason: '' }, at5), 'reason')
  refused(await put({ out_time: '16:30', reason: 'ok' }, at5), 'reason')
  refused(await put({ out_time: '08:30', reason: 'Mother forgot to sign out.' }, at5), 'out_time')
  refused(await put({ out_time: '16:30', reason: 'Mother forgot to sign out.' }, nl('10:00')), 'out_time')
  refused(await put({ in_time: '8:45', reason: 'Arrived earlier.' }, at5), 'in_time')
  refused(await put({ in_date: '2026-09-31', reason: 'Arrived earlier.' }, at5), 'in_date')
  refused(await put({ in_date: '2026-09-15', reason: 'Arrived earlier.' }, at5), 'in_time')
  refused(await put({ reason: 'Nothing to change.' }, at5), 'out_time')
  const edu = await call('PUT', `/api/office/visits/${visit.id}`, { token: await staffToken(PIN.marie, at5), body: { out_time: '16:30', reason: 'Forgot.' }, now: at5 })
  assert.equal(edu.status, 403)
  const fixed = await put({ out_time: '16:30', reason: 'Mother forgot to sign out.' }, at5)
  assert.equal(fixed.status, 200, JSON.stringify(fixed.body))
  const v = fixed.body.visit
  assert.deepEqual([v.in_at, v.out_at, v.out_label, v.out_by, v.edited], [T9, nl('16:30'), '4:30 PM', null, true])
  assert.deepEqual(v.edits, [{ at_label: 'Mon Sep 14, 5:00 PM', by: 'Dana K. (SAMPLE)', reason: 'Mother forgot to sign out.',
    what: 'Out not signed out changed to 4:30 PM Mon Sep 14' }])
  const d = await call('GET', '/api/door/children/c_ava', { token: door, now: at5 })
  assert.deepEqual([d.body.child.status, d.body.child.status_label], ['gone_home', 'Gone home at 4:30 PM'])
  const marie = await staffToken(PIN.marie, at5)
  assert.equal((await call('GET', '/api/staff/today', { token: marie, now: at5 })).body.rooms[0].meter.children, 0, 'closing the visit closes its placement')
  const again = await put({ in_time: '08:45', reason: 'Arrived before the tablet was set up.' }, nl('17:05'))
  assert.equal(again.body.visit.edits.length, 2)
  assert.deepEqual(again.body.visit.edits[1], { at_label: 'Mon Sep 14, 5:05 PM', by: 'Dana K. (SAMPLE)', reason: 'Arrived before the tablet was set up.',
    what: 'In 9:00 AM Mon Sep 14 changed to 8:45 AM Mon Sep 14' })
  const csv = await call('GET', '/api/office/attendance.csv?from=2026-09-14&to=2026-09-14', { token: await sup(nl('17:06')), now: nl('17:06') })
  assert.ok(csv.body.split('\r\n').includes('2026-09-14,Ava M. (SAMPLE),Infant room,8:45 AM,Sarah M. (SAMPLE),4:30 PM,,465,7.75,,'), csv.body)
  await signIn(door, 'c_ava', 'p_ava_mother', nl('17:10'))
  await signOut(door, 'c_ava', 'p_ava_mother', nl('17:20'))
  refused(await put({ out_time: '17:15', reason: 'Trying an overlap.' }, nl('17:30')), 'in_time')
  assert.equal((await call('PUT', '/api/office/visits/v_nobody', { token: await sup(at5), body: { out_time: '16:30', reason: 'Nothing.' }, now: at5 })).status, 404)
})

test('register: rows for one homeroom with dob, emergency contact, both signatures, moves, recorded-by and edited', async () => {
  const door = await doorToken(nl('08:00'))
  const marie = await staffToken(PIN.marie, nl('08:00'))
  const kevin = await staffToken(PIN.kevin, nl('08:00'))
  await signIn(door, 'c_ava', 'p_ava_mother', nl('08:05'))
  const liam = await call('POST', '/api/staff/children/c_liam/in', { token: kevin, body: { person_id: 'p_liam_father' }, now: nl('08:10') })
  await signIn(door, 'c_jack', 'p_jack_mother', nl('08:15'))
  const move = (token, child, room, at) => call('POST', `/api/staff/children/${child}/move`, { token, body: { room_id: room }, now: at })
  for (const [child, room, at] of [['c_ava', 'r_toddler', '10:00'], ['c_ava', 'r_infant', '10:40'], ['c_jack', 'r_infant', '11:00'], ['c_jack', 'r_toddler', '11:30']]) {
    assert.equal((await move(marie, child, room, nl(at))).status, 200)
  }
  await signOut(door, 'c_ava', 'p_ava_father', nl('16:30'))
  const now = nl('17:00')
  const dana = await sup(now)
  const fix = await call('PUT', `/api/office/visits/${liam.body.visit.id}`, { token: dana, now, body: { in_time: '08:00', reason: 'Arrived before it was written down.' } })
  assert.equal(fix.status, 200, JSON.stringify(fix.body))
  const reg = (room, date = '2026-09-14') => call('GET', `/api/office/register?date=${date}&room_id=${room}`, { token: dana, now })
  const r = await reg('r_infant')
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.deepEqual([r.body.centre_name, r.body.sample, r.body.date, r.body.long_label, r.body.room, r.body.kept_note],
    ['SAMPLE Little Harbour Child Care (demo)', true, '2026-09-14', 'Monday, September 14', { id: 'r_infant', name: 'Infant room' },
      'Daily registers are kept for at least 7 years (NLR 39/17 s.45(3)).'])
  assert.deepEqual(r.body.rows.map((row) => row.child.name), ['Ava M. (SAMPLE)', 'Jack W. (SAMPLE)', 'Liam K. (SAMPLE)'])
  const [ava, jack, liamRow] = r.body.rows
  assert.deepEqual(ava.child, { name: 'Ava M. (SAMPLE)', dob: '2025-03-02' })
  assert.deepEqual(ava.emergency, { name: 'Sarah M. (SAMPLE)', relationship: 'Mother', phone: '709-555-0101' })
  assert.deepEqual([ava.visits.length, ava.visits[0].in_signature_svg, ava.visits[0].out_signature_svg], [1, SIG_SVG, SIG_SVG])
  assert.deepEqual([ava.visits[0].in_label, ava.visits[0].out_label, ava.visits[0].out_by.name], ['8:05 AM', '4:30 PM', 'Tom M. (SAMPLE)'])
  assert.deepEqual(ava.moves, [{ label: 'Went to Toddler room 10:00 AM, back 10:40 AM' }])
  assert.deepEqual(jack.moves, [{ label: 'Came from Toddler room 11:00 AM, left 11:30 AM' }])
  const lv = liamRow.visits[0]
  assert.deepEqual([lv.in_recorded_by, lv.awaiting_signature, lv.in_signature_svg, lv.edited, lv.edits[0].reason, lv.in_label],
    [{ id: 's_kevin', initials: 'KO' }, 'in', null, true, 'Arrived before it was written down.', '8:00 AM'])
  const toddler = await reg('r_toddler')
  assert.deepEqual(toddler.body.rows.map((row) => [row.child.name, row.moves]), [
    ['Ava M. (SAMPLE)', [{ label: 'Came from Infant room 10:00 AM, left 10:40 AM' }]],
    ['Jack W. (SAMPLE)', [{ label: 'Went to Infant room 11:00 AM, back 11:30 AM' }]]])
  assert.deepEqual((await reg('r_preschool')).body.rows, [])
  assert.deepEqual((await reg('r_infant', '2026-09-13')).body.rows, [])
  refused(await reg('r_attic'), 'room_id')
  refused(await reg('r_infant', 'yesterday'), 'date')
})

// ---------- follow-ups ----------

test('follow-ups: a signature owed for a child who went home is listed, one 15 dates old is not, signing removes it; open visits from before today oldest first, not today\'s', async () => {
  const door = await doorToken(nl('07:00', '2026-08-31'))
  const record = async (child, person, date, hhmm) => {
    const now = nl(hhmm, date)
    const r = await call('POST', `/api/staff/children/${child}/in`, { token: await staffToken(PIN.marie, now), body: { person_id: person }, now })
    assert.equal(r.status, 201, JSON.stringify(r.body))
    return r.body.visit
  }
  // Mon Aug 31 is the 15th date back from Mon Sep 14; Tue Sep 1 is the 14th.
  const old = await record('c_liam', 'p_liam_mother', '2026-08-31', '09:00')
  await signOut(door, 'c_liam', 'p_liam_father', nl('16:00', '2026-08-31'))
  const edge = await record('c_nora', 'p_nora_father', '2026-09-01', '09:00')
  await signOut(door, 'c_nora', 'p_nora_mother', nl('16:00', '2026-09-01'))
  const ruby = await signIn(door, 'c_ruby', 'p_ruby_mother', nl('08:05', '2026-09-08'))
  const finn = await signIn(door, 'c_finn', 'p_finn_father', nl('08:30', '2026-09-10'))
  const ava = await record('c_ava', 'p_ava_mother', '2026-09-14', '08:05')
  await signOut(door, 'c_ava', 'p_ava_father', nl('16:30'))
  await signIn(door, 'c_ben', 'p_ben_mother', nl('09:00'))
  const now = nl('17:00')
  const dana = await sup(now)
  const f = await call('GET', '/api/office/follow-ups', { token: dana, now })
  assert.equal(f.status, 200, JSON.stringify(f.body))
  const marie = { id: 's_marie', initials: 'MT' }
  assert.deepEqual(f.body.pending_signatures, [
    { visit_id: ava.id, child: { id: 'c_ava', name: 'Ava M. (SAMPLE)' }, which: 'in', date: '2026-09-14', date_label: 'Mon Sep 14',
      time_label: '8:05 AM', person: { id: 'p_ava_mother', name: 'Sarah M. (SAMPLE)' }, recorded_by: marie },
    { visit_id: edge.id, child: { id: 'c_nora', name: 'Nora B. (SAMPLE)' }, which: 'in', date: '2026-09-01', date_label: 'Tue Sep 1',
      time_label: '9:00 AM', person: { id: 'p_nora_father', name: 'Chris B. (SAMPLE)' }, recorded_by: marie },
  ], 'Ava went home and still owes a signature; Nora on the 14th date is listed')
  assert.ok(!JSON.stringify(f.body).includes(old.id), 'a signature owed 15 dates ago is not a follow-up')
  assert.deepEqual(f.body.not_signed_out, [
    { visit_id: ruby.visit.id, child: { id: 'c_ruby', name: 'Ruby E. (SAMPLE)' }, date: '2026-09-08', date_label: 'Tue Sep 8', in_label: '8:05 AM',
      in_by: { id: 'p_ruby_mother', name: 'Diane E. (SAMPLE)' } },
    { visit_id: finn.visit.id, child: { id: 'c_finn', name: 'Finn D. (SAMPLE)' }, date: '2026-09-10', date_label: 'Thu Sep 10', in_label: '8:30 AM',
      in_by: { id: 'p_finn_father', name: 'Brian D. (SAMPLE)' } },
  ], 'open visits from before today, oldest first; Ben, signed in today, is not one')
  const signed = await call('POST', `/api/door/visits/${ava.id}/sign`, { token: door, body: { which: 'in', person_id: 'p_ava_mother', signature: SIG }, now: nl('17:05') })
  assert.equal(signed.status, 200, JSON.stringify(signed.body))
  const after = await call('GET', '/api/office/follow-ups', { token: dana, now: nl('17:06') })
  assert.deepEqual(after.body.pending_signatures.map((p) => p.visit_id), [edge.id], 'signing at the door removes it')
  assert.equal((await call('GET', '/api/office/follow-ups', { token: await staffToken(PIN.marie, now), now })).status, 403)
})

// ---------- the demo seed ----------

test('demo seed: 15 weekdays of attendance with absences, one open visit and a signature waiting; today infant at the limit, toddler over, preschool ok; a live note link', async () => {
  const now = nl('10:00')
  const bad = await call('POST', '/api/test/seed', { body: { scenario: 'party' }, now })
  refused(bad, 'scenario')
  const seed = await call('POST', '/api/test/seed', { body: { scenario: 'demo' }, now })
  assert.equal(seed.status, 200, JSON.stringify(seed.body))
  assert.equal(seed.body.today, '2026-09-14')
  assert.match(seed.body.note_url, /^\/note\/\?t=[A-Za-z0-9_-]{43}$/)
  const dana = await sup(now)
  const a = await call('GET', '/api/office/attendance?from=2026-08-24&to=2026-09-13', { token: dana, now })
  const weekdays = a.body.dates.filter((d) => ![0, 6].includes(new Date(`${d}T12:00:00Z`).getUTCDay()))
  assert.equal(weekdays.length, 15)
  for (const d of a.body.dates) {
    const present = a.body.children.filter((c) => c.days[d].status === 'present').length
    if (weekdays.includes(d)) assert.ok(present >= 15, `${d}: ${present} children present`)
    else assert.equal(present, 0, `${d} is a weekend`)
  }
  assert.ok(a.body.totals.minutes > 15 * 15 * 360)
  const away = a.body.children.flatMap((c) => Object.values(c.days).filter((d) => d.status === 'away').map((d) => d.absence.reason))
  assert.deepEqual(away.sort(), ['appointment', 'family', 'holiday', 'sick'])
  assert.equal(a.body.children.reduce((s, c) => s + c.not_signed_out, 0), 1)
  const today = await call('GET', '/api/staff/today', { token: await staffToken(PIN.marie, now), now })
  const meters = Object.fromEntries(today.body.rooms.map((r) => [r.room.id, r.meter]))
  assert.deepEqual([meters.r_infant.state, meters.r_infant.children, meters.r_infant.staff], ['at_limit', 3, 1])
  assert.deepEqual([meters.r_toddler.state, meters.r_toddler.children, meters.r_toddler.staff, meters.r_toddler.needs_staff], ['over', 6, 1, 1])
  assert.deepEqual([meters.r_preschool.state, meters.r_preschool.children, meters.r_preschool.staff], ['ok', 6, 1])
  const toddlers = today.body.rooms.find((r) => r.room.id === 'r_toddler').children.map((c) => c.id).sort()
  assert.deepEqual(toddlers, ['c_chloe', 'c_emma', 'c_finn', 'c_jack', 'c_leo', 'c_maya'], 'all six toddlers, nobody moved out of their room')
  const door = await doorToken(now)
  const list = (await call('GET', '/api/door/children', { token: door, now })).body.children
  assert.ok(list.some((c) => c.awaiting_signature), 'a staff-recorded drop-off is waiting for a signature')
  const token = seed.body.note_url.split('t=')[1]
  const note = await call('GET', `/api/note/${token}`, { now })
  assert.equal(note.status, 200)
  assert.equal(note.body.child.name, 'Ava M. (SAMPLE)')
  assert.ok(note.body.meals.length && note.body.toileting.length && note.body.activities.length)
  assert.equal((await call('GET', '/api/office/attendance?from=2026-09-14&to=2026-09-14', { token: dana, now })).body.totals.child_days, 15)
})
