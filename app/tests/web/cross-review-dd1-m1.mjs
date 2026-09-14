// Cross-review of dd1's M1 Worker against docs/API.md, limited to the routes dd2's pages call. Read-only toward worker/.
// Prints OK / DIFF per check and exits 1 if any DIFF. Needs a Worker with TEST_MODE=1 on E2E_PORT (default 7801).
//   node tests/web/cross-review-dd1-m1.mjs
const PORT = Number(process.env.E2E_PORT || 7801)
const BASE = `http://127.0.0.1:${PORT}`
const NINE = '2026-09-14T11:30:00Z' // Mon Sep 14, 9:00 AM NDT
let diffs = 0
let oks = 0

async function call(method, path, { body, token, now = NINE, ip = 'xreview' } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: { 'X-Test-Now': now, 'X-Test-IP': ip, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
  const text = await r.text()
  let json = null
  try { json = JSON.parse(text) } catch { json = text }
  return { status: r.status, body: json }
}

const show = (v) => JSON.stringify(v)
function check(name, got, expected) {
  const same = typeof expected === 'function' ? expected(got) : show(got) === show(expected)
  if (same) { oks++; return true }
  diffs++
  console.log(`DIFF ${name}\n     expected ${typeof expected === 'function' ? expected.toString() : show(expected)}\n     got      ${show(got)}`)
  return false
}
const keys = (o) => (o && typeof o === 'object' ? Object.keys(o).sort() : o)
const sameKeys = (name, obj, list) => check(`${name} keys`, keys(obj), [...list].sort())
const err = (name, r, status, code, field, error) => {
  check(`${name} status`, r.status, status)
  check(`${name} code`, r.body?.code, code)
  check(`${name} field`, r.body?.field ?? null, field ?? null)
  if (error !== undefined) check(`${name} error text`, r.body?.error, error)
  check(`${name} envelope keys`, keys(r.body).filter((k) => !['error', 'code', 'field'].includes(k)), [])
}
const BARE_TIME = /^(1[0-2]|[1-9]):[0-5]\d (AM|PM)$/

const CHILD_KEYS = ['id', 'name', 'initials', 'dob', 'age_label', 'home_room_id', 'room_id', 'room_name', 'schedule', 'days', 'start_date', 'end_date', 'active']
const METER_KEYS = ['room_id', 'room_name', 'age_group', 'children', 'staff', 'children_per_caregiver', 'max_children', 'allowed', 'state', 'state_label', 'needs_staff', 'label']
const VISIT_KEYS = ['id', 'child_id', 'date', 'in_at', 'in_label', 'in_by', 'in_signature_svg', 'in_recorded_by', 'out_at', 'out_label', 'out_by', 'out_signature_svg', 'out_recorded_by', 'awaiting_signature', 'edited', 'edits']
const LOG_KEYS = ['id', 'kind', 'value', 'meal', 'text', 'at', 'time_label', 'label', 'by']
const NOTE_KEYS = ['centre_name', 'sample', 'child', 'date', 'long_label', 'arrived', 'left', 'meals', 'naps', 'toileting', 'moods', 'activities', 'staff_notes', 'note_line', 'infant_record', 'updated_label']
const sig = { w: 600, h: 200, strokes: [[40, 150, 120, 60, 200, 140, 280, 50, 360, 150]] }

// ---------- setup ----------
check('reset', (await call('POST', '/api/test/reset')).status, 200)

// info
const info = await call('GET', '/api/info')
sameKeys('GET /api/info', info.body, ['centre_name', 'sample', 'phone', 'zone', 'today', 'date_label', 'long_label', 'now', 'now_local', 'time_label'])
check('info values', [info.body.today, info.body.date_label, info.body.long_label, info.body.now_local, info.body.time_label], ['2026-09-14', 'Mon Sep 14', 'Monday, September 14', '09:00', '9:00 AM'])

// sign in
err('signin wrong PIN', await call('POST', '/api/signin', { body: { pin: '9999' }, ip: 'xr-wrong' }), 401, 'unauthorized', 'pin', 'That PIN is not right.')
for (let i = 0; i < 4; i++) await call('POST', '/api/signin', { body: { pin: '9999' }, ip: 'xr-wrong' })
err('6th try from one IP (the keypad shows this text)', await call('POST', '/api/signin', { body: { pin: '1593' }, ip: 'xr-wrong' }), 429, 'rate_limited', null, 'Too many tries. Wait 15 minutes, then try again.')
const marie = await call('POST', '/api/signin', { body: { pin: '1593' } })
check('signin status', marie.status, 200)
sameKeys('signin', marie.body, ['token', 'role', 'staff', 'expires_at'])
sameKeys('signin.staff', marie.body.staff, ['id', 'name', 'initials'])
check('signin role', marie.body.role, 'educator')
const M = marie.body.token
const K = (await call('POST', '/api/signin', { body: { pin: '2604' } })).body.token
const D = (await call('POST', '/api/signin', { body: { pin: '4826' } })).body.token
const door = (await call('POST', '/api/door/unlock', { body: { pin: '4826' } })).body.token
err('today without token', await call('GET', '/api/staff/today'), 401, 'unauthorized')
err('today with door token', await call('GET', '/api/staff/today', { token: door }), 403, 'forbidden')

// today before anything
let today = await call('GET', '/api/staff/today', { token: M })
check('today status', today.status, 200)
sameKeys('today', today.body, ['date', 'date_label', 'now', 'now_local', 'centre_name', 'sample', 'me', 'rooms', 'not_in_yet', 'away', 'gone_home'])
sameKeys('today.me', today.body.me, ['staff', 'room_id'])
sameKeys('today.me.staff (Staff shape)', today.body.me.staff, ['id', 'name', 'initials', 'role', 'active'])
sameKeys('today.rooms[0]', today.body.rooms[0], ['room', 'meter', 'children', 'staff'])
sameKeys('today.rooms[0].room', today.body.rooms[0].room, ['id', 'name', 'age_group', 'active', 'sort'])
sameKeys('today.rooms[0].meter', today.body.rooms[0].meter, METER_KEYS)
check('today room order', today.body.rooms.map((r) => r.room.id), ['r_infant', 'r_toddler', 'r_preschool'])
sameKeys('today.not_in_yet[0] (Child shape)', today.body.not_in_yet[0], CHILD_KEYS)
check('Isla (not booked Monday) is not in not_in_yet', today.body.not_in_yet.some((c) => c.id === 'c_isla'), false)
check('not_in_yet has the other 18', today.body.not_in_yet.length, 18)

// presence
const pres = await call('POST', '/api/staff/presence', { token: M, body: { room_id: 'r_infant' } })
check('presence status', pres.status, 200)
sameKeys('presence', pres.body, ['rooms'])
check('presence rooms are meters', pres.body.rooms.map(keys), [METER_KEYS.sort(), METER_KEYS.sort(), METER_KEYS.sort()])
err('presence for someone else as educator', await call('POST', '/api/staff/presence', { token: M, body: { room_id: 'r_infant', staff_id: 's_kevin' } }), 403, 'forbidden')

// door sign-ins
for (const c of ['ava', 'liam', 'nora']) await call('POST', `/api/door/children/c_${c}/in`, { token: door, body: { person_id: `p_${c}_mother`, signature: sig } })
today = await call('GET', '/api/staff/today', { token: M })
const infant = today.body.rooms[0]
check('infant at_limit', [infant.meter.state, infant.meter.label], ['at_limit', '3 children, 1 staff. At the limit.'])
sameKeys('today child card', infant.children[0], ['id', 'name', 'initials', 'in_label', 'napping', 'last_meal_label', 'awaiting_signature'])
check('in_label is a bare time', infant.children[0].in_label, (v) => BARE_TIME.test(v))
sameKeys('today staff chip', infant.staff[0], ['id', 'name', 'initials', 'since_label'])
check('since_label is a bare time', infant.staff[0].since_label, (v) => BARE_TIME.test(v))
check('me.room_id after presence', today.body.me.room_id, 'r_infant')
await call('POST', '/api/door/children/c_owen/in', { token: door, body: { person_id: 'p_owen_mother', signature: sig } })
today = await call('GET', '/api/staff/today', { token: M })
check('infant over after the 4th', [today.body.rooms[0].meter.state, today.body.rooms[0].meter.needs_staff, today.body.rooms[0].meter.label],
  ['over', 1, '4 children, 1 staff. Over the ratio: 1 staff can have 3. Needs 1 more staff.'])

// child detail
const ava = await call('GET', '/api/staff/children/c_ava', { token: M })
sameKeys('GET staff child', ava.body, ['child', 'visit', 'logs', 'people'])
sameKeys('child (Child shape)', ava.body.child, CHILD_KEYS)
sameKeys('visit (Visit shape)', ava.body.visit, VISIT_KEYS)
check('visit.in_label bare', ava.body.visit.in_label, (v) => BARE_TIME.test(v))
check('door-signed visit carries the contract SVG attributes', ava.body.visit.in_signature_svg, (v) => typeof v === 'string'
  && v.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 200"><path d="M')
  && v.endsWith('" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/></svg>'))
check('people have no phone', ava.body.people.map(keys), (all) => all.every((k) => show(k) === show(['id', 'may_pick_up', 'name', 'relationship'])))
check('Ava people include the neighbour (drop-off list)', ava.body.people.map((p) => p.id).sort(), ['p_ava_father', 'p_ava_gran', 'p_ava_mother', 'p_ava_neighbour'])
check('child.room_name while placed', [ava.body.child.room_id, ava.body.child.room_name], ['r_infant', 'Infant room'])
err('unknown child', await call('GET', '/api/staff/children/c_nobody', { token: M }), 404, 'not_found')

// logs: every kind and label
const logs = [
  [{ kind: 'meal', value: 'all', meal: 'lunch' }, 'Lunch: ate all'],
  [{ kind: 'meal', value: 'some', meal: 'breakfast' }, 'Breakfast: ate some'],
  [{ kind: 'meal', value: 'none', meal: 'am_snack' }, 'Morning snack: ate none'],
  [{ kind: 'meal', value: 'all', meal: 'pm_snack' }, 'Afternoon snack: ate all'],
  [{ kind: 'nap_start' }, 'Fell asleep'],
  [{ kind: 'nap_end' }, 'Woke up'],
  [{ kind: 'diaper', value: 'wet' }, 'Wet diaper'], [{ kind: 'diaper', value: 'bm' }, 'BM diaper'], [{ kind: 'diaper', value: 'dry' }, 'Dry diaper'],
  [{ kind: 'toilet', value: 'went' }, 'Used the toilet'], [{ kind: 'toilet', value: 'tried' }, 'Tried the toilet'],
  [{ kind: 'mood', value: 'happy' }, 'Happy'], [{ kind: 'mood', value: 'okay' }, 'Okay'], [{ kind: 'mood', value: 'tired' }, 'Tired'], [{ kind: 'mood', value: 'upset' }, 'Upset'],
  [{ kind: 'note', text: 'Loved the water table.' }, 'Loved the water table.'],
]
let firstLog = null
let minute = 0
for (const [body, label] of logs) {
  minute += 1
  const now = new Date(Date.parse(NINE) + minute * 60_000).toISOString()
  const r = await call('POST', '/api/staff/children/c_ava/logs', { token: M, body, now })
  check(`log ${body.kind}/${body.value ?? ''} status`, r.status, 201)
  sameKeys(`log ${body.kind} shape`, r.body?.log, LOG_KEYS)
  check(`log ${body.kind}/${body.value ?? body.meal ?? ''} label`, r.body?.log?.label, label)
  firstLog ??= r.body.log
}
check('log.by', keys(firstLog.by), ['id', 'initials'])
check('log.time_label bare', firstLog.time_label, (v) => BARE_TIME.test(v))
err('meal with a bad value', await call('POST', '/api/staff/children/c_ava/logs', { token: M, body: { kind: 'meal', value: 'lots', meal: 'lunch' } }), 400, 'bad_request', 'value')
err('meal with no meal', await call('POST', '/api/staff/children/c_ava/logs', { token: M, body: { kind: 'meal', value: 'all' } }), 400, 'bad_request', 'meal')
err('empty note', await call('POST', '/api/staff/children/c_ava/logs', { token: M, body: { kind: 'note', text: '' } }), 400, 'bad_request', 'text')
err('281-char note', await call('POST', '/api/staff/children/c_ava/logs', { token: M, body: { kind: 'note', text: 'x'.repeat(281) } }), 400, 'bad_request', 'text')
err('nap_end while awake', await call('POST', '/api/staff/children/c_ava/logs', { token: M, body: { kind: 'nap_end' } }), 409, 'not_napping')
await call('POST', '/api/staff/children/c_liam/logs', { token: M, body: { kind: 'nap_start' } })
err('nap_start while asleep', await call('POST', '/api/staff/children/c_liam/logs', { token: M, body: { kind: 'nap_start' } }), 409, 'already_napping')
err('log for a child not in', await call('POST', '/api/staff/children/c_ben/logs', { token: M, body: { kind: 'mood', value: 'happy' } }), 409, 'not_in')
today = await call('GET', '/api/staff/today', { token: M })
const cards = Object.fromEntries(today.body.rooms[0].children.map((c) => [c.id, c]))
check('Liam napping on the card', cards.c_liam.napping, true)
check('Ava last_meal_label', cards.c_ava.last_meal_label, 'Afternoon snack: ate all')

// undo
check('undo own log', (await call('DELETE', `/api/staff/logs/${firstLog.id}`, { token: M })).body, { ok: true })
const avaLogs = (await call('GET', '/api/staff/children/c_ava', { token: M })).body.logs
check('undone log gone from child logs', avaLogs.some((l) => l.id === firstLog.id), false)
const kevinsTarget = avaLogs[0]
err('another educator undoes Marie\'s log', await call('DELETE', `/api/staff/logs/${kevinsTarget.id}`, { token: K }), 403, 'forbidden')
check('supervisor undoes any log', (await call('DELETE', `/api/staff/logs/${kevinsTarget.id}`, { token: D })).status, 200)
err('undo unknown log', await call('DELETE', '/api/staff/logs/l_nope', { token: M }), 404, 'not_found')

// move
const move = await call('POST', '/api/staff/children/c_ava/move', { token: M, body: { room_id: 'r_toddler' } })
check('move status', move.status, 200)
sameKeys('move', move.body, ['from', 'to', 'message'])
check('move message', move.body.message, 'Ava M. (SAMPLE) moved to Toddler room.')
check('move meters', [move.body.from.room_id, move.body.from.children, move.body.to.room_id, move.body.to.children], ['r_infant', 3, 'r_toddler', 1])
err('move to the same room', await call('POST', '/api/staff/children/c_ava/move', { token: M, body: { room_id: 'r_toddler' } }), 400, 'bad_request', 'room_id')
err('move a child not in', await call('POST', '/api/staff/children/c_ben/move', { token: M, body: { room_id: 'r_toddler' } }), 409, 'not_in')

// record without a signature
const rec = await call('POST', '/api/staff/children/c_ben/in', { token: M, body: { person_id: 'p_ben_father' } })
check('staff in status', rec.status, 201)
sameKeys('staff in', rec.body, ['visit', 'meter', 'message'])
check('staff in recorded_by / awaiting', [rec.body.visit?.in_recorded_by, rec.body.visit?.awaiting_signature, rec.body.visit?.in_signature_svg], [{ id: 's_marie', initials: 'MT' }, 'in', null])
check('staff in message', rec.body.message, (m) => /^Ben C\. \(SAMPLE\) signed in at 9:00 AM by \S+ C\. \(SAMPLE\)\.$/.test(m))
check('staff in meter is the home room', rec.body.meter?.room_id, 'r_preschool')
err('staff in again', await call('POST', '/api/staff/children/c_ben/in', { token: M, body: { person_id: 'p_ben_father' } }), 409, 'already_in')
err('staff in by another child\'s person', await call('POST', '/api/staff/children/c_lucy/in', { token: M, body: { person_id: 'p_ben_father' } }), 403, 'not_on_list', null, 'That person is not on Lucy G. (SAMPLE)\'s list. Get the supervisor.')
today = await call('GET', '/api/staff/today', { token: M })
check('Ben card awaiting_signature', today.body.rooms[2].children.find((c) => c.id === 'c_ben')?.awaiting_signature, true)

// activity
const act = await call('PUT', '/api/staff/rooms/r_infant/activity', { token: M, body: { text: 'Sensory bins.' } })
check('activity', [act.status, act.body], [200, { date: '2026-09-14', room_id: 'r_infant', text: 'Sensory bins.' }])
err('activity 501 chars', await call('PUT', '/api/staff/rooms/r_infant/activity', { token: M, body: { text: 'x'.repeat(501) } }), 400, 'bad_request', 'text')
await call('PUT', '/api/staff/rooms/r_toddler/activity', { token: M, body: { text: '' } })

// note
await call('POST', '/api/staff/children/c_ava/logs', { token: M, body: { kind: 'nap_start' }, now: '2026-09-14T15:10:00Z' })
await call('POST', '/api/staff/children/c_ava/logs', { token: M, body: { kind: 'nap_end' }, now: '2026-09-14T16:35:00Z' })
const note = await call('GET', '/api/staff/children/c_ava/note', { token: M, now: '2026-09-14T16:40:00Z' })
check('note status', note.status, 200)
sameKeys('note', note.body, NOTE_KEYS)
sameKeys('note.child', note.body.child, ['name', 'initials', 'room_name', 'age_group'])
check('note.arrived', note.body.arrived, { time_label: '9:00 AM', by: 'Sarah M. (SAMPLE)' })
check('note.meals[0] shape', keys(note.body.meals[0]), ['meal_label', 'time_label', 'value_label'])
// Lunch (undone by Marie) and Breakfast (undone by the supervisor) are voided above, so they are left out.
check('note.meals labels', note.body.meals.map((m) => `${m.meal_label}: ${m.value_label}`), ['Morning snack: Ate none', 'Afternoon snack: Ate all'])
check('note.naps', note.body.naps.at(-1), { label: '12:40 PM to 2:05 PM (1 h 25 min)', minutes: 85 })
check('note.activities: only rooms with a line', note.body.activities, [{ room_name: 'Infant room', text: 'Sensory bins.' }])
check('note.staff_notes', note.body.staff_notes.map((n) => [n.text, n.by_initials]), [['Loved the water table.', 'MT']])
check('note.infant_record', note.body.infant_record, true)
check('note.child.age_group is the home group while in toddler room', note.body.child.age_group, 'infant')
check('note.updated_label', note.body.updated_label, (v) => /^Updated (1[0-2]|[1-9]):[0-5]\d (AM|PM)$/.test(v))
const line = await call('PUT', '/api/staff/children/c_ava/note', { token: M, body: { text: 'A great day.' } })
check('PUT note answers the note with note_line', [line.status, line.body?.note_line], [200, 'A great day.'])
err('PUT note 501 chars', await call('PUT', '/api/staff/children/c_ava/note', { token: M, body: { text: 'x'.repeat(501) } }), 400, 'bad_request', 'text')
check('Ben note infant_record false', (await call('GET', '/api/staff/children/c_ben/note', { token: M })).body.infant_record, false)

// parent link
// Marie's 12-hour token (signed in 9:00 AM) is dead by 9:00 PM: that is the contract, so the evening shift signs in again.
err('staff token after 12 hours', await call('GET', '/api/staff/today', { token: M, now: '2026-09-14T23:30:00Z' }), 401, 'unauthorized')
const evening = (await call('POST', '/api/signin', { body: { pin: '1593' }, now: '2026-09-14T23:30:00Z' })).body.token
const link = await call('POST', '/api/staff/children/c_ava/note/link', { token: evening, now: '2026-09-14T23:30:00Z' })
check('link status', link.status, 201)
sameKeys('link', link.body, ['token', 'url', 'date', 'expires_at', 'expires_label'])
check('link token 43 base64url', link.body.token, (t) => /^[A-Za-z0-9_-]{43}$/.test(t))
check('link url', link.body.url, `/note/?t=${link.body.token}`)
check('link expires', [link.body.date, link.body.expires_at, link.body.expires_label], ['2026-09-14', '2026-09-15T02:30:00.000Z', 'Works until midnight tonight.'])
const pnote = await call('GET', `/api/note/${link.body.token}`, { now: '2026-09-15T02:29:59Z' })
check('parent note at 11:59:59 PM', [pnote.status, pnote.body?.child?.name, pnote.body?.note_line], [200, 'Ava M. (SAMPLE)', 'A great day.'])
check('parent note has no phone anywhere', JSON.stringify(pnote.body).includes('709-555'), false)
err('parent note at 12:00 AM next day', await call('GET', `/api/note/${link.body.token}`, { now: '2026-09-15T02:30:00Z' }), 410, 'link_expired', null,
  'This link was for Monday, September 14 and stopped working at midnight. Ask the centre for today\'s note.')
err('parent note unknown token', await call('GET', '/api/note/not-a-real-token'), 404, 'not_found', null, 'We couldn\'t find that note. Ask the centre for a new link.')

// sign out
check('signout', (await call('POST', '/api/signout', { token: K })).body, { ok: true })
err('token after signout', await call('GET', '/api/staff/today', { token: K }), 401, 'unauthorized')

// static assets through the Worker
for (const p of ['/', '/room/', '/room/note/', '/note/', '/office/', '/style.css', '/api.js', '/room/room.js']) {
  const r = await fetch(BASE + p)
  check(`asset ${p}`, r.status, 200)
}

console.log(`\n${oks} OK, ${diffs} DIFF`)
process.exit(diffs ? 1 : 0)
