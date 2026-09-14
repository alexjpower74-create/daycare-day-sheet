// Office routes (supervisor only): children and their people, rooms, ratio rules, staff, absences, fixing a visit's times.
// Nothing is deleted except an absence: children end, people and staff go inactive, and time fixes keep the old times.
import { hashPin, PIN_RE, randomId, randomSaltHex, sameHex } from './auth.js'
import { absenceView, childView, findChild, personView, REASON_LABELS, roomView, ruleView, staffView, visitById } from './db.js'
import { ApiError, bad, badState, json, notFound } from './http.js'
import { initialsOf } from './sample.js'
import { endOfDate, isValidDate, localDate, localHHMM, localInstant, startOfDate, timeLabel, WEEKDAY_KEYS } from './time.js'
import { readBody } from './visits.js'

export const RATIO_NOTE = 'Numbers from the Child Care Regulations, NLR 39/17 section 54. Your licence may differ. Check it and change them here.'

const has = (b, k) => Object.hasOwn(b, k)
const all = async (stmt) => (await stmt.all()).results

// A trimmed one-line string of min to max characters, or null.
function line(v, min, max) {
  if (typeof v !== 'string' || /[\u0000-\u001f\u007f]/.test(v)) return null
  const t = v.trim()
  return t.length >= min && t.length <= max ? t : null
}

// A yes/no field: 1 or 0, the fallback when absent, 400 when it is not a boolean.
function yesNo(b, key, fallback) {
  if (!has(b, key)) return fallback
  if (typeof b[key] !== 'boolean') throw bad(key, 'Choose yes or no.')
  return b[key] ? 1 : 0
}

// ---------- children ----------

async function childOut(c, id) {
  const ch = await findChild(c, id)
  const [rooms, placed] = await c.db.batch([
    c.db.prepare('SELECT * FROM rooms'),
    c.db.prepare(`SELECT p.room_id FROM placements p JOIN visits v ON v.id = p.visit_id
      WHERE p.child_id = ? AND p.end_at IS NULL AND v.out_at IS NULL`).bind(id),
  ])
  return childView(ch, { today: c.today, rooms: new Map(rooms.results.map((r) => [r.id, r])), roomId: placed.results[0]?.room_id ?? null })
}

export async function officeChildren(c) {
  const [children, rooms, people, placements] = (await c.db.batch([
    c.db.prepare('SELECT * FROM children ORDER BY name'),
    c.db.prepare('SELECT * FROM rooms'),
    c.db.prepare('SELECT * FROM people ORDER BY sort, name'),
    c.db.prepare(`SELECT p.child_id, p.room_id FROM placements p JOIN visits v ON v.id = p.visit_id
      WHERE p.end_at IS NULL AND v.out_at IS NULL`),
  ])).map((r) => r.results)
  const roomMap = new Map(rooms.map((r) => [r.id, r]))
  const placed = new Map(placements.map((p) => [p.child_id, p.room_id]))
  const list = children.map((ch) => {
    const mine = people.filter((p) => p.child_id === ch.id)
    const emergency = mine.find((p) => p.active === 1 && p.emergency_contact === 1)
    return {
      ...childView(ch, { today: c.today, rooms: roomMap, roomId: placed.get(ch.id) ?? null }),
      people: mine.map(personView), emergency: emergency ? personView(emergency) : null,
    }
  })
  list.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name))
  return json({ children: list })
}

// One field at a time, in the order of docs/API.md. current = the stored child for PUT (partial), null for POST.
async function parseChild(c, b, current) {
  const out = {}
  const asked = (k) => !current || has(b, k)
  if (asked('name')) {
    out.name = line(b.name, 1, 60)
    if (!out.name) throw bad('name', "Enter the child's name, up to 60 characters.")
  }
  if (asked('dob')) {
    if (!isValidDate(b.dob) || b.dob > c.today) throw bad('dob', 'Enter a real date of birth that is not in the future.')
    out.dob = b.dob
  }
  if (asked('home_room_id')) {
    const room = typeof b.home_room_id === 'string'
      ? await c.db.prepare('SELECT id FROM rooms WHERE id = ? AND active = 1').bind(b.home_room_id).first() : null
    if (!room) throw bad('home_room_id', 'Pick a room that is open.')
    out.home_room_id = room.id
  }
  if (asked('schedule')) {
    if (b.schedule !== 'full_time' && b.schedule !== 'part_time') throw bad('schedule', 'Pick full time or part time.')
    out.schedule = b.schedule
  }
  if (asked('days')) {
    const d = b.days
    if (!Array.isArray(d) || d.length < 1 || d.length > 7 || !d.every((x) => WEEKDAY_KEYS.includes(x)) || new Set(d).size !== d.length) {
      throw bad('days', 'Pick the days the child comes, each day once.')
    }
    out.days = WEEKDAY_KEYS.filter((k) => d.includes(k))
  }
  if (asked('start_date')) {
    if (!isValidDate(b.start_date)) throw bad('start_date', 'Enter the first day as a real date.')
    out.start_date = b.start_date
  }
  const start = out.start_date ?? current?.start_date
  const end = asked('end_date') ? (b.end_date ?? null) : current.end_date
  if (end !== null && (!isValidDate(end) || end < start)) {
    throw bad('end_date', 'The last day must be a real date on or after the first day, or empty.')
  }
  out.end_date = end
  return out
}

export async function createChild(c) {
  const b = await readBody(c)
  const v = await parseChild(c, b, null)
  const id = randomId('c')
  await c.db.prepare(`INSERT INTO children (id, name, initials, dob, home_room_id, schedule, days, start_date, end_date)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    .bind(id, v.name, initialsOf(v.name), v.dob, v.home_room_id, v.schedule, JSON.stringify(v.days), v.start_date, v.end_date).run()
  return json({ child: await childOut(c, id) }, 201)
}

export async function updateChild(c) {
  const b = await readBody(c)
  const current = await findChild(c, c.params.id)
  const v = await parseChild(c, b, current)
  const n = { ...current, ...v, days: v.days ? JSON.stringify(v.days) : current.days }
  await c.db.prepare(`UPDATE children SET name = ?, initials = ?, dob = ?, home_room_id = ?, schedule = ?, days = ?, start_date = ?,
    end_date = ? WHERE id = ?`)
    .bind(n.name, initialsOf(n.name), n.dob, n.home_room_id, n.schedule, n.days, n.start_date, n.end_date, current.id).run()
  return json({ child: await childOut(c, current.id) })
}

// ---------- people ----------

function phoneOf(v) {
  if (v === null || v === '') return null
  const digits = typeof v === 'string' && /^[\d\s().+-]+$/.test(v) ? v.replace(/\D/g, '') : ''
  if (digits.length !== 10) throw bad('phone', 'Enter a 10-digit phone number, or leave it empty.')
  return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`
}

function parsePerson(b, current) {
  const out = {}
  if (!current || has(b, 'name')) {
    out.name = line(b.name, 1, 60)
    if (!out.name) throw bad('name', 'Enter the name, up to 60 characters.')
  }
  if (!current || has(b, 'relationship')) {
    out.relationship = line(b.relationship, 1, 40)
    if (!out.relationship) throw bad('relationship', 'Say who they are to the child, up to 40 characters.')
  }
  if (has(b, 'phone')) out.phone = phoneOf(b.phone)
  else if (!current) out.phone = null
  const pickUp = yesNo(b, 'may_pick_up', current ? undefined : 0)
  if (pickUp !== undefined) out.may_pick_up = pickUp
  const emergency = yesNo(b, 'emergency_contact', current ? undefined : 0)
  if (emergency !== undefined) out.emergency_contact = emergency
  return out
}

const personRow = (c, id) => c.db.prepare('SELECT * FROM people WHERE id = ?').bind(id).first()

export async function createPerson(c) {
  const b = await readBody(c)
  const child = await findChild(c, c.params.id)
  const v = parsePerson(b, null)
  const id = randomId('p')
  const writes = []
  // One emergency contact per child: setting it clears it on the others.
  if (v.emergency_contact) writes.push(c.db.prepare('UPDATE people SET emergency_contact = 0 WHERE child_id = ?').bind(child.id))
  writes.push(c.db.prepare(`INSERT INTO people (id, child_id, name, relationship, phone, may_pick_up, emergency_contact, active, sort)
    VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, 1, (SELECT COALESCE(MAX(sort), 0) + 1 FROM people WHERE child_id = ?2))`)
    .bind(id, child.id, v.name, v.relationship, v.phone, v.may_pick_up, v.emergency_contact))
  await c.db.batch(writes)
  return json({ person: personView(await personRow(c, id)) }, 201)
}

export async function updatePerson(c) {
  const b = await readBody(c)
  const p = await personRow(c, c.params.pid)
  if (!p) throw notFound("We couldn't find that person.")
  const n = { ...p, ...parsePerson(b, p) }
  const writes = []
  if (n.emergency_contact === 1 && p.emergency_contact !== 1) {
    writes.push(c.db.prepare('UPDATE people SET emergency_contact = 0 WHERE child_id = ? AND id <> ?').bind(p.child_id, p.id))
  }
  writes.push(c.db.prepare('UPDATE people SET name = ?, relationship = ?, phone = ?, may_pick_up = ?, emergency_contact = ? WHERE id = ?')
    .bind(n.name, n.relationship, n.phone, n.may_pick_up, n.emergency_contact, p.id))
  await c.db.batch(writes)
  return json({ person: personView(await personRow(c, p.id)) })
}

export async function deactivatePerson(c) {
  const p = await personRow(c, c.params.pid)
  if (!p) throw notFound("We couldn't find that person.")
  await c.db.prepare('UPDATE people SET active = 0, emergency_contact = 0 WHERE id = ?').bind(p.id).run()
  return json({ person: personView(await personRow(c, p.id)) })
}

// ---------- rooms ----------

async function parseRoom(c, b, current) {
  const out = {}
  if (!current || has(b, 'name')) {
    out.name = line(b.name, 1, 40)
    if (!out.name) throw bad('name', 'Enter the room name, up to 40 characters.')
  }
  if (!current || has(b, 'age_group')) {
    const rule = typeof b.age_group === 'string'
      ? await c.db.prepare('SELECT age_group FROM ratio_rules WHERE age_group = ?').bind(b.age_group).first() : null
    if (!rule) throw bad('age_group', 'Pick an age group.')
    out.age_group = rule.age_group
  }
  const active = yesNo(b, 'active', current ? undefined : 1)
  if (active !== undefined) out.active = active
  if (has(b, 'sort')) {
    if (!Number.isInteger(b.sort) || b.sort < 0 || b.sort > 999) throw bad('sort', 'Enter a whole number from 0 to 999.')
    out.sort = b.sort
  }
  return out
}

const roomRow = (c, id) => c.db.prepare('SELECT * FROM rooms WHERE id = ?').bind(id).first()

export async function officeRooms(c) {
  return json({ rooms: (await all(c.db.prepare('SELECT * FROM rooms ORDER BY sort, name'))).map(roomView) })
}

export async function createRoom(c) {
  const b = await readBody(c)
  const v = await parseRoom(c, b, null)
  const id = randomId('r')
  await c.db.prepare(`INSERT INTO rooms (id, name, age_group, active, sort)
    VALUES (?, ?, ?, ?, COALESCE(?, (SELECT COALESCE(MAX(sort), 0) + 1 FROM rooms)))`)
    .bind(id, v.name, v.age_group, v.active, v.sort ?? null).run()
  return json({ room: roomView(await roomRow(c, id)) }, 201)
}

export async function updateRoom(c) {
  const b = await readBody(c)
  const room = await roomRow(c, c.params.id)
  if (!room) throw notFound("We couldn't find that room.")
  const n = { ...room, ...(await parseRoom(c, b, room)) }
  const closing = room.active === 1 && n.active === 0
  // Closing and the "no children signed in" check are one statement, so a sign-in cannot slip between them.
  const [r] = await c.db.batch([
    c.db.prepare(`UPDATE rooms SET name = ?1, age_group = ?2, active = ?3, sort = ?4 WHERE id = ?5
      AND NOT (?6 AND EXISTS (SELECT 1 FROM placements p JOIN visits v ON v.id = p.visit_id
        WHERE p.room_id = ?5 AND p.end_at IS NULL AND v.out_at IS NULL))`)
      .bind(n.name, n.age_group, n.active, n.sort, room.id, closing ? 1 : 0),
    c.db.prepare(`UPDATE presence SET end_at = ?1 WHERE room_id = ?2 AND end_at IS NULL
      AND (SELECT active FROM rooms WHERE id = ?2) = 0`).bind(c.nowIso, room.id),
  ])
  if (r.meta.changes === 0) throw badState(`${room.name} has children signed in. Move them to another room or sign them out first.`)
  return json({ room: roomView(await roomRow(c, room.id)) })
}

// ---------- ratio rules ----------

const ruleRow = (c, group) => c.db.prepare('SELECT * FROM ratio_rules WHERE age_group = ?').bind(group).first()

export async function officeRatios(c) {
  const rules = await all(c.db.prepare('SELECT * FROM ratio_rules ORDER BY sort'))
  return json({ rules: rules.map(ruleView), note: RATIO_NOTE })
}

export async function putRatio(c) {
  const rule = await ruleRow(c, c.params.age_group)
  if (!rule) throw notFound("We couldn't find that age group.")
  const body = await readBody(c)
  const next = { children_per_caregiver: rule.children_per_caregiver, max_children: rule.max_children }
  for (const [key, most] of [['children_per_caregiver', 50], ['max_children', 60]]) {
    if (!has(body, key)) continue
    const v = body[key]
    if (v !== null && !(Number.isInteger(v) && v >= 1 && v <= most)) {
      throw bad(key, `Enter a whole number from 1 to ${most}, or leave it empty.`)
    }
    next[key] = v
  }
  await c.db.prepare('UPDATE ratio_rules SET children_per_caregiver = ?, max_children = ? WHERE age_group = ?')
    .bind(next.children_per_caregiver, next.max_children, rule.age_group).run()
  return json({ rule: ruleView(await ruleRow(c, rule.age_group)) })
}

export async function resetRatio(c) {
  const rule = await ruleRow(c, c.params.age_group)
  if (!rule) throw notFound("We couldn't find that age group.")
  await c.db.prepare(`UPDATE ratio_rules SET children_per_caregiver = default_children_per_caregiver,
    max_children = default_max_children WHERE age_group = ?`).bind(rule.age_group).run()
  return json({ rule: ruleView(await ruleRow(c, rule.age_group)) })
}

// ---------- staff ----------

const staffRow = (c, id) => c.db.prepare('SELECT * FROM staff WHERE id = ?').bind(id).first()
const pinTakenError = () => new ApiError(409, 'pin_taken', 'Another staff member already has that PIN.', { field: 'pin' })

// PINs are salted per staff member, so uniqueness means hashing the new PIN with each other member's salt.
async function pinTaken(c, pin, exceptId = '') {
  for (const s of await all(c.db.prepare('SELECT pin_hash, pin_salt FROM staff WHERE id <> ?').bind(exceptId))) {
    if (sameHex(await hashPin(pin, s.pin_salt), s.pin_hash)) return true
  }
  return false
}

function parseStaff(b, current) {
  const out = {}
  if (!current || has(b, 'name')) {
    out.name = line(b.name, 1, 60)
    if (!out.name) throw bad('name', 'Enter the name, up to 60 characters.')
  }
  if (!current || has(b, 'role')) {
    if (b.role !== 'supervisor' && b.role !== 'educator') throw bad('role', 'Pick supervisor or educator.')
    out.role = b.role
  }
  const active = yesNo(b, 'active', current ? undefined : 1)
  if (active !== undefined) out.active = active
  if (!current || has(b, 'pin')) {
    if (typeof b.pin !== 'string' || !PIN_RE.test(b.pin)) throw bad('pin', 'Enter a PIN of 4 to 6 digits.')
    out.pin = b.pin
  }
  return out
}

export async function officeStaff(c) {
  return json({ staff: (await all(c.db.prepare('SELECT * FROM staff ORDER BY active DESC, name'))).map(staffView) })
}

export async function createStaff(c) {
  const b = await readBody(c)
  const v = parseStaff(b, null)
  if (await pinTaken(c, v.pin)) throw pinTakenError()
  const id = randomId('s')
  const salt = randomSaltHex()
  await c.db.prepare('INSERT INTO staff (id, name, initials, role, active, pin_hash, pin_salt) VALUES (?, ?, ?, ?, ?, ?, ?)')
    .bind(id, v.name, initialsOf(v.name), v.role, v.active, await hashPin(v.pin, salt), salt).run()
  return json({ staff: staffView(await staffRow(c, id)) }, 201)
}

export async function updateStaff(c) {
  const b = await readBody(c)
  const s = await staffRow(c, c.params.id)
  if (!s) throw notFound("We couldn't find that staff member.")
  const v = parseStaff(b, s)
  const n = { ...s, ...v }
  if (s.role === 'supervisor' && s.active === 1 && (n.role !== 'supervisor' || n.active !== 1)) {
    const others = await c.db.prepare("SELECT COUNT(*) AS n FROM staff WHERE role = 'supervisor' AND active = 1 AND id <> ?").bind(s.id).first()
    if (others.n === 0) throw badState('There must always be an active supervisor. Add another supervisor first.')
  }
  if (v.pin !== undefined) {
    if (await pinTaken(c, v.pin, s.id)) throw pinTakenError()
    n.pin_salt = randomSaltHex()
    n.pin_hash = await hashPin(v.pin, n.pin_salt)
  }
  await c.db.batch([
    c.db.prepare('UPDATE staff SET name = ?, initials = ?, role = ?, active = ?, pin_hash = ?, pin_salt = ? WHERE id = ?')
      .bind(n.name, initialsOf(n.name), n.role, n.active, n.pin_hash, n.pin_salt, s.id),
    // Someone made inactive is no longer counted in a room.
    c.db.prepare('UPDATE presence SET end_at = ? WHERE staff_id = ? AND end_at IS NULL AND ? = 0').bind(c.nowIso, s.id, n.active),
  ])
  return json({ staff: staffView(await staffRow(c, s.id)) })
}

// ---------- absences ----------

export async function createAbsence(c) {
  const b = await readBody(c)
  const child = typeof b.child_id === 'string' ? await c.db.prepare('SELECT * FROM children WHERE id = ?').bind(b.child_id).first() : null
  if (!child) throw bad('child_id', 'Pick a child.')
  if (!isValidDate(b.date)) throw bad('date', 'Enter a real date.')
  if (!Object.hasOwn(REASON_LABELS, b.reason)) throw bad('reason', 'Pick a reason.')
  const note = b.note === undefined || b.note === null ? '' : typeof b.note === 'string' ? b.note.trim() : null
  if (note === null || note.length > 200) throw bad('note', 'Keep the note to 200 characters.')
  const came = await c.db.prepare(`SELECT 1 FROM visits WHERE child_id = ?1 AND in_at < ?2
    AND ((out_at IS NULL AND date = ?3) OR out_at > ?4) LIMIT 1`)
    .bind(child.id, endOfDate(b.date).toISOString(), b.date, startOfDate(b.date).toISOString()).first()
  if (came) throw badState(`${child.name} was signed in that day.`)
  const id = randomId('a')
  try {
    await c.db.prepare('INSERT INTO absences (id, child_id, date, reason, note, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
      .bind(id, child.id, b.date, b.reason, note, c.nowIso, c.staff.id).run()
  } catch (e) {
    if (/UNIQUE constraint/i.test(String(e?.message))) throw badState(`${child.name} is already marked away that day.`)
    throw e
  }
  return json({ absence: absenceView(await c.db.prepare('SELECT * FROM absences WHERE id = ?').bind(id).first()) }, 201)
}

export async function deleteAbsence(c) {
  const r = await c.db.prepare('DELETE FROM absences WHERE id = ?').bind(c.params.id).run()
  if (r.meta.changes === 0) throw notFound("We couldn't find that absence.")
  return json({ ok: true })
}

// ---------- fixing a time ----------

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/

export async function fixVisit(c) {
  const b = await readBody(c)
  const v = await c.db.prepare('SELECT * FROM visits WHERE id = ?').bind(c.params.id).first()
  if (!v) throw notFound("We couldn't find that visit.")
  const child = await findChild(c, v.child_id)
  const reason = line(b.reason, 3, 200)
  if (!reason) throw bad('reason', 'Say why the time is changing, in 3 to 200 characters.')
  // A changed end: the date and time given, the stored one for whatever is not given.
  const pick = (which, fallbackDate) => {
    const dk = `${which}_date`
    const tk = `${which}_time`
    const current = v[`${which}_at`]
    if (!has(b, dk) && !has(b, tk)) return current
    const date = has(b, dk) ? b[dk] : current ? localDate(current) : fallbackDate
    const hhmm = has(b, tk) ? b[tk] : current ? localHHMM(current) : null
    if (!isValidDate(date)) throw bad(dk, 'Enter a real date.')
    const m = typeof hhmm === 'string' ? hhmm.match(HHMM) : null
    if (!m) throw bad(tk, 'Enter the time as HH:MM, for example 16:30.')
    const at = localInstant(date, Number(m[1]), Number(m[2]))
    if (!at) throw bad(tk, 'That time did not happen: the clocks moved forward that night.')
    return at.toISOString()
  }
  const inAt = pick('in')
  const outAt = pick('out', localDate(inAt))
  if (inAt === v.in_at && outAt === v.out_at) throw bad('out_time', 'Change the time in or the time out.')
  if (Date.parse(inAt) > c.now.getTime()) throw bad('in_time', 'That time has not happened yet.')
  if (outAt && Date.parse(outAt) > c.now.getTime()) throw bad('out_time', 'That time has not happened yet.')
  if (outAt && outAt <= inAt) throw bad('out_time', 'The time out must be after the time in.')
  const overlap = await c.db.prepare(`SELECT 1 FROM visits WHERE child_id = ? AND id <> ? AND in_at < ?
    AND (out_at IS NULL OR out_at > ?) LIMIT 1`).bind(v.child_id, v.id, outAt ?? '9999', inAt).first()
  if (overlap) throw bad('in_time', `That overlaps another visit for ${child.name}.`)
  const places = await all(c.db.prepare('SELECT * FROM placements WHERE visit_id = ? ORDER BY start_at, rowid').bind(v.id))
  const first = places[0]
  const last = places[places.length - 1]
  if (places.length > 1 && inAt >= first.end_at) {
    throw bad('in_time', `${child.name} moved rooms at ${timeLabel(first.end_at)}. The time in must be before that.`)
  }
  if (places.length > 1 && outAt && outAt <= last.start_at) {
    throw bad('out_time', `${child.name} moved rooms at ${timeLabel(last.start_at)}. The time out must be after that.`)
  }
  const writes = [
    c.db.prepare('UPDATE visits SET in_at = ?, date = ?, out_at = ? WHERE id = ?').bind(inAt, localDate(inAt), outAt, v.id),
    c.db.prepare(`INSERT INTO visit_edits (id, visit_id, at, by_staff_id, reason, old_in_at, old_out_at, new_in_at, new_out_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(randomId('e'), v.id, c.nowIso, c.staff.id, reason, v.in_at, v.out_at, inAt, outAt),
  ]
  if (first) writes.push(c.db.prepare('UPDATE placements SET start_at = ? WHERE id = ?').bind(inAt, first.id))
  // Closing an open visit closes its placement at that time too.
  if (last && outAt) writes.push(c.db.prepare('UPDATE placements SET end_at = ? WHERE id = ?').bind(outAt, last.id))
  await c.db.batch(writes)
  return json({ visit: await visitById(c, v.id) })
}
