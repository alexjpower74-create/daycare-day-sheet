// Sign in and sign out: the door (with a signature) and staff recording a time the parent did not sign.
// Drop-off: any active person on the child's list. Pick-up: only those who may pick up. The Worker refuses, not the page.
// The ratio never refuses a child: the answer carries the new meter instead.
import { randomId } from './auth.js'
import { childActive, findChild, loadMeters, visitById } from './db.js'
import { bad, badState, conflict, json, notFound, notOnList } from './http.js'
import { parseSignature, SIGNATURE_MESSAGE } from './signature.js'
import { timeLabel } from './time.js'

export async function readBody(c) {
  const b = await c.body()
  return b && typeof b === 'object' && !Array.isArray(b) ? b : {}
}

function signatureOf(sig) {
  const s = parseSignature(sig)
  if (!s) throw bad('signature', SIGNATURE_MESSAGE)
  return JSON.stringify(s.strokes)
}

const personRow = (c, id) => (typeof id === 'string' ? c.db.prepare('SELECT * FROM people WHERE id = ?').bind(id).first() : null)
export const openVisitOf = (c, childId) =>
  c.db.prepare('SELECT * FROM visits WHERE child_id = ? AND out_at IS NULL').bind(childId).first()
const alreadyIn = (child) => conflict('already_in', `${child.name} is already signed in.`)
export const notIn = (child) => conflict('not_in', `${child.name} is not signed in.`)

// door: true → the person signs now; false → c.staff records it (awaiting a signature).
export async function signIn(c, { door }) {
  const body = await readBody(c)
  const child = await findChild(c, c.params.id)
  if (!childActive(child, c.today)) throw badState(`${child.name} is no longer registered here. Get the supervisor.`)
  if (await openVisitOf(c, child.id)) throw alreadyIn(child)
  const person = await personRow(c, body.person_id)
  const onList = person && person.child_id === child.id && person.active === 1
  if (!onList) throw notOnList(`That person is not on ${child.name}'s list. Get the supervisor.`)
  const signature = door ? signatureOf(body.signature) : null
  const id = randomId('v')
  try {
    await c.db.batch([
      c.db.prepare(`INSERT INTO visits (id, child_id, date, in_at, in_person_id, in_signature, in_recorded_by)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(id, child.id, c.today, c.nowIso, person.id, signature, door ? null : c.staff.id),
      c.db.prepare('INSERT INTO placements (id, visit_id, child_id, room_id, start_at) VALUES (?, ?, ?, ?, ?)')
        .bind(randomId('pl'), id, child.id, child.home_room_id, c.nowIso),
    ])
  } catch (e) {
    if (/UNIQUE constraint/i.test(String(e?.message))) throw alreadyIn(child)
    throw e
  }
  const [{ meters }, visit] = await Promise.all([loadMeters(c.db), visitById(c, id)])
  return json({
    visit, meter: meters.get(child.home_room_id),
    message: `${child.name} signed in at ${timeLabel(c.now)} by ${person.name}.`,
  }, 201)
}

export async function signOut(c, { door }) {
  const body = await readBody(c)
  const child = await findChild(c, c.params.id)
  const open = await openVisitOf(c, child.id)
  if (!open) throw notIn(child)
  const person = await personRow(c, body.person_id)
  const mayPickUp = person && person.child_id === child.id && person.active === 1 && person.may_pick_up === 1
  if (!mayPickUp) {
    const who = person ? person.name : 'That person'
    throw notOnList(`${who} is not on the pickup list for ${child.name}. Get the supervisor. Do not let ${child.name} leave.`)
  }
  const signature = door ? signatureOf(body.signature) : null
  const placement = await c.db.prepare('SELECT room_id FROM placements WHERE visit_id = ? AND end_at IS NULL').bind(open.id).first()
  const [closed] = await c.db.batch([
    c.db.prepare(`UPDATE visits SET out_at = ?, out_person_id = ?, out_signature = ?, out_recorded_by = ?
      WHERE id = ? AND out_at IS NULL`).bind(c.nowIso, person.id, signature, door ? null : c.staff.id, open.id),
    c.db.prepare('UPDATE placements SET end_at = ? WHERE visit_id = ? AND end_at IS NULL').bind(c.nowIso, open.id),
  ])
  if (closed.meta.changes === 0) throw notIn(child)
  const [{ meters }, visit] = await Promise.all([loadMeters(c.db), visitById(c, open.id)])
  return json({
    visit, meter: meters.get(placement ? placement.room_id : child.home_room_id),
    message: `${child.name} signed out at ${timeLabel(c.now)} by ${person.name}.`,
  })
}

// The recorded person adds their signature to a time staff recorded. The times never change.
export async function signVisit(c) {
  const body = await readBody(c)
  const v = await c.db.prepare('SELECT * FROM visits WHERE id = ?').bind(c.params.id).first()
  if (!v) throw notFound("We couldn't find that visit.")
  const which = body.which
  if (which !== 'in' && which !== 'out') throw bad('which', 'Say which time to sign: in or out.')
  const col = which === 'in' ? 'in_signature' : 'out_signature'
  const personId = which === 'in' ? v.in_person_id : v.out_person_id
  const recordedBy = which === 'in' ? v.in_recorded_by : v.out_recorded_by
  if (!recordedBy || v[col] || (which === 'out' && !v.out_at)) throw badState('There is no signature waiting for that time.')
  if (body.person_id !== personId) {
    const recorded = await personRow(c, personId)
    throw notOnList(`Only ${recorded ? recorded.name : 'the person who was recorded'} can sign for that time. Get the supervisor.`)
  }
  const signature = signatureOf(body.signature)
  const r = await c.db.prepare(`UPDATE visits SET ${col} = ? WHERE id = ? AND ${col} IS NULL`).bind(signature, v.id).run()
  if (r.meta.changes === 0) throw badState('There is no signature waiting for that time.')
  return json({ visit: await visitById(c, v.id) })
}
