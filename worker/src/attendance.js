// Attendance: visits cut at every local midnight, per child and date, with the sums the office and its CSVs use.
// Pure: rows in, JSON and CSV rows out.
import { hours } from './csv.js'
import { absenceView, childBooked, REASON_LABELS } from './db.js'
import { addDays, dateLabel, endOfDate, localDate, minutesBetween, timeLabel } from './time.js'

export const REASONS = Object.keys(REASON_LABELS)

export function datesBetween(from, to) {
  const out = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

// A visit cut at every local midnight it crosses; each part belongs to its local date. An open visit (never signed out) is one
// part on its sign-in date with 0 minutes until a supervisor fixes the time.
export function splitVisit(v) {
  const outAt = v.out_at
  if (!outAt) return [{ date: localDate(v.in_at), start: v.in_at, end: null, minutes: 0, continues: false, continued: false, open: true }]
  const end = new Date(outAt).getTime()
  const parts = []
  let start = new Date(v.in_at).getTime()
  for (;;) {
    const date = localDate(start)
    const cut = endOfDate(date).getTime()
    const stop = Math.min(cut, end)
    parts.push({
      date, start: new Date(start).toISOString(), end: new Date(stop).toISOString(), minutes: minutesBetween(start, stop),
      continues: end > cut, continued: parts.length > 0, open: false,
    })
    if (end <= cut) return parts
    start = cut
  }
}

// "1:15 AM", or "1:15 AM Sep 15" when the instant is on another date than the row's.
const endLabel = (instant, date) => {
  const d = localDate(instant)
  return d === date ? timeLabel(instant) : `${timeLabel(instant)} ${dateLabel(d).slice(4)}`
}

const compare = (a, b) => {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue
    return typeof a[i] === 'number' ? a[i] - b[i] : String(a[i]).localeCompare(String(b[i]))
  }
  return 0
}

/**
 * today: the centre's date (booked dates after it are `upcoming`, not `missing`). children, rooms, people: rows; visits: every
 * visit that touches the range; absences: those dated in the range.
 * → { json: the attendance shape of docs/API.md, rows: attendance.csv rows, summary: attendance-summary.csv rows }
 */
export function buildAttendance({ from, to, today, children, rooms, visits, absences, people }) {
  const dates = datesBetween(from, to)
  const room = new Map(rooms.map((r) => [r.id, r]))
  const nameOf = new Map(people.map((p) => [p.id, p.name]))
  const key = (childId, date) => `${childId}|${date}`
  const partsOf = new Map()
  for (const v of visits) {
    for (const p of splitVisit(v)) {
      if (p.date < from || p.date > to) continue
      const k = key(v.child_id, p.date)
      partsOf.set(k, [...(partsOf.get(k) || []), { ...p, visit: v }])
    }
  }
  const absenceOf = new Map(absences.map((a) => [key(a.child_id, a.date), a]))
  const touched = new Set([...partsOf.keys(), ...absenceOf.keys()].map((k) => k.split('|')[0]))
  const registered = (ch) => ch.start_date <= to && (ch.end_date === null || ch.end_date >= from)
  const sortOf = (ch) => room.get(ch.home_room_id)?.sort ?? 0
  const list = children.filter((ch) => registered(ch) || touched.has(ch.id))
    .sort((a, b) => sortOf(a) - sortOf(b) || a.name.localeCompare(b.name))

  const rows = []
  const out = list.map((ch) => {
    const roomName = room.get(ch.home_room_id)?.name ?? ''
    const days = {}
    const byReason = Object.fromEntries(REASONS.map((r) => [r, 0]))
    let minutes = 0
    let present = 0
    let away = 0
    let open = 0
    for (const date of dates) {
      const parts = (partsOf.get(key(ch.id, date)) || []).sort((a, b) => compare([a.start], [b.start]))
      const absence = absenceOf.get(key(ch.id, date)) || null
      const dayMinutes = parts.reduce((sum, p) => sum + p.minutes, 0)
      const status = parts.length ? 'present' : absence ? 'away' : !childBooked(ch, date) ? 'not_booked' : date > today ? 'upcoming' : 'missing'
      minutes += dayMinutes
      if (status === 'present') present++
      if (status === 'away') {
        away++
        byReason[absence.reason]++
      }
      open += parts.filter((p) => p.open).length
      days[date] = {
        status, minutes: dayMinutes, open: parts.some((p) => p.open), absence: absence ? absenceView(absence) : null,
        parts: parts.map((p) => ({
          visit_id: p.visit.id, in_label: endLabel(p.visit.in_at, date), out_label: p.visit.out_at ? endLabel(p.visit.out_at, date) : null,
          minutes: p.minutes, continues: p.continues, continued: p.continued,
        })),
      }
      for (const [i, p] of parts.entries()) {
        const d = days[date].parts[i]
        const note = p.open ? 'Not signed out'
          : [p.continued ? 'Continued from the day before' : '', p.continues ? 'Continues past midnight' : ''].filter(Boolean).join('; ')
        rows.push({ sort: [date, sortOf(ch), ch.name, p.start], cells: [date, ch.name, roomName, d.in_label, nameOf.get(p.visit.in_person_id) ?? '',
          d.out_label ?? '', p.visit.out_at ? nameOf.get(p.visit.out_person_id) ?? '' : '', p.minutes, hours(p.minutes), '', note] })
      }
      if (absence) {
        rows.push({ sort: [date, sortOf(ch), ch.name, ''], cells: [date, ch.name, roomName, '', '', '', '', 0, hours(0),
          REASON_LABELS[absence.reason], absence.note] })
      }
    }
    return { id: ch.id, name: ch.name, room_name: roomName, days, minutes, days_present: present, days_away: away,
      away_by_reason: byReason, not_signed_out: open }
  })
  rows.sort((a, b) => compare(a.sort, b.sort))

  const summary = out.map((ch) => [ch.name, ch.room_name, ch.days_present, ch.minutes, hours(ch.minutes), ch.days_away,
    ...REASONS.map((r) => ch.away_by_reason[r]), ch.not_signed_out])
  const sum = (i) => summary.reduce((s, r) => s + r[i], 0)
  const totalMinutes = sum(3)
  const childDays = sum(2)
  summary.push(['Total', '', childDays, totalMinutes, hours(totalMinutes), sum(5), ...REASONS.map((_, j) => sum(6 + j)), sum(11)])

  return {
    json: { from, to, dates, children: out, totals: { minutes: totalMinutes, child_days: childDays } },
    rows: rows.map((r) => r.cells),
    summary,
  }
}

// The register's moves line for one visit's placements (time order), as seen from one homeroom.
export function movesLabels(placements, roomId, roomName) {
  const labels = []
  const told = new Set()
  for (let i = 1; i < placements.length; i++) {
    if (told.has(i)) continue
    const prev = placements[i - 1]
    const cur = placements[i]
    const next = placements[i + 1]
    if (prev.room_id === roomId && cur.room_id !== roomId) {
      const back = next && next.room_id === roomId
      if (back) told.add(i + 1)
      labels.push(`Went to ${roomName(cur.room_id)} ${timeLabel(cur.start_at)}${back ? `, back ${timeLabel(next.start_at)}` : ''}`)
    } else if (cur.room_id === roomId && prev.room_id !== roomId) {
      if (next) told.add(i + 1)
      labels.push(`Came from ${roomName(prev.room_id)} ${timeLabel(cur.start_at)}${next ? `, left ${timeLabel(next.start_at)}` : ''}`)
    }
  }
  return labels.map((label) => ({ label }))
}
