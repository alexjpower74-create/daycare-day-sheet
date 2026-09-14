// Reads shared by the routes, and the JSON shapes of docs/API.md "Shapes".
import { notFound } from './http.js'
import { meter } from './ratio.js'
import { signatureSvg } from './signature.js'
import { addDays, ageLabel, dateLabel, endOfDate, localDate, startOfDate, timeLabel, weekdayKey } from './time.js'

export const REASON_LABELS = { sick: 'Sick', holiday: 'Holiday', appointment: 'Appointment', family: 'Family reasons', other: 'Other' }

const byId = (rows) => new Map(rows.map((r) => [r.id, r]))

export const personView = (p) => ({
  id: p.id, child_id: p.child_id, name: p.name, relationship: p.relationship, may_pick_up: p.may_pick_up === 1,
  emergency_contact: p.emergency_contact === 1, active: p.active === 1, phone: p.phone,
})
export const absenceView = (a) => ({ id: a.id, child_id: a.child_id, date: a.date, reason: a.reason, reason_label: REASON_LABELS[a.reason], note: a.note })

export const roomView = (r) => ({ id: r.id, name: r.name, age_group: r.age_group, active: r.active === 1, sort: r.sort })
export const staffView = (s) => ({ id: s.id, name: s.name, initials: s.initials, role: s.role, active: s.active === 1 })

export function ruleView(r) {
  return {
    age_group: r.age_group, label: r.label, children_per_caregiver: r.children_per_caregiver, max_children: r.max_children,
    default_children_per_caregiver: r.default_children_per_caregiver, default_max_children: r.default_max_children,
    citation: r.citation,
    edited: r.children_per_caregiver !== r.default_children_per_caregiver || r.max_children !== r.default_max_children,
  }
}

// Registered today: no end date, or an end date today or later.
export const childActive = (ch, today) => ch.end_date === null || ch.end_date >= today

export const childBooked = (ch, date) =>
  ch.start_date <= date && (ch.end_date === null || ch.end_date >= date) && JSON.parse(ch.days).includes(weekdayKey(date))

export function childView(ch, { today, rooms, roomId = null }) {
  const room = rooms.get(roomId ?? ch.home_room_id)
  return {
    id: ch.id, name: ch.name, initials: ch.initials, dob: ch.dob, age_label: ageLabel(ch.dob, today),
    home_room_id: ch.home_room_id, room_id: roomId, room_name: room ? room.name : null, schedule: ch.schedule,
    days: JSON.parse(ch.days), start_date: ch.start_date, end_date: ch.end_date, active: childActive(ch, today),
  }
}

export async function findChild(c, id) {
  const ch = await c.db.prepare('SELECT * FROM children WHERE id = ?').bind(id).first()
  if (!ch) throw notFound("We couldn't find that child.")
  return ch
}

export async function lookups(db) {
  const [rooms, people, staff] = await db.batch([
    db.prepare('SELECT * FROM rooms ORDER BY sort, name'),
    db.prepare('SELECT * FROM people ORDER BY child_id, sort, name'),
    db.prepare('SELECT * FROM staff ORDER BY name'),
  ])
  return { rooms: byId(rooms.results), people: byId(people.results), staff: byId(staff.results) }
}

// ---------- the live meters ----------

// Every room's meter, keyed by room id, from one consistent read.
export async function loadMeters(db) {
  const [rooms, rules, kids, staff] = await db.batch([
    db.prepare('SELECT * FROM rooms ORDER BY sort, name'),
    db.prepare('SELECT * FROM ratio_rules'),
    db.prepare(`SELECT p.room_id, v.child_id FROM placements p JOIN visits v ON v.id = p.visit_id
      WHERE p.end_at IS NULL AND v.out_at IS NULL ORDER BY v.in_at, v.rowid`),
    db.prepare('SELECT room_id FROM presence WHERE end_at IS NULL'),
  ])
  // Children with an open visit whose open placement is the room, in the order they were signed in.
  const present = kids.results
  const ruleOf = new Map(rules.results.map((r) => [r.age_group, r]))
  const meters = new Map()
  for (const room of rooms.results) {
    const rule = ruleOf.get(room.age_group)
    meters.set(room.id, meter({
      room_id: room.id, room_name: room.name, age_group: room.age_group,
      children: present.filter((k) => k.room_id === room.id).length,
      staff: staff.results.filter((s) => s.room_id === room.id).length,
      children_per_caregiver: rule ? rule.children_per_caregiver : null, max_children: rule ? rule.max_children : null,
    }))
  }
  return { rooms: rooms.results, meters }
}

export const activeMeters = ({ rooms, meters }) => rooms.filter((r) => r.active === 1).map((r) => meters.get(r.id))

// ---------- visits ----------

export const awaitingOf = (v) =>
  v.in_recorded_by && !v.in_signature ? 'in' : v.out_at && v.out_recorded_by && !v.out_signature ? 'out' : null

const svgOf = (json) => (json ? signatureSvg(JSON.parse(json)) : null)

export async function editsFor(db, visitIds) {
  const out = new Map()
  if (!visitIds.length) return out
  const { results } = await db.prepare(`SELECT * FROM visit_edits WHERE visit_id IN (${visitIds.map(() => '?').join(', ')})
    ORDER BY at, rowid`).bind(...visitIds).all()
  for (const e of results) out.set(e.visit_id, [...(out.get(e.visit_id) || []), e])
  return out
}

function editView(e, staff) {
  const t = (iso) => (iso ? `${timeLabel(iso)} ${dateLabel(localDate(iso))}` : 'not signed out')
  const what = []
  if (e.old_in_at !== e.new_in_at) what.push(`In ${t(e.old_in_at)} changed to ${t(e.new_in_at)}`)
  if (e.old_out_at !== e.new_out_at) what.push(`Out ${t(e.old_out_at)} changed to ${t(e.new_out_at)}`)
  return {
    at_label: `${dateLabel(localDate(e.at))}, ${timeLabel(e.at)}`, by: staff.get(e.by_staff_id)?.name ?? '', reason: e.reason,
    what: what.join('. '),
  }
}

export function visitView(v, { people, staff, edits = [] }) {
  const person = (id) => {
    const p = people.get(id)
    return p ? { id: p.id, name: p.name, relationship: p.relationship } : null
  }
  const recorder = (id) => {
    const s = id ? staff.get(id) : null
    return s ? { id: s.id, initials: s.initials } : null
  }
  return {
    id: v.id, child_id: v.child_id, date: v.date,
    in_at: v.in_at, in_label: timeLabel(v.in_at), in_by: person(v.in_person_id), in_signature_svg: svgOf(v.in_signature),
    in_recorded_by: recorder(v.in_recorded_by),
    out_at: v.out_at, out_label: v.out_at ? timeLabel(v.out_at) : null, out_by: v.out_at ? person(v.out_person_id) : null,
    out_signature_svg: svgOf(v.out_signature), out_recorded_by: recorder(v.out_recorded_by),
    awaiting_signature: awaitingOf(v), edited: edits.length > 0, edits: edits.map((e) => editView(e, staff)),
  }
}

export async function visitById(c, id) {
  const v = await c.db.prepare('SELECT * FROM visits WHERE id = ?').bind(id).first()
  if (!v) return null
  const [look, edits] = await Promise.all([lookups(c.db), editsFor(c.db, [v.id])])
  return visitView(v, { ...look, edits: edits.get(v.id) || [] })
}

// ---------- today, for the door and the staff phones ----------

export async function loadDay(c) {
  const today = c.today
  const s = (sql, ...binds) => c.db.prepare(sql).bind(...binds)
  const res = await c.db.batch([
    s('SELECT * FROM centre WHERE id = 1'),
    s('SELECT * FROM rooms ORDER BY sort, name'),
    s('SELECT * FROM children ORDER BY name'),
    s('SELECT * FROM people ORDER BY child_id, sort, name'),
    s('SELECT * FROM staff ORDER BY name'),
    s(`SELECT * FROM visits WHERE out_at IS NULL OR date = ?1 OR (out_at >= ?2 AND out_at < ?3) ORDER BY in_at, rowid`,
      today, startOfDate(today).toISOString(), endOfDate(today).toISOString()),
    s('SELECT * FROM absences WHERE date = ?', today),
    s(`SELECT * FROM visits WHERE date >= ? AND ((in_recorded_by IS NOT NULL AND in_signature IS NULL)
      OR (out_at IS NOT NULL AND out_recorded_by IS NOT NULL AND out_signature IS NULL)) ORDER BY in_at, rowid`, addDays(today, -13)),
    s('SELECT * FROM placements WHERE end_at IS NULL'),
  ])
  const [centre, rooms, children, people, staff, visits, absences, pending, placements] = res.map((r) => r.results)
  const start = startOfDate(today).toISOString()
  const end = endOfDate(today).toISOString()
  const ctx = {
    today, centre: centre[0], roomRows: rooms, rooms: byId(rooms), children, people: byId(people), peopleRows: people,
    staff: byId(staff), visits, pending,
    open: new Map(visits.filter((v) => v.out_at === null).map((v) => [v.child_id, v])),
    absence: new Map(absences.map((a) => [a.child_id, a])),
    placement: new Map(placements.map((p) => [p.child_id, p.room_id])),
    pendingChildren: new Set(pending.map((v) => v.child_id)),
  }
  ctx.status = (ch) => {
    const open = ctx.open.get(ch.id)
    if (open) return { status: 'in', status_label: `In since ${timeLabel(open.in_at)}` }
    const outs = visits.filter((v) => v.child_id === ch.id && v.out_at && v.out_at >= start && v.out_at < end).map((v) => v.out_at).sort()
    if (outs.length) return { status: 'gone_home', status_label: `Gone home at ${timeLabel(outs[outs.length - 1])}` }
    const away = ctx.absence.get(ch.id)
    if (away) return { status: 'away', status_label: `Away today: ${REASON_LABELS[away.reason]}` }
    if (!childBooked(ch, today)) return { status: 'not_booked', status_label: 'Not booked today' }
    return { status: 'not_in_yet', status_label: 'Not in yet' }
  }
  // The room a child shows under: where they are placed now, else their home room.
  ctx.roomOf = (ch) => ctx.placement.get(ch.id) ?? ch.home_room_id
  ctx.childView = (ch) => childView(ch, { today, rooms: ctx.rooms, roomId: ctx.placement.get(ch.id) ?? null })
  // Registered children, plus anyone still signed in.
  ctx.listed = children.filter((ch) => childActive(ch, today) || ctx.open.has(ch.id))
  ctx.sortByRoom = (list) => [...list].sort((a, b) => {
    const ra = ctx.rooms.get(ctx.roomOf(a))
    const rb = ctx.rooms.get(ctx.roomOf(b))
    return (ra?.sort ?? 0) - (rb?.sort ?? 0) || a.name.localeCompare(b.name)
  })
  ctx.visitView = (v) => visitView(v, { people: ctx.people, staff: ctx.staff })
  return ctx
}

// ---------- the daily note ----------

export async function loadNote(c, childId, date, buildNote) {
  const s = (sql, ...binds) => c.db.prepare(sql).bind(...binds)
  const res = await c.db.batch([
    s('SELECT * FROM centre WHERE id = 1'),
    s('SELECT * FROM children WHERE id = ?', childId),
    s('SELECT * FROM rooms'),
    s('SELECT * FROM visits WHERE child_id = ? AND date = ? ORDER BY in_at, rowid', childId, date),
    s('SELECT * FROM logs WHERE child_id = ? AND date = ? AND voided = 0 ORDER BY at, rowid', childId, date),
    s(`SELECT p.room_id, MIN(p.start_at) AS first_at FROM placements p JOIN visits v ON v.id = p.visit_id
      WHERE v.child_id = ? AND v.date = ? GROUP BY p.room_id ORDER BY first_at`, childId, date),
    s('SELECT * FROM room_activity WHERE date = ?', date),
    s('SELECT * FROM note_lines WHERE child_id = ? AND date = ?', childId, date),
    s('SELECT * FROM people WHERE child_id = ?', childId),
    s('SELECT * FROM staff'),
  ])
  const [centre, child, rooms, visits, logs, placed, activity, lines, people, staff] = res.map((r) => r.results)
  if (!child[0]) throw notFound("We couldn't find that child.")
  const roomMap = byId(rooms)
  const activityOf = new Map(activity.map((a) => [a.room_id, a]))
  return buildNote({
    centre: centre[0], child: child[0], room: roomMap.get(child[0].home_room_id), date, visits, logs,
    activities: placed.map((p) => ({ room_id: p.room_id, room_name: roomMap.get(p.room_id)?.name ?? '', text: activityOf.get(p.room_id)?.text ?? '',
      updated_at: activityOf.get(p.room_id)?.updated_at ?? null })),
    noteLine: lines[0] || null, people: byId(people), staff: byId(staff), now: c.now,
  })
}
