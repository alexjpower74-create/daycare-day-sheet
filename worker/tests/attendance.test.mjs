// Attendance, pure: midnight cuts in Newfoundland time, DST nights, open visits, the CSV rows, and a seeded property test.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { buildAttendance, movesLabels, splitVisit } from '../src/attendance.js'
import { cell, csvText, hours } from '../src/csv.js'
import { endOfDate, localDate, localInstant, minutesBetween, startOfDate } from '../src/time.js'

const at = (date, h, m = 0) => localInstant(date, h, m).toISOString()
const ROOMS = [{ id: 'r_a', name: 'A room', sort: 1 }]
const kid = (id, over = {}) => ({ id, name: `${id} (SAMPLE)`, home_room_id: 'r_a', days: '["mon","tue","wed","thu","fri"]',
  start_date: '2026-01-05', end_date: null, ...over })
const PEOPLE = [{ id: 'p_in', name: 'In P. (SAMPLE)' }, { id: 'p_out', name: 'Out P. (SAMPLE)' }]
const visit = (id, child, inAt, outAt) => ({ id, child_id: child, in_at: inAt, out_at: outAt, in_person_id: 'p_in', out_person_id: outAt ? 'p_out' : null })

test('across midnight: 10:30 PM Sep 14 to 1:15 AM Sep 15 is 90 + 75 minutes', () => {
  const parts = splitVisit(visit('v1', 'c1', at('2026-09-14', 22, 30), at('2026-09-15', 1, 15)))
  assert.deepEqual(parts.map((p) => [p.date, p.minutes, p.continues, p.continued]), [['2026-09-14', 90, true, false], ['2026-09-15', 75, false, true]])
  assert.equal(parts[0].end, '2026-09-15T02:30:00.000Z')
  const a = buildAttendance({ from: '2026-09-14', to: '2026-09-15', today: '2026-09-15', children: [kid('c1')], rooms: ROOMS, people: PEOPLE, absences: [],
    visits: [visit('v1', 'c1', at('2026-09-14', 22, 30), at('2026-09-15', 1, 15))] })
  assert.deepEqual(a.rows, [
    ['2026-09-14', 'c1 (SAMPLE)', 'A room', '10:30 PM', 'In P. (SAMPLE)', '1:15 AM Sep 15', 'Out P. (SAMPLE)', 90, '1.50', '', 'Continues past midnight'],
    ['2026-09-15', 'c1 (SAMPLE)', 'A room', '10:30 PM Sep 14', 'In P. (SAMPLE)', '1:15 AM', 'Out P. (SAMPLE)', 75, '1.25', '', 'Continued from the day before'],
  ])
  assert.deepEqual([a.json.children[0].minutes, a.json.children[0].days_present, a.json.totals], [165, 2, { minutes: 165, child_days: 2 }])
})

test('DST nights: fall back counts 300 real minutes from 11 PM to 3 AM; spring forward counts 180', () => {
  const fall = splitVisit(visit('v', 'c', at('2026-10-31', 23), at('2026-11-01', 3)))
  assert.deepEqual(fall.map((p) => [p.date, p.minutes]), [['2026-10-31', 60], ['2026-11-01', 240]])
  const spring = splitVisit(visit('v', 'c', at('2026-03-07', 23), at('2026-03-08', 3)))
  assert.deepEqual(spring.map((p) => [p.date, p.minutes]), [['2026-03-07', 60], ['2026-03-08', 120]])
})

test('a visit over two midnights has a middle part that continues and is continued', () => {
  const parts = splitVisit(visit('v', 'c', at('2026-09-14', 23), at('2026-09-16', 1)))
  assert.deepEqual(parts.map((p) => [p.date, p.minutes, p.continued, p.continues]),
    [['2026-09-14', 60, false, true], ['2026-09-15', 1440, true, true], ['2026-09-16', 60, true, false]])
})

test('open visit: present, 0 minutes, one part on its sign-in date, "Not signed out"', () => {
  const a = buildAttendance({ from: '2026-09-11', to: '2026-09-14', today: '2026-09-14', children: [kid('c1')], rooms: ROOMS, people: PEOPLE, absences: [],
    visits: [visit('v1', 'c1', at('2026-09-11', 9), null)] })
  const c = a.json.children[0]
  assert.deepEqual(c.days['2026-09-11'], { status: 'present', minutes: 0, open: true, still_here: false, absence: null,
    parts: [{ visit_id: 'v1', in_label: '9:00 AM', out_label: null, minutes: 0, continues: false, continued: false }] })
  assert.deepEqual(['2026-09-12', '2026-09-13', '2026-09-14'].map((d) => c.days[d].status), ['not_booked', 'not_booked', 'missing'])
  assert.deepEqual([c.minutes, c.days_present, c.not_signed_out], [0, 1, 1])
  assert.deepEqual(a.rows, [['2026-09-11', 'c1 (SAMPLE)', 'A room', '9:00 AM', 'In P. (SAMPLE)', '', '', 0, '0.00', '', 'Not signed out']])
  assert.deepEqual(a.summary.at(-1), ['Total', '', 1, 0, '0.00', 0, 0, 0, 0, 0, 0, 1])
})

test('open visit dated today: still here, no "Not signed out" flag; seen the next day it is not signed out', () => {
  const visits = [visit('v1', 'c1', at('2026-09-14', 9), null)]
  const input = { from: '2026-09-14', to: '2026-09-15', children: [kid('c1')], rooms: ROOMS, people: PEOPLE, absences: [], visits }
  const today = buildAttendance({ ...input, today: '2026-09-14' })
  const day = today.json.children[0].days['2026-09-14']
  assert.deepEqual([day.status, day.minutes, day.open, day.still_here], ['present', 0, true, true])
  assert.equal(today.json.children[0].not_signed_out, 0)
  assert.equal(today.rows[0][10], 'Still here')
  assert.equal(today.summary.at(-1)[11], 0)
  const next = buildAttendance({ ...input, today: '2026-09-15' })
  const later = next.json.children[0].days['2026-09-14']
  assert.deepEqual([later.open, later.still_here], [true, false])
  assert.equal(next.json.children[0].not_signed_out, 1)
  assert.equal(next.rows[0][10], 'Not signed out')
  assert.equal(next.summary.at(-1)[11], 1)
})

test('missing (today or before), upcoming (after today), not booked, away, not yet registered, and absence rows', () => {
  const a = buildAttendance({ from: '2026-09-14', to: '2026-09-16', today: '2026-09-15', rooms: ROOMS, people: PEOPLE, visits: [],
    children: [kid('c1'), kid('c2', { days: '["tue"]' }), kid('c3', { start_date: '2026-09-16', days: '["wed"]' }), kid('c4', { end_date: '2026-09-01' })],
    absences: [{ id: 'a1', child_id: 'c1', date: '2026-09-15', reason: 'sick', note: 'Fever.' }] })
  assert.deepEqual(a.json.children.map((c) => c.id), ['c1', 'c2', 'c3'], 'c4 ended before the range')
  const [c1, c2, c3] = a.json.children
  assert.deepEqual(Object.values(c1.days).map((d) => d.status), ['missing', 'away', 'upcoming'])
  assert.deepEqual(c1.days['2026-09-15'].absence, { id: 'a1', child_id: 'c1', date: '2026-09-15', reason: 'sick', reason_label: 'Sick', note: 'Fever.' })
  assert.deepEqual([c1.days_away, c1.away_by_reason], [1, { sick: 1, holiday: 0, appointment: 0, family: 0, other: 0 }])
  assert.deepEqual(Object.values(c2.days).map((d) => d.status), ['not_booked', 'missing', 'not_booked'])
  assert.deepEqual(Object.values(c3.days).map((d) => d.status), ['not_booked', 'not_booked', 'upcoming'])
  const later = buildAttendance({ from: '2026-09-14', to: '2026-09-16', today: '2026-09-16', rooms: ROOMS, people: PEOPLE, visits: [], absences: [], children: [kid('c1')] })
  assert.deepEqual(Object.values(later.json.children[0].days).map((d) => d.status), ['missing', 'missing', 'missing'], 'today itself is missing, not upcoming')
  assert.deepEqual(a.rows, [['2026-09-15', 'c1 (SAMPLE)', 'A room', '', '', '', '', 0, '0.00', 'Sick', 'Fever.']])
})

test('property: 300 seeded visits (1 minute to 30 hours, across midnights and both DST nights) add up by child and stay inside their dates', () => {
  let seed = 20260914
  const rand = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32
  const windows = [['2026-03-05', 8], ['2026-10-28', 8], ['2026-09-10', 5]]
  const children = ['c1', 'c2', 'c3', 'c4', 'c5'].map((id) => kid(id))
  const visits = []
  for (let i = 0; i < 300; i++) {
    const [first, span] = windows[i % windows.length]
    const day = new Date(Date.parse(`${first}T12:00:00Z`) + Math.floor(rand() * span) * 86400e3).toISOString().slice(0, 10)
    // A third of them start in the last hour before midnight, so many cross it.
    const start = i % 3 === 0 ? Date.parse(at(day, 23)) + Math.floor(rand() * 3600e3) : Date.parse(at(day, 0)) + Math.floor(rand() * 86400e3)
    const end = start + 60e3 + Math.floor(rand() * (30 * 3600e3 - 60e3))
    visits.push(visit(`v${i}`, children[i % 5].id, new Date(start).toISOString(), new Date(end).toISOString()))
  }
  const dates = visits.flatMap((v) => [localDate(v.in_at), localDate(v.out_at)]).sort()
  const a = buildAttendance({ from: dates[0], to: dates.at(-1), today: dates.at(-1), children, rooms: ROOMS, people: PEOPLE, absences: [], visits })
  let crossed = 0
  for (const c of a.json.children) {
    const whole = visits.filter((v) => v.child_id === c.id).reduce((s, v) => s + minutesBetween(v.in_at, v.out_at), 0)
    const byDay = Object.values(c.days).reduce((s, d) => s + d.minutes, 0)
    assert.equal(byDay, whole, `${c.id}: Σ day parts = Σ (out − in)`)
    assert.equal(c.minutes, whole)
  }
  for (const v of visits) {
    const parts = splitVisit(v)
    if (parts.length > 1) crossed++
    for (const p of parts) {
      assert.ok(p.minutes >= 0, 'no part is negative')
      assert.equal(localDate(p.start), p.date)
      assert.ok(p.start >= startOfDate(p.date).toISOString() && p.end <= endOfDate(p.date).toISOString(), `${v.id} part inside ${p.date}`)
    }
  }
  assert.ok(crossed > 100, `enough visits cross midnight to mean something (${crossed})`)
  assert.equal(a.summary.at(-1)[3], a.json.totals.minutes)
})

test('register moves: out and back from the homeroom, and a visit from another room', () => {
  const P = (room, h, m) => ({ room_id: room, start_at: at('2026-09-14', h, m) })
  const name = (id) => ({ r_i: 'Infant room', r_t: 'Toddler room' })[id]
  const ava = [P('r_i', 8, 5), P('r_t', 10, 0), P('r_i', 10, 40)]
  assert.deepEqual(movesLabels(ava, 'r_i', name), [{ label: 'Went to Toddler room 10:00 AM, back 10:40 AM' }])
  assert.deepEqual(movesLabels(ava, 'r_t', name), [{ label: 'Came from Infant room 10:00 AM, left 10:40 AM' }])
  assert.deepEqual(movesLabels([P('r_i', 8, 0), P('r_t', 15, 0)], 'r_i', name), [{ label: 'Went to Toddler room 3:00 PM' }])
  assert.deepEqual(movesLabels([P('r_i', 8, 0)], 'r_i', name), [])
})

test('CSV cells: quoting, the formula guard, CRLF, hours', () => {
  assert.equal(cell('Smith, "Junior" (SAMPLE)'), '"Smith, ""Junior"" (SAMPLE)"')
  assert.equal(cell('two\nlines'), '"two\nlines"')
  for (const s of ['=SUM(A1)', '+1', '-5', '@home', '\tx', '\rx']) assert.equal(cell(s)[s.startsWith('\r') ? 1 : 0] === "'" || cell(s).startsWith(`"'`), true, s)
  assert.equal(cell('=SUM(A1) (SAMPLE)'), "'=SUM(A1) (SAMPLE)")
  assert.equal(cell('-5 degrees, windy'), `"'-5 degrees, windy"`)
  assert.equal(cell(null), '')
  assert.equal(cell(0), '0')
  assert.equal(csvText([['a', 'b'], ['c', '']]), 'a,b\r\nc,\r\n')
  assert.deepEqual([hours(350), hours(90), hours(0), hours(1)], ['5.83', '1.50', '0.00', '0.02'])
})
