// Office reports: attendance (JSON and two CSVs) and the printed daily register of one homeroom.
import { buildAttendance, movesLabels } from './attendance.js'
import { ATTENDANCE_HEADER, csvText, SUMMARY_HEADER } from './csv.js'
import { editsFor, visitView } from './db.js'
import { bad, json } from './http.js'
import { addDays, endOfDate, isValidDate, longLabel, startOfDate } from './time.js'

export const MAX_RANGE_DAYS = 92
export const KEPT_NOTE = 'Daily registers are kept for at least 7 years (NLR 39/17 s.45(3)).'

const byId = (rows) => new Map(rows.map((r) => [r.id, r]))

function range(c) {
  const from = c.url.searchParams.get('from')
  const to = c.url.searchParams.get('to')
  if (!isValidDate(from)) throw bad('from', 'Pick the first date.')
  if (!isValidDate(to)) throw bad('to', 'Pick the last date.')
  if (to < from) throw bad('to', 'The last date must be on or after the first date.')
  if (addDays(from, MAX_RANGE_DAYS - 1) < to) throw bad('to', `Pick at most ${MAX_RANGE_DAYS} days.`)
  return { from, to }
}

async function loadAttendance(c) {
  const { from, to } = range(c)
  const [children, rooms, visits, absences, people] = (await c.db.batch([
    c.db.prepare('SELECT * FROM children'),
    c.db.prepare('SELECT * FROM rooms'),
    c.db.prepare('SELECT * FROM visits WHERE in_at < ? AND (out_at IS NULL OR out_at > ?) ORDER BY in_at, rowid')
      .bind(endOfDate(to).toISOString(), startOfDate(from).toISOString()),
    c.db.prepare('SELECT * FROM absences WHERE date BETWEEN ? AND ?').bind(from, to),
    c.db.prepare('SELECT id, name FROM people'),
  ])).map((r) => r.results)
  return buildAttendance({ from, to, children, rooms, visits, absences, people })
}

export async function attendance(c) {
  return json((await loadAttendance(c)).json)
}

const csvAnswer = (text, filename) => new Response(text, {
  headers: {
    'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store',
  },
})

export async function attendanceCsv(c) {
  const a = await loadAttendance(c)
  return csvAnswer(csvText([ATTENDANCE_HEADER, ...a.rows]), `attendance-${a.json.from}-to-${a.json.to}.csv`)
}

export async function summaryCsv(c) {
  const a = await loadAttendance(c)
  return csvAnswer(csvText([SUMMARY_HEADER, ...a.summary]), `attendance-summary-${a.json.from}-to-${a.json.to}.csv`)
}

// Rows are the children with a placement in that room that day (their own homeroom, or a visit from another room).
export async function register(c) {
  const date = c.url.searchParams.get('date')
  if (!isValidDate(date)) throw bad('date', 'Pick a date.')
  const roomId = c.url.searchParams.get('room_id')
  const room = roomId ? await c.db.prepare('SELECT * FROM rooms WHERE id = ?').bind(roomId).first() : null
  if (!room) throw bad('room_id', 'Pick a room.')
  const start = startOfDate(date).toISOString()
  const end = endOfDate(date).toISOString()
  const touches = 'v.in_at < ?1 AND ((v.out_at IS NULL AND v.date = ?3) OR v.out_at > ?2)'
  const [centre, visits, placements, children, people, staff, rooms] = (await c.db.batch([
    c.db.prepare('SELECT * FROM centre WHERE id = 1'),
    c.db.prepare(`SELECT v.* FROM visits v WHERE ${touches} ORDER BY v.in_at, v.rowid`).bind(end, start, date),
    c.db.prepare(`SELECT p.* FROM placements p JOIN visits v ON v.id = p.visit_id WHERE ${touches} ORDER BY p.start_at, p.rowid`)
      .bind(end, start, date),
    c.db.prepare('SELECT * FROM children'),
    c.db.prepare('SELECT * FROM people'),
    c.db.prepare('SELECT * FROM staff'),
    c.db.prepare('SELECT * FROM rooms'),
  ])).map((r) => r.results)
  const edits = await editsFor(c.db, visits.map((v) => v.id))
  const look = { people: byId(people), staff: byId(staff) }
  const roomMap = byId(rooms)
  const childMap = byId(children)
  const here = new Set(placements.filter((p) => p.room_id === room.id && p.start_at < end && (p.end_at === null || p.end_at > start))
    .map((p) => p.child_id))
  const rows = [...here].map((id) => childMap.get(id)).sort((a, b) => a.name.localeCompare(b.name)).map((ch) => {
    const mine = visits.filter((v) => v.child_id === ch.id)
    const emergency = people.find((p) => p.child_id === ch.id && p.active === 1 && p.emergency_contact === 1)
    return {
      child: { name: ch.name, dob: ch.dob },
      emergency: emergency ? { name: emergency.name, relationship: emergency.relationship, phone: emergency.phone } : null,
      visits: mine.map((v) => visitView(v, { ...look, edits: edits.get(v.id) || [] })),
      moves: mine.flatMap((v) => movesLabels(placements.filter((p) => p.visit_id === v.id), room.id,
        (id) => roomMap.get(id)?.name ?? '')),
    }
  })
  return json({
    centre_name: centre[0].name, sample: centre[0].sample === 1, date, long_label: longLabel(date),
    room: { id: room.id, name: room.name }, rows, kept_note: KEPT_NOTE,
  })
}
