// Door tablet reads. No phone numbers ever reach the door.
import { findChild, loadDay, loadMeters } from './db.js'
import { json } from './http.js'
import { dateLabel, localDate, localHHMM, timeLabel } from './time.js'

export async function doorChildren(c) {
  const [ctx, m] = await Promise.all([loadDay(c), loadMeters(c.db)])
  const children = ctx.sortByRoom(ctx.listed).map((ch) => {
    const room = ctx.rooms.get(ctx.roomOf(ch))
    return {
      id: ch.id, name: ch.name, initials: ch.initials, room_id: room ? room.id : null, room_name: room ? room.name : null,
      ...ctx.status(ch), awaiting_signature: ctx.pendingChildren.has(ch.id),
    }
  })
  return json({
    date: c.today, date_label: dateLabel(c.today), now_local: localHHMM(c.now), centre_name: ctx.centre.name,
    sample: ctx.centre.sample === 1, rooms: m.rooms.filter((r) => r.active === 1).map((r) => m.meters.get(r.id)), children,
  })
}

export async function doorChild(c) {
  const child = await findChild(c, c.params.id)
  const ctx = await loadDay(c)
  const room = ctx.rooms.get(ctx.roomOf(child))
  const visits = ctx.visits.filter((v) => v.child_id === child.id)
  const visit = ctx.open.get(child.id) ?? visits.filter((v) => v.date === c.today).pop() ?? null
  const pending = []
  for (const v of ctx.pending.filter((p) => p.child_id === child.id)) {
    for (const which of ['in', 'out']) {
      const recorded = which === 'in' ? v.in_recorded_by && !v.in_signature : v.out_at && v.out_recorded_by && !v.out_signature
      if (!recorded) continue
      const at = which === 'in' ? v.in_at : v.out_at
      const p = ctx.people.get(which === 'in' ? v.in_person_id : v.out_person_id)
      pending.push({ visit_id: v.id, which, date_label: dateLabel(localDate(at)), time_label: timeLabel(at),
        person: { id: p.id, name: p.name } })
    }
  }
  return json({
    child: { id: child.id, name: child.name, initials: child.initials, room_name: room ? room.name : null, ...ctx.status(child) },
    visit: visit ? ctx.visitView(visit) : null,
    people: ctx.peopleRows.filter((p) => p.child_id === child.id && p.active === 1)
      .map((p) => ({ id: p.id, name: p.name, relationship: p.relationship, may_pick_up: p.may_pick_up === 1 })),
    pending,
  })
}
