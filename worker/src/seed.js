// Test-only data (TEST_MODE=1): the SAMPLE centre (reset) and the demo seed around "today".
import { hashPin, randomId, randomSaltHex, randomToken, sha256Hex } from './auth.js'
import { childBooked } from './db.js'
import {
  initialsOf, SAMPLE_CENTRE, SAMPLE_CHILDREN, SAMPLE_PEOPLE, SAMPLE_ROOMS, SAMPLE_RULES, SAMPLE_STAFF,
} from './sample.js'
import { addDays, endOfDate, localInstant, weekdayKey } from './time.js'

let sampleStaff = null // PBKDF2 of the SAMPLE PINs, once per isolate (each staff member still has their own salt)

const TABLES = ['sessions', 'pin_attempts', 'note_links', 'note_lines', 'room_activity', 'logs', 'visit_edits', 'placements',
  'presence', 'absences', 'visits', 'people', 'children', 'staff', 'rooms', 'ratio_rules', 'centre']

// Wipe everything, then the SAMPLE centre of docs/API.md with no visits, logs, absences, presence or links.
export async function resetSample(db) {
  sampleStaff ??= Promise.all(SAMPLE_STAFF.map(async (s) => {
    const salt = randomSaltHex()
    return { ...s, salt, hash: await hashPin(s.pin, salt) }
  }))
  const staff = await sampleStaff
  await db.batch([
    ...TABLES.map((t) => db.prepare(`DELETE FROM ${t}`)),
    db.prepare('INSERT INTO centre (id, name, sample, phone) VALUES (1, ?, ?, ?)')
      .bind(SAMPLE_CENTRE.name, SAMPLE_CENTRE.sample ? 1 : 0, SAMPLE_CENTRE.phone),
    ...SAMPLE_RULES.map((r) => db.prepare(`INSERT INTO ratio_rules (age_group, label, children_per_caregiver, max_children,
      default_children_per_caregiver, default_max_children, citation, sort) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(r.age_group, r.label, r.per, r.max, r.per, r.max, r.citation, r.sort)),
    ...SAMPLE_ROOMS.map((r) => db.prepare('INSERT INTO rooms (id, name, age_group, active, sort) VALUES (?, ?, ?, 1, ?)')
      .bind(r.id, r.name, r.age_group, r.sort)),
    ...staff.map((s) => db.prepare('INSERT INTO staff (id, name, initials, role, active, pin_hash, pin_salt) VALUES (?, ?, ?, ?, 1, ?, ?)')
      .bind(s.id, s.name, initialsOf(s.name), s.role, s.hash, s.salt)),
    ...SAMPLE_CHILDREN.map((ch) => db.prepare(`INSERT INTO children (id, name, initials, dob, home_room_id, schedule, days,
      start_date, end_date) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(ch.id, ch.name, ch.initials, ch.dob, ch.home_room_id, ch.schedule, JSON.stringify(ch.days), ch.start_date, ch.end_date)),
    ...SAMPLE_PEOPLE.map((p) => db.prepare(`INSERT INTO people (id, child_id, name, relationship, phone, may_pick_up,
      emergency_contact, active, sort) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)`)
      .bind(p.id, p.child_id, p.name, p.relationship, p.phone, p.may_pick_up ? 1 : 0, p.emergency_contact ? 1 : 0, p.sort)),
  ])
}

// A small seeded generator, so a seed on the same date draws the same times.
function generator(text) {
  let h = 2166136261
  for (const ch of text) h = Math.imul(h ^ ch.charCodeAt(0), 16777619)
  return () => {
    h = (h + 0x6d2b79f5) | 0
    let t = Math.imul(h ^ (h >>> 15), 1 | h)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Reset, then around today: the last 15 weekdays of attendance for every booked child (arrivals 7:30–9:15 AM, pickups
 * 3:45–5:30 PM, scribble signatures), 4 absences with different reasons, one visit last week never signed out, one staff-recorded
 * drop-off awaiting a signature; today by 9:00 AM the infant room at the limit, the toddler room ok and the preschool room over,
 * with logs and a line per room. → { today, note_url } (a parent link for Ava today).
 */
export async function seedDemo(c) {
  const db = c.db
  await resetSample(db)
  const today = c.today
  const rand = generator(`demo ${today}`)
  const pickOne = (list) => list[Math.floor(rand() * list.length)]
  const at = (date, minutes) => localInstant(date, Math.floor(minutes / 60), minutes % 60).toISOString()
  const scribble = () => {
    const pts = []
    let x = 40 + Math.floor(rand() * 40)
    for (let i = 0, n = 8 + Math.floor(rand() * 6); i < n && x <= 560; i++, x += 30 + Math.floor(rand() * 25)) {
      pts.push(x, 40 + Math.floor(rand() * 120))
    }
    return JSON.stringify([pts])
  }
  const children = SAMPLE_CHILDREN.map((ch) => ({ ...ch, days: JSON.stringify(ch.days) }))
  const peopleOf = (id) => SAMPLE_PEOPLE.filter((p) => p.child_id === id)
  const writes = []
  const visit = ({ child, date, inAt, outAt, inBy, outBy, recordedBy = null }) => {
    const id = randomId('v')
    writes.push(db.prepare(`INSERT INTO visits (id, child_id, date, in_at, in_person_id, in_signature, in_recorded_by, out_at,
      out_person_id, out_signature) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .bind(id, child, date, inAt, inBy, recordedBy ? null : scribble(), recordedBy, outAt, outAt ? outBy : null, outAt ? scribble() : null))
    return id
  }
  const place = (visitId, child, room, start, end) => writes.push(db.prepare(
    'INSERT INTO placements (id, visit_id, child_id, room_id, start_at, end_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).bind(randomId('pl'), visitId, child, room, start, end))

  // ---------- the last 15 weekdays ----------
  const days = []
  for (let d = addDays(today, -1); days.length < 15; d = addDays(d, -1)) {
    if (weekdayKey(d) !== 'sat' && weekdayKey(d) !== 'sun') days.unshift(d)
  }
  const absent = new Map([
    [`c_liam|${days[2]}`, ['sick', 'Fever at home.']], [`c_emma|${days[5]}`, ['holiday', 'Family trip.']],
    [`c_sam|${days[8]}`, ['appointment', 'Dentist in the morning.']], [`c_zoe|${days[12]}`, ['family', '']],
  ])
  const neverSignedOut = `c_finn|${days[9]}`
  const recordedDropOff = `c_leo|${days[14]}`
  for (const date of days) {
    for (const ch of children) {
      if (!childBooked(ch, date)) continue
      const key = `${ch.id}|${date}`
      if (absent.has(key)) {
        const [reason, note] = absent.get(key)
        writes.push(db.prepare('INSERT INTO absences (id, child_id, date, reason, note, created_at, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)')
          .bind(randomId('a'), ch.id, date, reason, note, at(date, 420), 's_dana'))
        continue
      }
      const inAt = at(date, 450 + Math.floor(rand() * 106))
      const outAt = at(date, 945 + Math.floor(rand() * 106))
      const list = peopleOf(ch.id)
      const id = visit({
        child: ch.id, date, inAt, outAt: key === neverSignedOut ? null : outAt, inBy: pickOne(list).id,
        outBy: pickOne(list.filter((p) => p.may_pick_up)).id, recordedBy: key === recordedDropOff ? 's_kevin' : null,
      })
      // The placement of the visit never signed out still ends, so that child is not counted in a room today.
      place(id, ch.id, ch.home_room_id, inAt, outAt)
    }
  }

  // ---------- today, by 9:00 AM (never later than now) ----------
  let step = 0
  const now = c.now.getTime()
  const T = (minutes) => new Date(Math.min(Date.parse(at(today, minutes)), now - (80 - step++) * 60000)).toISOString()
  for (const [staffId, room] of [['s_marie', 'r_infant'], ['s_kevin', 'r_toddler'], ['s_priya', 'r_preschool']]) {
    writes.push(db.prepare('INSERT INTO presence (id, staff_id, room_id, start_at) VALUES (?, ?, ?, ?)')
      .bind(randomId('pr'), staffId, room, T(450)))
  }
  const arrivals = [['c_ava', 460], ['c_liam', 465], ['c_nora', 470], ['c_jack', 472], ['c_emma', 475], ['c_leo', 480], ['c_chloe', 485],
    ['c_maya', 488], ['c_ben', 490], ['c_lucy', 492], ['c_sam', 495], ['c_grace', 498], ['c_eli', 500], ['c_zoe', 502], ['c_max', 505],
    ['c_ruby', 508]]
  const todayVisit = {}
  for (const [child, minutes] of arrivals) {
    const ch = children.find((x) => x.id === child)
    const inAt = T(minutes)
    const mother = peopleOf(child)[0].id
    const id = visit({ child, date: today, inAt, outAt: null, inBy: mother })
    todayVisit[child] = { id, inAt, room: ch.home_room_id }
  }
  // Maya (2 years 9 months) joins the preschool room at 8:30: the toddler room keeps 4, the preschool room has 9.
  const moveAt = T(510)
  for (const [child, v] of Object.entries(todayVisit)) {
    if (child === 'c_maya') {
      place(v.id, child, 'r_toddler', v.inAt, moveAt)
      place(v.id, child, 'r_preschool', moveAt, null)
    } else {
      place(v.id, child, v.room, v.inAt, null)
    }
  }
  const logs = [
    ['c_ava', 's_marie', 515, 'meal', 'all', 'breakfast', null], ['c_liam', 's_marie', 518, 'meal', 'some', 'breakfast', null],
    ['c_ava', 's_marie', 520, 'diaper', 'wet', null, null], ['c_jack', 's_kevin', 522, 'meal', 'all', 'breakfast', null],
    ['c_nora', 's_marie', 525, 'nap_start', null, null, null], ['c_emma', 's_kevin', 527, 'mood', 'happy', null, null],
    ['c_ben', 's_priya', 530, 'mood', 'okay', null, null], ['c_lucy', 's_priya', 532, 'toilet', 'went', null, null],
    ['c_liam', 's_marie', 535, 'mood', 'tired', null, null], ['c_ava', 's_marie', 536, 'note', null, null, 'Loved the water table.'],
  ]
  for (const [child, by, minutes, kind, value, meal, text] of logs) {
    writes.push(db.prepare(`INSERT INTO logs (id, child_id, visit_id, date, kind, value, meal, text, at, by_staff_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(randomId('l'), child, todayVisit[child].id, today, kind, value, meal, text, T(minutes), by))
  }
  for (const [room, by, text] of [['r_infant', 's_marie', 'Sensory bins and songs.'], ['r_toddler', 's_kevin', 'Painting with big brushes.'],
    ['r_preschool', 's_priya', 'Building a harbour out of blocks.']]) {
    writes.push(db.prepare('INSERT INTO room_activity (date, room_id, text, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)')
      .bind(today, room, text, T(537), by))
  }
  const token = randomToken()
  writes.push(db.prepare('INSERT INTO note_links (token_hash, child_id, date, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), 'c_ava', today, T(538), endOfDate(today).toISOString(), 's_marie'))

  for (let i = 0; i < writes.length; i += 80) await db.batch(writes.slice(i, i + 80))
  return { today, note_url: `/note/?t=${token}` }
}
