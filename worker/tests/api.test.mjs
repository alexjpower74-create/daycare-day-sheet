// M1 API suite against a real local Worker in TEST_MODE (tests/run.mjs starts it). Every test starts from a fresh SAMPLE centre.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { beforeEach, test } from 'node:test'
import { SAMPLE_CHILDREN, SAMPLE_ROOMS } from '../src/sample.js'
import {
  addLog, call, d1, doorToken, meterOf, nl, PIN, presence, reset, SIG, SIG_SVG, signIn, signOut, staffToken, T9,
} from './api-helpers.mjs'

beforeEach(reset)

const CENTRE = 'SAMPLE Little Harbour Child Care (demo)'
const PICKUP_REFUSED = (who) => `${who} is not on the pickup list for Ava M. (SAMPLE). Get the supervisor. Do not let Ava M. (SAMPLE) leave.`

// ---------- public, PINs and roles ----------

test('info: shape and Newfoundland time from X-Test-Now', async () => {
  const r = await call('GET', '/api/info')
  assert.equal(r.status, 200)
  assert.deepEqual(r.body, {
    centre_name: CENTRE, sample: true, phone: '709-555-0100', zone: 'America/St_Johns', today: '2026-09-14',
    date_label: 'Mon Sep 14', long_label: 'Monday, September 14', now: '2026-09-14T11:30:00.000Z', now_local: '09:00',
    time_label: '9:00 AM',
  })
  const late = await call('GET', '/api/info', { now: nl('23:59:59') })
  assert.equal(late.body.today, '2026-09-14')
  assert.equal(late.body.time_label, '11:59 PM')
  const midnight = await call('GET', '/api/info', { now: nl('00:00', '2026-09-15') })
  assert.equal(midnight.body.today, '2026-09-15')
  assert.equal(midnight.body.long_label, 'Tuesday, September 15')
})

test('sign-in: wrong PIN 401 field pin; right PIN gives a 43-character token for 12 hours, never the hash', async () => {
  for (const pin of ['0000', '12', 'abcd', 1593, '']) {
    const r = await call('POST', '/api/signin', { body: { pin } })
    assert.equal(r.status, 401, `pin ${JSON.stringify(pin)}`)
    assert.deepEqual(r.body, { error: 'That PIN is not right.', code: 'unauthorized', field: 'pin' })
  }
  const r = await call('POST', '/api/signin', { body: { pin: PIN.marie } })
  assert.equal(r.status, 200)
  assert.match(r.body.token, /^[A-Za-z0-9_-]{43}$/)
  assert.deepEqual({ ...r.body, token: 'x' }, {
    token: 'x', role: 'educator', staff: { id: 's_marie', name: 'Marie T. (SAMPLE)', initials: 'MT' },
    expires_at: '2026-09-14T23:30:00.000Z',
  })
  const dana = await call('POST', '/api/signin', { body: { pin: PIN.dana } })
  assert.equal(dana.body.role, 'supervisor')
  // 12 hours later the token has run out.
  const later = await call('GET', '/api/staff/today', { token: r.body.token, now: '2026-09-14T23:30:00.000Z' })
  assert.equal(later.status, 401)
})

test('roles: door token on a staff route 403, staff on a door route 403, educator on an office route 403, no token 401', async () => {
  const door = await doorToken()
  const marie = await staffToken(PIN.marie)
  const dana = await staffToken(PIN.dana)
  const expect = async (method, url, token, status, code, body) => {
    const r = await call(method, url, { token, body })
    assert.equal(r.status, status, `${method} ${url}: ${JSON.stringify(r.body)}`)
    assert.equal(r.body.code, code, `${method} ${url}`)
  }
  await expect('GET', '/api/staff/today', door, 403, 'forbidden')
  await expect('POST', '/api/staff/children/c_ava/logs', door, 403, 'forbidden', { kind: 'mood', value: 'happy' })
  await expect('GET', '/api/door/children', marie, 403, 'forbidden')
  await expect('GET', '/api/door/children', dana, 403, 'forbidden')
  await expect('GET', '/api/office/ratios', marie, 403, 'forbidden')
  await expect('PUT', '/api/office/ratios/infant', marie, 403, 'forbidden', { children_per_caregiver: 1 })
  await expect('GET', '/api/office/ratios', door, 403, 'forbidden')
  await expect('GET', '/api/staff/today', undefined, 401, 'unauthorized')
  await expect('GET', '/api/door/children', undefined, 401, 'unauthorized')
  await expect('GET', '/api/office/ratios', undefined, 401, 'unauthorized')
  await expect('GET', '/api/staff/today', 'not-a-real-token', 401, 'unauthorized')
  await expect('GET', '/api/staff/today', dana, 200, undefined)
  await expect('GET', '/api/staff/today', marie, 200, undefined)
  // Signing out kills the token.
  assert.deepEqual((await call('POST', '/api/signout', { token: marie })).body, { ok: true })
  await expect('GET', '/api/staff/today', marie, 401, 'unauthorized')
  assert.equal((await call('POST', '/api/signout', { token: door })).status, 200)
  await expect('GET', '/api/door/children', door, 401, 'unauthorized')
})

test('door unlock: the supervisor PIN gives a 30-day door token; an educator PIN is 403; a wrong PIN is 401', async () => {
  const edu = await call('POST', '/api/door/unlock', { body: { pin: PIN.kevin } })
  assert.equal(edu.status, 403)
  assert.deepEqual(edu.body, { error: 'Only the supervisor can set up this tablet.', code: 'forbidden' })
  const wrong = await call('POST', '/api/door/unlock', { body: { pin: '9999' } })
  assert.equal(wrong.status, 401)
  assert.deepEqual(wrong.body, { error: 'That PIN is not right.', code: 'unauthorized', field: 'pin' })
  const ok = await call('POST', '/api/door/unlock', { body: { pin: PIN.dana } })
  assert.equal(ok.status, 200)
  assert.match(ok.body.token, /^[A-Za-z0-9_-]{43}$/)
  assert.equal(ok.body.role, 'door')
  assert.equal(ok.body.expires_at, '2026-10-14T11:30:00.000Z')
  assert.deepEqual(Object.keys(ok.body).sort(), ['expires_at', 'role', 'token'])
})

test('PIN guard: 5 wrong PINs from one IP, then 429 even for the right PIN on both routes; another IP still works', async () => {
  const ip = 'kiosk-a'
  for (let i = 1; i <= 5; i++) {
    const r = await call('POST', i % 2 ? '/api/signin' : '/api/door/unlock', { body: { pin: `000${i}` }, ip })
    assert.equal(r.status, 401, `wrong PIN ${i}`)
  }
  const sixth = await call('POST', '/api/signin', { body: { pin: '0006' }, ip })
  assert.equal(sixth.status, 429)
  assert.deepEqual(sixth.body, { error: 'Too many tries. Wait 15 minutes, then try again.', code: 'rate_limited' })
  assert.equal((await call('POST', '/api/signin', { body: { pin: PIN.marie }, ip })).status, 429, 'the right PIN is refused too')
  assert.equal((await call('POST', '/api/door/unlock', { body: { pin: PIN.dana }, ip })).status, 429)
  assert.equal((await call('POST', '/api/signin', { body: { pin: PIN.marie }, ip, now: nl('09:14') })).status, 429)
  assert.equal((await call('POST', '/api/signin', { body: { pin: PIN.marie }, ip: 'kiosk-b' })).status, 200)
  // After the window the first tries have aged out.
  assert.equal((await call('POST', '/api/signin', { body: { pin: PIN.marie }, ip, now: nl('09:15:01') })).status, 200)
})

// ---------- the door ----------

test('door children on Mon Sep 14: Isla not booked, everyone else not in yet, sorted by room then name, no phones', async () => {
  const door = await doorToken()
  const r = await call('GET', '/api/door/children', { token: door })
  assert.equal(r.status, 200)
  assert.equal(r.body.date, '2026-09-14')
  assert.equal(r.body.date_label, 'Mon Sep 14')
  assert.equal(r.body.now_local, '09:00')
  assert.equal(r.body.centre_name, CENTRE)
  assert.equal(r.body.sample, true)
  const sort = (ch) => SAMPLE_ROOMS.find((x) => x.id === ch.home_room_id).sort
  const expected = [...SAMPLE_CHILDREN].sort((a, b) => sort(a) - sort(b) || a.name.localeCompare(b.name)).map((c) => c.id)
  assert.deepEqual(r.body.children.map((c) => c.id), expected)
  for (const ch of r.body.children) {
    const want = ch.id === 'c_isla' ? ['not_booked', 'Not booked today'] : ['not_in_yet', 'Not in yet']
    assert.deepEqual([ch.status, ch.status_label], want, ch.id)
    assert.equal(ch.awaiting_signature, false)
    assert.ok(ch.name.endsWith(' (SAMPLE)'))
  }
  assert.deepEqual(r.body.children[0], { id: 'c_ava', name: 'Ava M. (SAMPLE)', initials: 'AM', room_id: 'r_infant',
    room_name: 'Infant room', status: 'not_in_yet', status_label: 'Not in yet', awaiting_signature: false })
  assert.deepEqual(r.body.rooms.map((m) => [m.room_id, m.state, m.label]), [
    ['r_infant', 'ok', 'No children in the room.'], ['r_toddler', 'ok', 'No children in the room.'],
    ['r_preschool', 'ok', 'No children in the room.']])
  assert.doesNotMatch(JSON.stringify(r.body), /709-555|phone/)
  // Isla is booked on Tuesday.
  const tue = await call('GET', '/api/door/children', { token: door, now: nl('09:00', '2026-09-15') })
  assert.equal(tue.body.children.find((c) => c.id === 'c_isla').status, 'not_in_yet')
  assert.equal(tue.body.children.find((c) => c.id === 'c_owen').status, 'not_booked')
  const detail = await call('GET', '/api/door/children/c_ava', { token: door })
  assert.deepEqual(detail.body, {
    child: { id: 'c_ava', name: 'Ava M. (SAMPLE)', initials: 'AM', room_name: 'Infant room', status: 'not_in_yet', status_label: 'Not in yet' },
    visit: null,
    people: [
      { id: 'p_ava_mother', name: 'Sarah M. (SAMPLE)', relationship: 'Mother', may_pick_up: true },
      { id: 'p_ava_father', name: 'Tom M. (SAMPLE)', relationship: 'Father', may_pick_up: true },
      { id: 'p_ava_gran', name: 'Joan M. (SAMPLE)', relationship: 'Grandmother', may_pick_up: true },
      { id: 'p_ava_neighbour', name: 'Rick D. (SAMPLE)', relationship: 'Neighbour', may_pick_up: false },
    ],
    pending: [],
  })
  assert.equal((await call('GET', '/api/door/children/c_nobody', { token: door })).status, 404)
})

test('ratio moment: at the limit with the third infant, over with the fourth in that very answer; staff/today agrees; a second educator and leaving change it', async () => {
  const door = await doorToken()
  const marie = await staffToken(PIN.marie)
  const kevin = await staffToken(PIN.kevin)
  await presence(marie, 'r_infant')
  const ava = await signIn(door, 'c_ava', 'p_ava_mother')
  assert.equal(ava.meter.state, 'ok')
  assert.equal(ava.meter.label, '1 child, 1 staff. Room for 2 more.')
  const liam = await signIn(door, 'c_liam', 'p_liam_mother')
  assert.equal(liam.meter.label, '2 children, 1 staff. Room for 1 more.')
  const nora = await signIn(door, 'c_nora', 'p_nora_father')
  assert.deepEqual([nora.meter.state, nora.meter.state_label, nora.meter.children, nora.meter.needs_staff, nora.meter.label],
    ['at_limit', 'At the limit', 3, 0, '3 children, 1 staff. At the limit.'])
  // The fourth infant is signed in (never refused), and that answer is already red.
  const owen = await signIn(door, 'c_owen', 'p_owen_mother')
  const over = {
    room_id: 'r_infant', room_name: 'Infant room', age_group: 'infant', children: 4, staff: 1, children_per_caregiver: 3,
    max_children: 6, allowed: 3, state: 'over', state_label: 'Over', needs_staff: 1,
    label: '4 children, 1 staff. Over the ratio: 1 staff can have 3. Needs 1 more staff.',
  }
  assert.deepEqual(owen.meter, over)
  assert.equal(owen.visit.child_id, 'c_owen')
  const today = await call('GET', '/api/staff/today', { token: marie })
  const infant = today.body.rooms.find((r) => r.room.id === 'r_infant')
  assert.deepEqual(infant.meter, over)
  assert.deepEqual(infant.children.map((c) => c.id), ['c_ava', 'c_liam', 'c_nora', 'c_owen'])
  assert.deepEqual(infant.staff, [{ id: 's_marie', name: 'Marie T. (SAMPLE)', initials: 'MT', since_label: '9:00 AM' }])
  assert.deepEqual(meterOf((await call('GET', '/api/door/children', { token: door })).body.rooms, 'r_infant'), over)
  // Kevin comes in: 2 staff can have 6, so 4 is fine again.
  const two = meterOf((await presence(kevin, 'r_infant', nl('09:05'))).rooms, 'r_infant')
  assert.deepEqual([two.state, two.staff, two.allowed, two.needs_staff, two.label],
    ['ok', 2, 6, 0, '4 children, 2 staff. Room for 2 more.'])
  // Marie leaves every room: back to over.
  const left = await presence(marie, null, nl('09:10'))
  assert.deepEqual(meterOf(left.rooms, 'r_infant'), { ...over, staff: 1 })
  const me = await call('GET', '/api/staff/today', { token: marie, now: nl('09:10') })
  assert.equal(me.body.me.room_id, null)
  assert.deepEqual(me.body.me.staff, { id: 's_marie', name: 'Marie T. (SAMPLE)', initials: 'MT', role: 'educator', active: true })
})

test('the move: one child from the infant room to the toddler room changes both meters in one answer', async () => {
  const door = await doorToken()
  const marie = await staffToken(PIN.marie)
  const kevin = await staffToken(PIN.kevin)
  await presence(marie, 'r_infant')
  await presence(kevin, 'r_toddler')
  await signIn(door, 'c_ava', 'p_ava_mother')
  await signIn(door, 'c_liam', 'p_liam_mother')
  await signIn(door, 'c_jack', 'p_jack_mother')
  const r = await call('POST', '/api/staff/children/c_ava/move', { token: marie, body: { room_id: 'r_toddler' }, now: nl('10:00') })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.message, 'Ava M. (SAMPLE) moved to Toddler room.')
  assert.deepEqual([r.body.from.room_id, r.body.from.children, r.body.from.label], ['r_infant', 1, '1 child, 1 staff. Room for 2 more.'])
  assert.deepEqual([r.body.to.room_id, r.body.to.children, r.body.to.label], ['r_toddler', 2, '2 children, 1 staff. Room for 3 more.'])
  const today = await call('GET', '/api/staff/today', { token: marie, now: nl('10:00') })
  assert.deepEqual(today.body.rooms.find((x) => x.room.id === 'r_toddler').children.map((c) => c.id), ['c_ava', 'c_jack'])
  const child = await call('GET', '/api/staff/children/c_ava', { token: marie, now: nl('10:00') })
  assert.deepEqual([child.body.child.room_id, child.body.child.room_name, child.body.child.home_room_id], ['r_toddler', 'Toddler room', 'r_infant'])
  const same = await call('POST', '/api/staff/children/c_ava/move', { token: marie, body: { room_id: 'r_toddler' } })
  assert.deepEqual([same.status, same.body.code, same.body.field], [400, 'bad_request', 'room_id'])
  const nowhere = await call('POST', '/api/staff/children/c_ava/move', { token: marie, body: { room_id: 'r_attic' } })
  assert.deepEqual([nowhere.status, nowhere.body.field], [400, 'room_id'])
  const out = await call('POST', '/api/staff/children/c_ben/move', { token: marie, body: { room_id: 'r_toddler' } })
  assert.deepEqual([out.status, out.body.code], [409, 'not_in'])
  // Signing out closes the placement in the room the child is in now.
  const gone = await signOut(door, 'c_ava', 'p_ava_father', nl('11:00'))
  assert.equal(gone.meter.room_id, 'r_toddler')
  assert.equal(gone.meter.children, 1)
})

test('no staff with one child is over; a cleared ratio number is unset', async () => {
  const door = await doorToken()
  const one = await signIn(door, 'c_ava', 'p_ava_mother')
  assert.deepEqual([one.meter.state, one.meter.staff, one.meter.needs_staff, one.meter.label],
    ['over', 0, 1, '1 child with no staff in the room.'])
  const dana = await staffToken(PIN.dana)
  const marie = await staffToken(PIN.marie)
  await presence(marie, 'r_infant')
  const cleared = await call('PUT', '/api/office/ratios/infant', { token: dana, body: { children_per_caregiver: null } })
  assert.equal(cleared.status, 200, JSON.stringify(cleared.body))
  assert.deepEqual(cleared.body.rule, { age_group: 'infant', label: 'Infant (birth up to 2 years)', children_per_caregiver: null,
    max_children: 6, default_children_per_caregiver: 3, default_max_children: 6, citation: 'NLR 39/17 s.54(1)', edited: true })
  const liam = await signIn(door, 'c_liam', 'p_liam_mother')
  assert.deepEqual([liam.meter.state, liam.meter.state_label, liam.meter.allowed, liam.meter.needs_staff, liam.meter.label],
    ['unset', 'Not set', null, null, 'Ratio not set. A supervisor fills it in under Office, Rooms and ratios.'])
  const bad = await call('PUT', '/api/office/ratios/infant', { token: dana, body: { max_children: 61 } })
  assert.deepEqual([bad.status, bad.body.field], [400, 'max_children'])
})

test('authorized pick-up: the neighbour, another child\'s parent and an unknown id are refused and Ava stays in; the grandmother signs her out', async () => {
  const door = await doorToken()
  await signIn(door, 'c_ava', 'p_ava_mother', nl('08:05'))
  const stillIn = async () => {
    const d = await call('GET', '/api/door/children/c_ava', { token: door })
    assert.deepEqual([d.body.child.status, d.body.child.status_label], ['in', 'In since 8:05 AM'])
    assert.equal(d.body.visit.out_at, null)
  }
  const out = (person) => call('POST', '/api/door/children/c_ava/out', { token: door, body: { person_id: person, signature: SIG } })
  const neighbour = await out('p_ava_neighbour')
  assert.equal(neighbour.status, 403)
  assert.deepEqual(neighbour.body, { error: PICKUP_REFUSED('Rick D. (SAMPLE)'), code: 'not_on_list' })
  await stillIn()
  const other = await out('p_liam_mother')
  assert.equal(other.status, 403)
  assert.equal(other.body.code, 'not_on_list')
  await stillIn()
  const unknown = await out('p_nobody')
  assert.equal(unknown.status, 403)
  assert.deepEqual(unknown.body, { error: PICKUP_REFUSED('That person'), code: 'not_on_list' })
  const missing = await call('POST', '/api/door/children/c_ava/out', { token: door, body: { signature: SIG } })
  assert.deepEqual([missing.status, missing.body.error], [403, PICKUP_REFUSED('That person')])
  // Staff recording a pick-up follow the same rule.
  const marie = await staffToken(PIN.marie)
  const staffOut = await call('POST', '/api/staff/children/c_ava/out', { token: marie, body: { person_id: 'p_ava_neighbour' } })
  assert.deepEqual([staffOut.status, staffOut.body.code], [403, 'not_on_list'])
  await stillIn()
  const gran = await out('p_ava_gran')
  assert.equal(gran.status, 200, JSON.stringify(gran.body))
  assert.equal(gran.body.message, 'Ava M. (SAMPLE) signed out at 9:00 AM by Joan M. (SAMPLE).')
  assert.deepEqual(gran.body.visit.out_by, { id: 'p_ava_gran', name: 'Joan M. (SAMPLE)', relationship: 'Grandmother' })
  assert.equal(gran.body.visit.out_signature_svg, SIG_SVG)
  const d = await call('GET', '/api/door/children/c_ava', { token: door })
  assert.deepEqual([d.body.child.status, d.body.child.status_label], ['gone_home', 'Gone home at 9:00 AM'])
})

test('drop-off: anyone active on the list, even the neighbour; already_in, not_in, inactive person, bad signature', async () => {
  const door = await doorToken()
  const dana = await staffToken(PIN.dana)
  const into = (child, body) => call('POST', `/api/door/children/${child}/in`, { token: door, body })
  const n = await into('c_ava', { person_id: 'p_ava_neighbour', signature: SIG })
  assert.equal(n.status, 201, JSON.stringify(n.body))
  assert.equal(n.body.message, 'Ava M. (SAMPLE) signed in at 9:00 AM by Rick D. (SAMPLE).')
  assert.deepEqual({ ...n.body.visit, id: 'v' }, {
    id: 'v', child_id: 'c_ava', date: '2026-09-14', in_at: T9, in_label: '9:00 AM',
    in_by: { id: 'p_ava_neighbour', name: 'Rick D. (SAMPLE)', relationship: 'Neighbour' }, in_signature_svg: SIG_SVG,
    in_recorded_by: null, out_at: null, out_label: null, out_by: null, out_signature_svg: null, out_recorded_by: null,
    awaiting_signature: null, edited: false, edits: [],
  })
  assert.equal(n.body.meter.room_id, 'r_infant')
  const again = await into('c_ava', { person_id: 'p_ava_mother', signature: SIG })
  assert.deepEqual([again.status, again.body.code, again.body.error], [409, 'already_in', 'Ava M. (SAMPLE) is already signed in.'])
  const notIn = await call('POST', '/api/door/children/c_ben/out', { token: door, body: { person_id: 'p_ben_mother', signature: SIG } })
  assert.deepEqual([notIn.status, notIn.body.code], [409, 'not_in'])
  const wrongChild = await into('c_ben', { person_id: 'p_ava_mother', signature: SIG })
  assert.equal(wrongChild.status, 403)
  assert.deepEqual(wrongChild.body, { error: "That person is not on Ben C. (SAMPLE)'s list. Get the supervisor.", code: 'not_on_list' })
  const unknown = await into('c_ben', { person_id: 'p_nobody', signature: SIG })
  assert.deepEqual([unknown.status, unknown.body.code], [403, 'not_on_list'])
  // An inactive person can neither drop off nor pick up.
  assert.equal((await call('DELETE', '/api/office/people/p_ben_father', { token: dana })).status, 200)
  const inactive = await into('c_ben', { person_id: 'p_ben_father', signature: SIG })
  assert.deepEqual([inactive.status, inactive.body.code], [403, 'not_on_list'])
  await signIn(door, 'c_ben', 'p_ben_mother')
  const inactiveOut = await call('POST', '/api/door/children/c_ben/out', { token: door, body: { person_id: 'p_ben_father', signature: SIG } })
  assert.deepEqual([inactiveOut.status, inactiveOut.body.code], [403, 'not_on_list'])
  const people = await call('GET', '/api/door/children/c_ben', { token: door })
  assert.deepEqual(people.body.people.map((p) => p.id), ['p_ben_mother'])
  // Bad signatures, on the way in and out.
  for (const signature of [undefined, { w: 600, h: 200, strokes: [] }, { w: 600, h: 200, strokes: [[1, 1, 5, 5]] }]) {
    const r = await into('c_liam', { person_id: 'p_liam_mother', signature })
    assert.equal(r.status, 400)
    assert.deepEqual(r.body, { error: 'Please sign with your finger.', code: 'bad_request', field: 'signature' })
  }
  const badOut = await call('POST', '/api/door/children/c_ava/out', { token: door, body: { person_id: 'p_ava_mother', signature: { w: 600 } } })
  assert.deepEqual([badOut.status, badOut.body.field], [400, 'signature'])
  assert.equal((await call('GET', '/api/door/children/c_liam', { token: door })).body.child.status, 'not_in_yet')
  assert.equal((await call('POST', '/api/door/children/c_nobody/in', { token: door, body: { person_id: 'p_ava_mother', signature: SIG } })).status, 404)
})

test('staff-recorded drop-off and pick-up await a signature; the recorded person signs later and the times do not change', async () => {
  const door = await doorToken()
  const marie = await staffToken(PIN.marie)
  const rin = await call('POST', '/api/staff/children/c_ava/in', { token: marie, body: { person_id: 'p_ava_mother' }, now: nl('08:05') })
  assert.equal(rin.status, 201, JSON.stringify(rin.body))
  assert.deepEqual(rin.body.visit.in_recorded_by, { id: 's_marie', initials: 'MT' })
  assert.equal(rin.body.visit.awaiting_signature, 'in')
  assert.equal(rin.body.visit.in_signature_svg, null)
  assert.equal(rin.body.message, 'Ava M. (SAMPLE) signed in at 8:05 AM by Sarah M. (SAMPLE).')
  const visitId = rin.body.visit.id
  const list = await call('GET', '/api/door/children', { token: door })
  assert.equal(list.body.children.find((c) => c.id === 'c_ava').awaiting_signature, true)
  assert.equal(list.body.children.find((c) => c.id === 'c_liam').awaiting_signature, false)
  const detail = await call('GET', '/api/door/children/c_ava', { token: door })
  assert.deepEqual(detail.body.pending, [{ visit_id: visitId, which: 'in', date_label: 'Mon Sep 14', time_label: '8:05 AM',
    person: { id: 'p_ava_mother', name: 'Sarah M. (SAMPLE)' } }])
  const sign = (body, now = nl('09:30')) => call('POST', `/api/door/visits/${visitId}/sign`, { token: door, body, now })
  const father = await sign({ which: 'in', person_id: 'p_ava_father', signature: SIG })
  assert.deepEqual([father.status, father.body.code], [403, 'not_on_list'])
  const noInk = await sign({ which: 'in', person_id: 'p_ava_mother', signature: { w: 600, h: 200, strokes: [[5, 5]] } })
  assert.deepEqual([noInk.status, noInk.body.field], [400, 'signature'])
  const nothingOut = await sign({ which: 'out', person_id: 'p_ava_mother', signature: SIG })
  assert.deepEqual([nothingOut.status, nothingOut.body.code], [409, 'bad_state'])
  const mother = await sign({ which: 'in', person_id: 'p_ava_mother', signature: SIG })
  assert.equal(mother.status, 200, JSON.stringify(mother.body))
  assert.equal(mother.body.visit.awaiting_signature, null)
  assert.equal(mother.body.visit.in_at, nl('08:05'))
  assert.equal(mother.body.visit.in_label, '8:05 AM')
  assert.equal(mother.body.visit.in_signature_svg, SIG_SVG)
  assert.deepEqual(mother.body.visit.in_recorded_by, { id: 's_marie', initials: 'MT' }, 'who recorded it stays on the record')
  const twice = await sign({ which: 'in', person_id: 'p_ava_mother', signature: SIG })
  assert.deepEqual([twice.status, twice.body.code], [409, 'bad_state'])
  assert.equal((await call('GET', '/api/door/children', { token: door })).body.children.find((c) => c.id === 'c_ava').awaiting_signature, false)
  // Pick-up recorded by staff.
  const rout = await call('POST', '/api/staff/children/c_ava/out', { token: marie, body: { person_id: 'p_ava_father' }, now: nl('16:30') })
  assert.equal(rout.status, 200, JSON.stringify(rout.body))
  assert.deepEqual([rout.body.visit.awaiting_signature, rout.body.visit.out_recorded_by], ['out', { id: 's_marie', initials: 'MT' }])
  assert.equal(rout.body.message, 'Ava M. (SAMPLE) signed out at 4:30 PM by Tom M. (SAMPLE).')
  const dad = await sign({ which: 'out', person_id: 'p_ava_father', signature: SIG }, nl('16:45'))
  assert.equal(dad.status, 200)
  assert.deepEqual([dad.body.visit.awaiting_signature, dad.body.visit.out_at, dad.body.visit.out_signature_svg], [null, nl('16:30'), SIG_SVG])
  assert.equal((await call('POST', '/api/door/visits/v_nothing/sign', { token: door, body: { which: 'in' } })).status, 404)
})

// ---------- logs and the note ----------

test('logs: every kind and its label, nap guards, not_in, validation, voiding by author and supervisor', async () => {
  const door = await doorToken()
  const marie = await staffToken(PIN.marie)
  const kevin = await staffToken(PIN.kevin)
  const dana = await staffToken(PIN.dana)
  await signIn(door, 'c_ava', 'p_ava_mother', nl('08:00'))
  const cases = [
    [{ kind: 'meal', meal: 'breakfast', value: 'all' }, 'Breakfast: ate all'],
    [{ kind: 'meal', meal: 'am_snack', value: 'some' }, 'Morning snack: ate some'],
    [{ kind: 'meal', meal: 'lunch', value: 'none' }, 'Lunch: ate none'],
    [{ kind: 'meal', meal: 'pm_snack', value: 'all' }, 'Afternoon snack: ate all'],
    [{ kind: 'nap_start' }, 'Fell asleep'],
    [{ kind: 'nap_end' }, 'Woke up'],
    [{ kind: 'diaper', value: 'wet' }, 'Wet diaper'],
    [{ kind: 'diaper', value: 'bm' }, 'BM diaper'],
    [{ kind: 'diaper', value: 'dry' }, 'Dry diaper'],
    [{ kind: 'toilet', value: 'went' }, 'Used the toilet'],
    [{ kind: 'toilet', value: 'tried' }, 'Tried the toilet'],
    [{ kind: 'mood', value: 'happy' }, 'Happy'],
    [{ kind: 'mood', value: 'okay' }, 'Okay'],
    [{ kind: 'mood', value: 'tired' }, 'Tired'],
    [{ kind: 'mood', value: 'upset' }, 'Upset'],
    [{ kind: 'note', text: '  Loved the water table.  ' }, 'Loved the water table.'],
  ]
  const ids = []
  for (const [body, label] of cases) {
    const log = await addLog(marie, 'c_ava', body, nl('10:10'))
    assert.equal(log.label, label)
    assert.equal(log.kind, body.kind)
    assert.equal(log.time_label, '10:10 AM')
    assert.equal(log.at, nl('10:10'))
    assert.deepEqual(log.by, { id: 's_marie', initials: 'MT' })
    assert.deepEqual([log.value, log.meal, log.text],
      [body.value ?? null, body.meal ?? null, body.kind === 'note' ? 'Loved the water table.' : null])
    ids.push(log.id)
  }
  const log = (body, token = marie) => call('POST', '/api/staff/children/c_ava/logs', { token, body, now: nl('11:00') })
  await addLog(marie, 'c_ava', { kind: 'nap_start' }, nl('12:40'))
  const today = async () => (await call('GET', '/api/staff/today', { token: marie, now: nl('12:41') })).body.rooms[0].children[0]
  assert.deepEqual([(await today()).napping, (await today()).last_meal_label], [true, 'Afternoon snack: ate all'])
  const asleep = await log({ kind: 'nap_start' })
  assert.deepEqual([asleep.status, asleep.body.code, asleep.body.error], [409, 'already_napping', 'Ava M. (SAMPLE) is already asleep.'])
  await addLog(marie, 'c_ava', { kind: 'nap_end' }, nl('14:05'))
  const awake = await log({ kind: 'nap_end' })
  assert.deepEqual([awake.status, awake.body.code, awake.body.error], [409, 'not_napping', 'Ava M. (SAMPLE) is not asleep.'])
  assert.equal((await today()).napping, false)
  for (const [body, field] of [[{ kind: 'dance' }, 'kind'], [{}, 'kind'], [{ kind: 'meal', meal: 'lunch', value: 'most' }, 'value'],
    [{ kind: 'meal', value: 'all' }, 'meal'], [{ kind: 'diaper', value: 'damp' }, 'value'], [{ kind: 'toilet' }, 'value'],
    [{ kind: 'mood', value: 'grumpy' }, 'value'], [{ kind: 'note', text: '   ' }, 'text'], [{ kind: 'note', text: 'x'.repeat(281) }, 'text']]) {
    const r = await log(body)
    assert.deepEqual([r.status, r.body.code, r.body.field], [400, 'bad_request', field], JSON.stringify(body))
  }
  assert.equal((await log({ kind: 'note', text: 'x'.repeat(280) })).status, 201)
  const ben = await call('POST', '/api/staff/children/c_ben/logs', { token: marie, body: { kind: 'mood', value: 'happy' } })
  assert.deepEqual([ben.status, ben.body.code], [409, 'not_in'])
  // Voiding.
  const del = (id, token, now = nl('15:00')) => call('DELETE', `/api/staff/logs/${id}`, { token, now })
  assert.deepEqual([(await del(ids[0], kevin)).status, (await del(ids[0], kevin)).body.code], [403, 'forbidden'])
  assert.deepEqual((await del(ids[0], marie)).body, { ok: true })
  assert.equal((await del(ids[0], marie)).status, 404, 'already voided')
  assert.equal((await del(ids[1], dana)).status, 200, 'the supervisor voids anyone\'s')
  const tomorrow = await staffToken(PIN.marie, nl('09:00', '2026-09-15'))
  const stale = await del(ids[2], tomorrow, nl('09:00', '2026-09-15'))
  assert.deepEqual([stale.status, stale.body.code], [409, 'bad_state'], 'not a log from today')
  const child = await call('GET', '/api/staff/children/c_ava', { token: marie, now: nl('15:00') })
  const shown = child.body.logs.map((l) => l.id)
  assert.ok(!shown.includes(ids[0]) && !shown.includes(ids[1]), 'voided logs are not shown')
  assert.ok(shown.includes(ids[2]))
  assert.equal(child.body.logs.length, cases.length - 2 + 3)
  // A voided nap start means the child is not asleep.
  const nap = await addLog(marie, 'c_ava', { kind: 'nap_start' }, nl('15:10'))
  assert.equal((await del(nap.id, marie, nl('15:11'))).status, 200)
  assert.equal((await log({ kind: 'nap_end' })).body.code, 'not_napping')
})

test('the note: meals, a nap, toileting, moods, both rooms\' activities after a move, staff notes, the line, arrived and left; voided logs absent', async () => {
  const door = await doorToken()
  const marie = await staffToken(PIN.marie, nl('08:00'))
  const kevin = await staffToken(PIN.kevin, nl('08:00'))
  await signIn(door, 'c_ava', 'p_ava_mother', nl('08:05'))
  await signIn(door, 'c_ben', 'p_ben_father', nl('08:10'))
  await addLog(marie, 'c_ava', { kind: 'mood', value: 'happy' }, nl('09:30'))
  const oops = await addLog(marie, 'c_ava', { kind: 'mood', value: 'upset' }, nl('09:31'))
  assert.equal((await call('DELETE', `/api/staff/logs/${oops.id}`, { token: marie, now: nl('09:32') })).status, 200)
  await addLog(marie, 'c_ava', { kind: 'diaper', value: 'wet' }, nl('10:10'))
  await addLog(marie, 'c_ava', { kind: 'note', text: 'Loved the water table.' }, nl('10:30'))
  await addLog(marie, 'c_ava', { kind: 'meal', meal: 'lunch', value: 'all' }, nl('11:45'))
  await addLog(marie, 'c_ava', { kind: 'nap_start' }, nl('12:40'))
  const asleep = await call('GET', '/api/staff/children/c_ava/note', { token: marie, now: nl('13:00') })
  assert.deepEqual(asleep.body.naps, [{ label: 'Asleep since 12:40 PM', minutes: null }])
  await addLog(marie, 'c_ava', { kind: 'nap_end' }, nl('14:05'))
  assert.equal((await call('POST', '/api/staff/children/c_ava/move', { token: kevin, body: { room_id: 'r_toddler' }, now: nl('14:10') })).status, 200)
  const act = await call('PUT', '/api/staff/rooms/r_infant/activity', { token: marie, body: { text: 'Sensory bins and a walk to the harbour.' }, now: nl('14:20') })
  assert.deepEqual(act.body, { date: '2026-09-14', room_id: 'r_infant', text: 'Sensory bins and a walk to the harbour.' })
  // Only the infant room has a line yet: activities lists it, rooms_today lists both rooms Ava was in.
  const half = await call('GET', '/api/staff/children/c_ava/note', { token: marie, now: nl('14:21') })
  assert.deepEqual(half.body.activities, [{ room_id: 'r_infant', room_name: 'Infant room', text: 'Sensory bins and a walk to the harbour.' }])
  assert.deepEqual(half.body.rooms_today, [{ room_id: 'r_infant', room_name: 'Infant room' }, { room_id: 'r_toddler', room_name: 'Toddler room' }])
  await call('PUT', '/api/staff/rooms/r_toddler/activity', { token: kevin, body: { text: 'Painting with big brushes.' }, now: nl('14:25') })
  await call('PUT', '/api/staff/rooms/r_preschool/activity', { token: kevin, body: { text: 'Not Ava\'s room today.' }, now: nl('14:25') })
  const line = await call('PUT', '/api/staff/children/c_ava/note', { token: marie, body: { text: 'A great day.' }, now: nl('14:30') })
  assert.equal(line.status, 200)
  assert.equal(line.body.note_line, 'A great day.')
  await signOut(door, 'c_ava', 'p_ava_father', nl('16:30'))
  const note = await call('GET', '/api/staff/children/c_ava/note', { token: marie, now: nl('16:31') })
  assert.equal(note.status, 200)
  assert.deepEqual(note.body, {
    centre_name: CENTRE, sample: true,
    child: { name: 'Ava M. (SAMPLE)', initials: 'AM', room_name: 'Infant room', age_group: 'infant' },
    date: '2026-09-14', long_label: 'Monday, September 14',
    arrived: { time_label: '8:05 AM', by: 'Sarah M. (SAMPLE)' },
    left: { time_label: '4:30 PM', by: 'Tom M. (SAMPLE)' },
    meals: [{ meal_label: 'Lunch', value_label: 'Ate all', time_label: '11:45 AM' }],
    naps: [{ label: '12:40 PM to 2:05 PM (1 h 25 min)', minutes: 85 }],
    toileting: [{ label: 'Wet diaper', time_label: '10:10 AM' }],
    moods: [{ label: 'Happy', time_label: '9:30 AM' }],
    activities: [{ room_id: 'r_infant', room_name: 'Infant room', text: 'Sensory bins and a walk to the harbour.' },
      { room_id: 'r_toddler', room_name: 'Toddler room', text: 'Painting with big brushes.' }],
    rooms_today: [{ room_id: 'r_infant', room_name: 'Infant room' }, { room_id: 'r_toddler', room_name: 'Toddler room' }],
    staff_notes: [{ text: 'Loved the water table.', time_label: '10:30 AM', by_initials: 'MT' }],
    note_line: 'A great day.',
    infant_record: true,
    updated_label: 'Updated 4:30 PM',
  })
  // Yesterday's note for staff is allowed and empty; tomorrow is not.
  const past = await call('GET', '/api/staff/children/c_ava/note?date=2026-09-13', { token: marie, now: nl('16:31') })
  assert.deepEqual([past.status, past.body.arrived, past.body.meals], [200, null, []])
  const ben = await call('GET', '/api/staff/children/c_ben/note', { token: marie, now: nl('16:31') })
  assert.deepEqual([ben.body.infant_record, ben.body.child.room_name, ben.body.child.age_group, ben.body.left, ben.body.note_line],
    [false, 'Preschool room', 'preschool', null, null])
  assert.deepEqual(ben.body.arrived, { time_label: '8:10 AM', by: 'Greg C. (SAMPLE)' })
  assert.deepEqual([ben.body.meals, ben.body.naps, ben.body.toileting, ben.body.moods, ben.body.staff_notes], [[], [], [], [], []])
  assert.deepEqual(ben.body.activities, [{ room_id: 'r_preschool', room_name: 'Preschool room', text: 'Not Ava\'s room today.' }])
  assert.deepEqual(ben.body.rooms_today, [{ room_id: 'r_preschool', room_name: 'Preschool room' }])
  assert.deepEqual(past.body.rooms_today, [], 'no placements that day')
  const future = await call('GET', '/api/staff/children/c_ava/note?date=2026-09-15', { token: marie, now: nl('16:31') })
  assert.deepEqual([future.status, future.body.field], [400, 'date'])
  const long = await call('PUT', '/api/staff/children/c_ava/note', { token: marie, body: { text: 'x'.repeat(501) } })
  assert.deepEqual([long.status, long.body.field], [400, 'text'])
})

// ---------- the parent link ----------

async function linkDay() {
  const door = await doorToken()
  const marie = await staffToken(PIN.marie, nl('21:00'))
  await signIn(door, 'c_ava', 'p_ava_mother')
  const r = await call('POST', '/api/staff/children/c_ava/note/link', { token: marie, now: nl('21:00') })
  assert.equal(r.status, 201, JSON.stringify(r.body))
  return { door, marie, link: r.body }
}

test('parent link: made at 9:00 PM NDT, still works at 11:59:59 PM NDT and shows a log added after it was made', async () => {
  const { marie, link } = await linkDay()
  assert.match(link.token, /^[A-Za-z0-9_-]{43}$/)
  assert.deepEqual({ ...link, token: 't', url: link.url.replace(link.token, 't') }, {
    token: 't', url: '/note/?t=t', date: '2026-09-14', expires_at: '2026-09-15T02:30:00.000Z',
    expires_label: 'Works until midnight tonight.',
  })
  await addLog(marie, 'c_ava', { kind: 'note', text: 'Asleep in the late room, all well.' }, nl('22:00'))
  const r = await call('GET', `/api/note/${link.token}`, { now: nl('23:59:59') })
  assert.equal(r.status, 200, JSON.stringify(r.body))
  assert.equal(r.body.child.name, 'Ava M. (SAMPLE)')
  assert.equal(r.body.date, '2026-09-14')
  assert.deepEqual(r.body.staff_notes, [{ text: 'Asleep in the late room, all well.', time_label: '10:00 PM', by_initials: 'MT' }])
  assert.doesNotMatch(JSON.stringify(r.body), /709-555/)
  // The database holds the SHA-256 of the token and never the token.
  const { rows, raw } = d1('SELECT * FROM note_links')
  assert.equal(rows.length, 1)
  assert.equal(rows[0].token_hash, createHash('sha256').update(link.token).digest('hex'))
  assert.deepEqual([rows[0].child_id, rows[0].date, rows[0].expires_at], ['c_ava', '2026-09-14', '2026-09-15T02:30:00.000Z'])
  assert.ok(!raw.includes(link.token), 'the raw token is nowhere in the table')
  // A second link for today also works, and the first keeps working.
  const second = await call('POST', '/api/staff/children/c_ava/note/link', { token: marie, now: nl('23:00') })
  assert.notEqual(second.body.token, link.token)
  assert.equal((await call('GET', `/api/note/${link.token}`, { now: nl('23:30') })).status, 200)
  assert.equal((await call('GET', `/api/note/${second.body.token}`, { now: nl('23:30') })).status, 200)
})

test('parent link: dead at 12:00:00 AM NDT the next day (410 with the exact message), unknown token 404', async () => {
  const { link } = await linkDay()
  const dead = { error: 'This link was for Monday, September 14 and stopped working at midnight. Ask the centre for today\'s note.', code: 'link_expired' }
  const midnight = await call('GET', `/api/note/${link.token}`, { now: nl('00:00:00', '2026-09-15') })
  assert.equal(midnight.status, 410)
  assert.deepEqual(midnight.body, dead)
  const afternoon = await call('GET', `/api/note/${link.token}`, { now: nl('14:00', '2026-09-15') })
  assert.deepEqual([afternoon.status, afternoon.body], [410, dead])
  const unknown = await call('GET', `/api/note/${'A'.repeat(43)}`, { now: nl('21:05') })
  assert.equal(unknown.status, 404)
  assert.deepEqual(unknown.body, { error: "We couldn't find that note. Ask the centre for a new link.", code: 'not_found' })
})

test('parent link: a link for another child never returns this child', async () => {
  const { door, marie, link } = await linkDay()
  await signIn(door, 'c_ben', 'p_ben_mother')
  await addLog(marie, 'c_ava', { kind: 'mood', value: 'happy' }, nl('21:10'))
  const ben = await call('POST', '/api/staff/children/c_ben/note/link', { token: marie, now: nl('21:15') })
  const r = await call('GET', `/api/note/${ben.body.token}`, { now: nl('21:20') })
  assert.equal(r.status, 200)
  assert.equal(r.body.child.name, 'Ben C. (SAMPLE)')
  assert.doesNotMatch(JSON.stringify(r.body), /Ava|Sarah M\.|Happy/)
  assert.equal((await call('GET', `/api/note/${link.token}`, { now: nl('21:20') })).body.child.name, 'Ava M. (SAMPLE)')
  // A link token is not a bearer token, and a bearer token is not a link.
  assert.equal((await call('GET', '/api/staff/today', { token: ben.body.token, now: nl('21:20') })).status, 401)
  assert.equal((await call('GET', `/api/note/${marie}`, { now: nl('21:20') })).status, 404)
})
