// Daycare Day Sheet Worker: the API in docs/API.md under /api/*, and the static app from ../app/public.
import { assertPinAllowed, createSession, DOOR_DAYS, hashPin, randomSaltHex, recordWrongPin, requireAccess, STAFF_HOURS, staffByPin, WRONG_PIN } from './auth.js'
import { now as clockNow, testMode } from './clock.js'
import { ruleView } from './db.js'
import { doorChild, doorChildren } from './door.js'
import { ApiError, bad, forbidden, json, notFound, unauthorized } from './http.js'
import { initialsOf, SAMPLE_CENTRE, SAMPLE_CHILDREN, SAMPLE_PEOPLE, SAMPLE_ROOMS, SAMPLE_RULES, SAMPLE_STAFF } from './sample.js'
import { addLog, getNote, makeLink, moveChild, parentNote, presence, putActivity, putNote, staffChild, staffToday, voidLog } from './staff.js'
import { dateLabel, localDate, localHHMM, longLabel, timeLabel, TZ } from './time.js'
import { readBody, signIn, signOut, signVisit } from './visits.js'

// [method, pattern, handler, access] — access: undefined (anyone), 'any' (any token), 'door', 'staff', 'office', 'test'.
const ROUTES = [
  ['GET', '/api/info', info],
  ['POST', '/api/signin', signin],
  ['POST', '/api/door/unlock', unlock],
  ['POST', '/api/signout', signout, 'any'],
  ['GET', '/api/door/children', doorChildren, 'door'],
  ['GET', '/api/door/children/:id', doorChild, 'door'],
  ['POST', '/api/door/children/:id/in', (c) => signIn(c, { door: true }), 'door'],
  ['POST', '/api/door/children/:id/out', (c) => signOut(c, { door: true }), 'door'],
  ['POST', '/api/door/visits/:id/sign', signVisit, 'door'],
  ['GET', '/api/staff/today', staffToday, 'staff'],
  ['POST', '/api/staff/presence', presence, 'staff'],
  ['POST', '/api/staff/children/:id/move', moveChild, 'staff'],
  ['GET', '/api/staff/children/:id', staffChild, 'staff'],
  ['POST', '/api/staff/children/:id/logs', addLog, 'staff'],
  ['DELETE', '/api/staff/logs/:id', voidLog, 'staff'],
  ['POST', '/api/staff/children/:id/in', (c) => signIn(c, { door: false }), 'staff'],
  ['POST', '/api/staff/children/:id/out', (c) => signOut(c, { door: false }), 'staff'],
  ['PUT', '/api/staff/rooms/:id/activity', putActivity, 'staff'],
  ['GET', '/api/staff/children/:id/note', getNote, 'staff'],
  ['PUT', '/api/staff/children/:id/note', putNote, 'staff'],
  ['POST', '/api/staff/children/:id/note/link', makeLink, 'staff'],
  ['GET', '/api/note/:token', parentNote],
  ['PUT', '/api/office/ratios/:age_group', putRatio, 'office'],
  ['DELETE', '/api/office/people/:pid', deactivatePerson, 'office'],
  ['POST', '/api/test/reset', testReset, 'test'],
].map(([method, pattern, handler, access]) => {
  const names = []
  const re = new RegExp(`^${pattern.replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)'))}$`)
  return { method, re, names, handler, access }
})

export default {
  async fetch(request, env) {
    const url = new URL(request.url)
    if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request)
    try {
      return await dispatch(request, env, url)
    } catch (e) {
      if (e instanceof ApiError) return json({ error: e.message, code: e.code, ...e.extra }, e.status)
      console.error(e)
      return json({ error: 'Something went wrong on our side. Try again.', code: 'server_error' }, 500)
    }
  },
}

async function dispatch(request, env, url) {
  const now = clockNow(request, env)
  const c = {
    request, env, url, db: env.DB, now, nowIso: now.toISOString(), today: localDate(now), params: {},
    body: () => readJson(request),
  }
  // Every office path is the supervisor's, including ones this Worker does not answer yet.
  if (url.pathname.startsWith('/api/office/')) await requireAccess(c, 'office')
  for (const r of ROUTES) {
    const m = url.pathname.match(r.re)
    if (!m || r.method !== request.method) continue
    if (r.access === 'test' && !testMode(env)) break
    c.params = Object.fromEntries(r.names.map((n, i) => [n, decodeURIComponent(m[i + 1])]))
    if (r.access && r.access !== 'test') await requireAccess(c, r.access)
    return await r.handler(c)
  }
  throw notFound('There is nothing here.')
}

async function readJson(request) {
  const text = await request.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    throw bad('body', 'Send the details as JSON.')
  }
}

// ---------- public ----------

async function info(c) {
  const centre = await c.db.prepare('SELECT * FROM centre WHERE id = 1').first()
  return json({
    centre_name: centre ? centre.name : '', sample: centre ? centre.sample === 1 : true, phone: centre ? centre.phone : '',
    zone: TZ, today: c.today, date_label: dateLabel(c.today), long_label: longLabel(c.today), now: c.nowIso,
    now_local: localHHMM(c.now), time_label: timeLabel(c.now),
  })
}

async function checkPin(c) {
  const body = await readBody(c)
  await assertPinAllowed(c)
  const staff = await staffByPin(c, body.pin)
  if (!staff) {
    await recordWrongPin(c)
    throw unauthorized(WRONG_PIN, { field: 'pin' })
  }
  return staff
}

async function signin(c) {
  const staff = await checkPin(c)
  const s = await createSession(c, 'staff', staff.id, STAFF_HOURS * 3600e3)
  return json({ token: s.token, role: staff.role, staff: { id: staff.id, name: staff.name, initials: staff.initials },
    expires_at: s.expires_at })
}

async function unlock(c) {
  const staff = await checkPin(c)
  if (staff.role !== 'supervisor') throw forbidden('Only the supervisor can set up this tablet.')
  const s = await createSession(c, 'door', staff.id, DOOR_DAYS * 86400e3)
  return json({ token: s.token, role: 'door', expires_at: s.expires_at })
}

async function signout(c) {
  await c.db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(c.session.token_hash).run()
  return json({ ok: true })
}

// ---------- office (the parts M1 tests need; the rest is M2) ----------

async function putRatio(c) {
  const rule = await c.db.prepare('SELECT * FROM ratio_rules WHERE age_group = ?').bind(c.params.age_group).first()
  if (!rule) throw notFound("We couldn't find that age group.")
  const body = await readBody(c)
  const next = { children_per_caregiver: rule.children_per_caregiver, max_children: rule.max_children }
  for (const [key, most] of [['children_per_caregiver', 50], ['max_children', 60]]) {
    if (!Object.hasOwn(body, key)) continue
    const v = body[key]
    if (v !== null && !(Number.isInteger(v) && v >= 1 && v <= most)) {
      throw bad(key, `Enter a whole number from 1 to ${most}, or leave it empty.`)
    }
    next[key] = v
  }
  await c.db.prepare('UPDATE ratio_rules SET children_per_caregiver = ?, max_children = ? WHERE age_group = ?')
    .bind(next.children_per_caregiver, next.max_children, rule.age_group).run()
  return json({ rule: ruleView({ ...rule, ...next }) })
}

async function deactivatePerson(c) {
  const p = await c.db.prepare('SELECT * FROM people WHERE id = ?').bind(c.params.pid).first()
  if (!p) throw notFound("We couldn't find that person.")
  await c.db.prepare('UPDATE people SET active = 0, emergency_contact = 0 WHERE id = ?').bind(p.id).run()
  return json({ person: { id: p.id, child_id: p.child_id, name: p.name, relationship: p.relationship, may_pick_up: p.may_pick_up === 1,
    emergency_contact: false, active: false, phone: p.phone } })
}

// ---------- test only (TEST_MODE=1) ----------

let sampleStaff = null // PBKDF2 of the SAMPLE PINs, once per isolate (each staff member still has their own salt)

async function testReset(c) {
  sampleStaff ??= Promise.all(SAMPLE_STAFF.map(async (s) => {
    const salt = randomSaltHex()
    return { ...s, salt, hash: await hashPin(s.pin, salt) }
  }))
  const staff = await sampleStaff
  const db = c.db
  const tables = ['sessions', 'pin_attempts', 'note_links', 'note_lines', 'room_activity', 'logs', 'visit_edits', 'placements',
    'presence', 'absences', 'visits', 'people', 'children', 'staff', 'rooms', 'ratio_rules', 'centre']
  await db.batch([
    ...tables.map((t) => db.prepare(`DELETE FROM ${t}`)),
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
  return json({ ok: true, today: c.today })
}
