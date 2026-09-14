// Staff phone routes: today, presence, moves, quick logs, room activity, the daily note and parent links.
import { randomId, randomToken, sha256Hex } from './auth.js'
import { activeMeters, childView, findChild, loadDay, loadMeters, loadNote, lookups, REASON_LABELS, roomView, staffView } from './db.js'
import { ApiError, bad, badState, conflict, forbidden, json, notFound } from './http.js'
import { buildNote, isNapping, LINE_MAX, logLabel, logView, parseLog } from './notes.js'
import { dateLabel, endOfDate, isValidDate, localHHMM, longLabel, timeLabel } from './time.js'
import { notIn, openVisitOf, readBody } from './visits.js'

export async function staffToday(c) {
  const [ctx, m] = await Promise.all([loadDay(c), loadMeters(c.db)])
  const [logs, presence] = await c.db.batch([
    c.db.prepare(`SELECT * FROM logs WHERE voided = 0 AND visit_id IN (SELECT id FROM visits WHERE out_at IS NULL)
      ORDER BY at, rowid`),
    c.db.prepare('SELECT * FROM presence WHERE end_at IS NULL ORDER BY start_at, rowid'),
  ])
  const me = await c.db.prepare('SELECT * FROM staff WHERE id = ?').bind(c.staff.id).first()
  const rooms = m.rooms.filter((r) => r.active === 1).map((room) => ({
    room: roomView(room), meter: m.meters.get(room.id),
    children: ctx.children.filter((ch) => ctx.open.has(ch.id) && ctx.placement.get(ch.id) === room.id).map((ch) => {
      const visit = ctx.open.get(ch.id)
      const mine = logs.results.filter((l) => l.visit_id === visit.id)
      const meal = mine.filter((l) => l.kind === 'meal' && l.date === c.today).pop()
      return { id: ch.id, name: ch.name, initials: ch.initials, in_label: timeLabel(visit.in_at), napping: isNapping(mine),
        last_meal_label: meal ? logLabel(meal) : null, awaiting_signature: ctx.pendingChildren.has(ch.id) }
    }),
    staff: presence.results.filter((p) => p.room_id === room.id).map((p) => {
      const s = ctx.staff.get(p.staff_id)
      return { id: s.id, name: s.name, initials: s.initials, since_label: timeLabel(p.start_at) }
    }),
  }))
  const registered = ctx.listed.map((ch) => [ch, ctx.status(ch).status])
  return json({
    date: c.today, date_label: dateLabel(c.today), now: c.nowIso, now_local: localHHMM(c.now), centre_name: ctx.centre.name,
    sample: ctx.centre.sample === 1,
    me: { staff: staffView(me), room_id: presence.results.find((p) => p.staff_id === me.id)?.room_id ?? null },
    rooms,
    not_in_yet: registered.filter(([, s]) => s === 'not_in_yet').map(([ch]) => ctx.childView(ch)),
    away: registered.filter(([, s]) => s === 'away')
      .map(([ch]) => ({ child: ctx.childView(ch), reason_label: REASON_LABELS[ctx.absence.get(ch.id).reason] })),
    gone_home: registered.filter(([, s]) => s === 'gone_home').map(([ch]) => ctx.childView(ch)),
  })
}

export async function presence(c) {
  const body = await readBody(c)
  let target = c.staff
  if (body.staff_id !== undefined && body.staff_id !== c.staff.id) {
    if (c.staff.role !== 'supervisor') throw forbidden('Only the supervisor can move another staff member.')
    target = typeof body.staff_id === 'string'
      ? await c.db.prepare('SELECT * FROM staff WHERE id = ? AND active = 1').bind(body.staff_id).first() : null
    if (!target) throw notFound("We couldn't find that staff member.")
  }
  if (!Object.hasOwn(body, 'room_id')) throw bad('room_id', 'Pick a room.')
  const roomId = body.room_id
  if (roomId !== null) {
    const room = typeof roomId === 'string'
      ? await c.db.prepare('SELECT id FROM rooms WHERE id = ? AND active = 1').bind(roomId).first() : null
    if (!room) throw bad('room_id', 'Pick a room that is open.')
  }
  const current = await c.db.prepare('SELECT * FROM presence WHERE staff_id = ? AND end_at IS NULL').bind(target.id).first()
  if ((current ? current.room_id : null) !== roomId) {
    const writes = [c.db.prepare('UPDATE presence SET end_at = ? WHERE staff_id = ? AND end_at IS NULL').bind(c.nowIso, target.id)]
    if (roomId !== null) {
      writes.push(c.db.prepare('INSERT INTO presence (id, staff_id, room_id, start_at) VALUES (?, ?, ?, ?)')
        .bind(randomId('pr'), target.id, roomId, c.nowIso))
    }
    try {
      await c.db.batch(writes)
    } catch (e) {
      if (/UNIQUE constraint/i.test(String(e?.message))) throw badState('That changed on another phone. Try again.')
      throw e
    }
  }
  return json({ rooms: activeMeters(await loadMeters(c.db)) })
}

export async function moveChild(c) {
  const body = await readBody(c)
  const child = await findChild(c, c.params.id)
  const open = await openVisitOf(c, child.id)
  if (!open) throw notIn(child)
  const placement = await c.db.prepare('SELECT * FROM placements WHERE visit_id = ? AND end_at IS NULL').bind(open.id).first()
  const room = typeof body.room_id === 'string'
    ? await c.db.prepare('SELECT * FROM rooms WHERE id = ?').bind(body.room_id).first() : null
  if (!room || room.active !== 1) throw bad('room_id', 'Pick a room that is open.')
  if (placement && room.id === placement.room_id) throw bad('room_id', `${child.name} is already in the ${room.name}.`)
  // Close the old placement and open the new one in one transaction (Policy ELCD-2017-L2 7).
  const [, opened] = await c.db.batch([
    c.db.prepare('UPDATE placements SET end_at = ? WHERE visit_id = ? AND end_at IS NULL').bind(c.nowIso, open.id),
    c.db.prepare(`INSERT INTO placements (id, visit_id, child_id, room_id, start_at)
      SELECT ?1, ?2, ?3, ?4, ?5 WHERE EXISTS (SELECT 1 FROM visits WHERE id = ?2 AND out_at IS NULL)`)
      .bind(randomId('pl'), open.id, child.id, room.id, c.nowIso),
  ])
  if (opened.meta.changes === 0) throw notIn(child)
  const { meters } = await loadMeters(c.db)
  return json({
    from: meters.get(placement ? placement.room_id : child.home_room_id), to: meters.get(room.id),
    message: `${child.name} moved to ${room.name}.`,
  })
}

const todaysLogs = (c, childId) => c.db.prepare('SELECT * FROM logs WHERE child_id = ? AND date = ? AND voided = 0 ORDER BY at, rowid')
  .bind(childId, c.today).all()

export async function staffChild(c) {
  const child = await findChild(c, c.params.id)
  const ctx = await loadDay(c)
  const visit = ctx.open.get(child.id) ?? ctx.visits.filter((v) => v.child_id === child.id && v.date === c.today).pop() ?? null
  const { results: logs } = await todaysLogs(c, child.id)
  return json({
    child: childView(child, { today: c.today, rooms: ctx.rooms, roomId: ctx.placement.get(child.id) ?? null }),
    visit: visit ? ctx.visitView(visit) : null,
    logs: logs.map((l) => logView(l, ctx.staff)),
    people: ctx.peopleRows.filter((p) => p.child_id === child.id && p.active === 1)
      .map((p) => ({ id: p.id, name: p.name, relationship: p.relationship, may_pick_up: p.may_pick_up === 1 })),
  })
}

export async function addLog(c) {
  const child = await findChild(c, c.params.id)
  const body = await readBody(c)
  const log = parseLog(body)
  if (log.field) throw bad(log.field, log.message)
  const open = await openVisitOf(c, child.id)
  if (!open) throw notIn(child)
  const allowed = log.kind === 'nap_start' ? "('nap_end')" : log.kind === 'nap_end' ? "('nap_start')" : "('nap_start', 'nap_end')"
  const id = randomId('l')
  // Written only while the visit is open and the nap state allows it: two taps cannot start two naps.
  const r = await c.db.prepare(`INSERT INTO logs (id, child_id, visit_id, date, kind, value, meal, text, at, by_staff_id)
    SELECT ?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10
    WHERE EXISTS (SELECT 1 FROM visits WHERE id = ?3 AND out_at IS NULL)
      AND COALESCE((SELECT kind FROM logs WHERE visit_id = ?3 AND voided = 0 AND kind IN ('nap_start', 'nap_end')
        ORDER BY at DESC, rowid DESC LIMIT 1), 'nap_end') IN ${allowed}`)
    .bind(id, child.id, open.id, c.today, log.kind, log.value, log.meal, log.text, c.nowIso, c.staff.id).run()
  if (r.meta.changes === 0) {
    if (!(await openVisitOf(c, child.id))) throw notIn(child)
    if (log.kind === 'nap_start') throw conflict('already_napping', `${child.name} is already asleep.`)
    throw conflict('not_napping', `${child.name} is not asleep.`)
  }
  const row = await c.db.prepare('SELECT * FROM logs WHERE id = ?').bind(id).first()
  const { staff } = await lookups(c.db)
  return json({ log: logView(row, staff) }, 201)
}

export async function voidLog(c) {
  const log = await c.db.prepare('SELECT * FROM logs WHERE id = ? AND voided = 0').bind(c.params.id).first()
  if (!log) throw notFound("We couldn't find that log.")
  if (log.date !== c.today) throw badState("Only today's logs can be undone.")
  if (c.staff.role !== 'supervisor' && log.by_staff_id !== c.staff.id) {
    throw forbidden('Only the person who logged it, or the supervisor, can undo it.')
  }
  await c.db.prepare('UPDATE logs SET voided = 1, voided_by = ?, voided_at = ? WHERE id = ? AND voided = 0')
    .bind(c.staff.id, c.nowIso, log.id).run()
  return json({ ok: true })
}

function lineText(body) {
  const text = body.text === undefined || body.text === null ? '' : typeof body.text === 'string' ? body.text.trim() : null
  if (text === null || text.length > LINE_MAX) throw bad('text', `Keep it to ${LINE_MAX} characters.`)
  return text
}

export async function putActivity(c) {
  const body = await readBody(c)
  const room = await c.db.prepare('SELECT * FROM rooms WHERE id = ?').bind(c.params.id).first()
  if (!room) throw notFound("We couldn't find that room.")
  const text = lineText(body)
  await c.db.prepare(`INSERT INTO room_activity (date, room_id, text, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (date, room_id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(c.today, room.id, text, c.nowIso, c.staff.id).run()
  return json({ date: c.today, room_id: room.id, text })
}

// Staff may read any day up to today.
function noteDate(c, date) {
  if (date === undefined || date === null || date === '') return c.today
  if (!isValidDate(date) || date > c.today) throw bad('date', 'Pick today or an earlier date.')
  return date
}

export async function getNote(c) {
  const date = noteDate(c, c.url.searchParams.get('date'))
  const child = await findChild(c, c.params.id)
  return json(await loadNote(c, child.id, date, buildNote))
}

export async function putNote(c) {
  const body = await readBody(c)
  const child = await findChild(c, c.params.id)
  const date = noteDate(c, body.date)
  const text = lineText(body)
  await c.db.prepare(`INSERT INTO note_lines (child_id, date, text, updated_at, updated_by) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT (child_id, date) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at, updated_by = excluded.updated_by`)
    .bind(child.id, date, text, c.nowIso, c.staff.id).run()
  return json(await loadNote(c, child.id, date, buildNote))
}

// ---------- parent links ----------

export async function makeLink(c) {
  const child = await findChild(c, c.params.id)
  const token = randomToken()
  // Today only: the link dies at the local midnight that ends today.
  const expires = endOfDate(c.today)
  await c.db.prepare('INSERT INTO note_links (token_hash, child_id, date, created_at, expires_at, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), child.id, c.today, c.nowIso, expires.toISOString(), c.staff.id).run()
  return json({
    token, url: `/note/?t=${token}`, date: c.today, expires_at: expires.toISOString(), expires_label: 'Works until midnight tonight.',
  }, 201)
}

export async function parentNote(c) {
  const link = await c.db.prepare('SELECT * FROM note_links WHERE token_hash = ?').bind(await sha256Hex(c.params.token)).first()
  if (!link) throw notFound("We couldn't find that note. Ask the centre for a new link.")
  if (c.now.getTime() >= Date.parse(link.expires_at)) {
    throw new ApiError(410, 'link_expired',
      `This link was for ${longLabel(link.date)} and stopped working at midnight. Ask the centre for today's note.`)
  }
  return json(await loadNote(c, link.child_id, link.date, buildNote))
}
