// Daycare Day Sheet Worker: the API in docs/API.md under /api/*, and the static app from ../app/public.
import { assertPinAllowed, createSession, DOOR_DAYS, recordWrongPin, requireAccess, STAFF_HOURS, staffByPin, WRONG_PIN } from './auth.js'
import { now as clockNow, testMode } from './clock.js'
import { doorChild, doorChildren } from './door.js'
import { ApiError, bad, forbidden, json, notFound, unauthorized } from './http.js'
import {
  createAbsence, createChild, createPerson, createRoom, createStaff, deactivatePerson, deleteAbsence, fixVisit, officeChildren,
  officeRatios, officeRooms, officeStaff, putRatio, resetRatio, updateChild, updatePerson, updateRoom, updateStaff,
} from './office.js'
import { attendance, attendanceCsv, followUps, register, summaryCsv } from './reports.js'
import { resetSample, seedDemo } from './seed.js'
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
  ['GET', '/api/office/children', officeChildren, 'office'],
  ['POST', '/api/office/children', createChild, 'office'],
  ['PUT', '/api/office/children/:id', updateChild, 'office'],
  ['POST', '/api/office/children/:id/people', createPerson, 'office'],
  ['PUT', '/api/office/people/:pid', updatePerson, 'office'],
  ['DELETE', '/api/office/people/:pid', deactivatePerson, 'office'],
  ['GET', '/api/office/rooms', officeRooms, 'office'],
  ['POST', '/api/office/rooms', createRoom, 'office'],
  ['PUT', '/api/office/rooms/:id', updateRoom, 'office'],
  ['GET', '/api/office/ratios', officeRatios, 'office'],
  ['PUT', '/api/office/ratios/:age_group', putRatio, 'office'],
  ['POST', '/api/office/ratios/:age_group/reset', resetRatio, 'office'],
  ['GET', '/api/office/staff', officeStaff, 'office'],
  ['POST', '/api/office/staff', createStaff, 'office'],
  ['PUT', '/api/office/staff/:id', updateStaff, 'office'],
  ['POST', '/api/office/absences', createAbsence, 'office'],
  ['DELETE', '/api/office/absences/:id', deleteAbsence, 'office'],
  ['PUT', '/api/office/visits/:id', fixVisit, 'office'],
  ['GET', '/api/office/attendance', attendance, 'office'],
  ['GET', '/api/office/attendance.csv', attendanceCsv, 'office'],
  ['GET', '/api/office/attendance-summary.csv', summaryCsv, 'office'],
  ['GET', '/api/office/register', register, 'office'],
  ['GET', '/api/office/follow-ups', followUps, 'office'],
  ['POST', '/api/test/reset', testReset, 'test'],
  ['POST', '/api/test/seed', testSeed, 'test'],
].map(([method, pattern, handler, access]) => {
  const names = []
  const re = new RegExp(`^${pattern.replace(/\./g, '\\.').replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)'))}$`)
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
  // Every office path is the supervisor's, including ones this Worker does not answer.
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
    // Before the centre row exists (a migrated, empty D1) nothing is known: no name, and never a SAMPLE badge on a real deployment.
    centre_name: centre ? centre.name : '', sample: centre ? centre.sample === 1 : false, phone: centre ? centre.phone : '',
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

// ---------- test only (TEST_MODE=1) ----------

async function testReset(c) {
  await resetSample(c.db)
  return json({ ok: true, today: c.today })
}

async function testSeed(c) {
  const body = await readBody(c)
  if (body.scenario !== 'demo') throw bad('scenario', 'The only scenario is "demo".')
  return json(await seedDemo(c))
}
