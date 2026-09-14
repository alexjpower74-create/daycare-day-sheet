// Development stand-in for docs/API.md, loaded by /api.js only with ?mock=1 while dd1's Worker is not merged into rig/dd2.
// Same shapes as API.md for the routes the room view and notes use; in memory, kept in localStorage so moving between pages keeps
// the day (?mockreset=1 starts it again). Its clock starts at Mon Sep 14 2026, 9:00 AM NDT and runs forward.
// Playwright never uses it: every test runs against the real Worker. Delete once the Worker is merged if nobody needs it.
const ZONE = 'America/St_Johns'
const KEY = 'daycare-day-sheet:mock-state'
const START = Date.parse('2026-09-14T11:30:00Z')
const MIN = 60_000

// ---------- time labels ----------
const parts = (ms, opts) => Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone: ZONE, ...opts }).formatToParts(ms).map((p) => [p.type, p.value]))
const timeLabel = (ms) => new Intl.DateTimeFormat('en-US', { timeZone: ZONE, hour: 'numeric', minute: '2-digit' }).format(ms).replace(/\u202f/g, " ")
const localDate = (ms) => { const p = parts(ms, { year: 'numeric', month: '2-digit', day: '2-digit' }); return `${p.year}-${p.month}-${p.day}` }
const dateLabel = (ms) => { const p = parts(ms, { weekday: 'short', month: 'short', day: 'numeric' }); return `${p.weekday} ${p.month} ${p.day}` }
const longLabel = (ms) => { const p = parts(ms, { weekday: 'long', month: 'long', day: 'numeric' }); return `${p.weekday}, ${p.month} ${p.day}` }
const nowLocal = (ms) => { const p = parts(ms, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }); return `${p.hour}:${p.minute}` }
const weekday = (ms) => parts(ms, { weekday: 'short' }).weekday.toLowerCase()
const iso = (ms) => (ms == null ? null : new Date(ms).toISOString())

// ---------- the SAMPLE centre ----------
const MOTHERS = ['Anne', 'Julie', 'Megan', 'Rachel', 'Lisa', 'Karen', 'Heather', 'Amy', 'Nicole', 'Laura', 'Erin', 'Jill', 'Beth', 'Carla', 'Dawn', 'Holly', 'Tina', 'Wendy']
const FATHERS = ['Paul', 'Mark', 'Chris', 'Dave', 'Mike', 'Steve', 'Ryan', 'Jason', 'Brian', 'Scott', 'Kyle', 'Adam', 'Greg', 'Neil', 'Shawn', 'Derek', 'Gary', 'Troy']
const KIDS = [
  ['c_ava', 'Ava M.', 'r_infant', '2025-03-02'], ['c_liam', 'Liam K.', 'r_infant', '2025-06-19'], ['c_nora', 'Nora B.', 'r_infant', '2024-12-05'],
  ['c_owen', 'Owen P.', 'r_infant', '2025-01-22', ['mon', 'wed', 'fri']], ['c_isla', 'Isla R.', 'r_infant', '2025-08-10', ['tue', 'thu']],
  ['c_jack', 'Jack W.', 'r_toddler', '2024-01-15'], ['c_emma', 'Emma L.', 'r_toddler', '2023-11-30'], ['c_leo', 'Leo F.', 'r_toddler', '2024-04-08'],
  ['c_chloe', 'Chloe H.', 'r_toddler', '2024-02-21'], ['c_finn', 'Finn D.', 'r_toddler', '2023-12-12'], ['c_maya', 'Maya S.', 'r_toddler', '2024-05-03'],
  ['c_ben', 'Ben C.', 'r_preschool', '2022-02-11'], ['c_lucy', 'Lucy G.', 'r_preschool', '2021-10-27'], ['c_sam', 'Sam N.', 'r_preschool', '2022-06-14'],
  ['c_grace', 'Grace V.', 'r_preschool', '2022-09-01'], ['c_eli', 'Eli J.', 'r_preschool', '2021-12-19'], ['c_zoe', 'Zoe A.', 'r_preschool', '2022-04-25'],
  ['c_max', 'Max T.', 'r_preschool', '2022-07-30'], ['c_ruby', 'Ruby E.', 'r_preschool', '2021-11-08'],
]

function seed() {
  const at = (minutesFromNine) => START + minutesFromNine * MIN
  const s = {
    v: 1,
    created: Date.now(),
    rooms: [
      { id: 'r_infant', name: 'Infant room', age_group: 'infant', active: true, sort: 1 },
      { id: 'r_toddler', name: 'Toddler room', age_group: 'toddler', active: true, sort: 2 },
      { id: 'r_preschool', name: 'Preschool room', age_group: 'preschool', active: true, sort: 3 },
    ],
    rules: { infant: [3, 6], toddler: [5, 10], preschool: [8, 16] },
    staff: [
      { id: 's_dana', name: 'Dana K. (SAMPLE)', initials: 'DK', role: 'supervisor', active: true, pin: '4826' },
      { id: 's_marie', name: 'Marie T. (SAMPLE)', initials: 'MT', role: 'educator', active: true, pin: '1593' },
      { id: 's_kevin', name: 'Kevin O. (SAMPLE)', initials: 'KO', role: 'educator', active: true, pin: '2604' },
      { id: 's_priya', name: 'Priya S. (SAMPLE)', initials: 'PS', role: 'educator', active: true, pin: '3715' },
    ],
    children: [],
    people: [],
    visits: [],
    placements: [],
    presence: [],
    logs: [],
    activity: {},
    lines: {},
    links: {},
    sessions: {},
    absences: [{ child_id: 'c_maya', date: '2026-09-14', reason: 'sick', reason_label: 'Sick' }],
    seq: 1,
  }
  KIDS.forEach(([id, short, room, dob, days], i) => {
    const initial = short.split(' ')[1]
    s.children.push({ id, name: `${short} (SAMPLE)`, initials: short.split(/\s+/).slice(0, 2).map((w) => w[0]).join(''), dob, home_room_id: room,
      schedule: days ? 'part_time' : 'full_time', days: days || ['mon', 'tue', 'wed', 'thu', 'fri'], start_date: '2026-01-05', end_date: null, active: true })
    const key = id.slice(2)
    const mother = id === 'c_ava' ? 'Sarah' : MOTHERS[i % MOTHERS.length]
    const father = id === 'c_ava' ? 'Tom' : FATHERS[i % FATHERS.length]
    s.people.push({ id: `p_${key}_mother`, child_id: id, name: `${mother} ${initial} (SAMPLE)`, relationship: 'Mother', may_pick_up: true, emergency_contact: true, active: true })
    s.people.push({ id: `p_${key}_father`, child_id: id, name: `${father} ${initial} (SAMPLE)`, relationship: 'Father', may_pick_up: true, emergency_contact: false, active: true })
  })
  s.people.push({ id: 'p_ava_gran', child_id: 'c_ava', name: 'Joan M. (SAMPLE)', relationship: 'Grandmother', may_pick_up: true, emergency_contact: false, active: true })
  s.people.push({ id: 'p_ava_neighbour', child_id: 'c_ava', name: 'Rick D. (SAMPLE)', relationship: 'Neighbour', may_pick_up: false, emergency_contact: false, active: true })

  const arrive = (cid, mins, room) => {
    s.visits.push({ id: `v_${s.seq++}`, child_id: cid, date: '2026-09-14', in_at: at(mins), in_by: `p_${cid.slice(2)}_mother`, in_recorded_by: null, out_at: null, out_by: null, out_recorded_by: null, awaiting: null })
    s.placements.push({ child_id: cid, room_id: room, from: at(mins), to: null })
  }
  arrive('c_ava', -55, 'r_infant'); arrive('c_liam', -40, 'r_infant'); arrive('c_nora', -25, 'r_infant')
  arrive('c_jack', -60, 'r_toddler'); arrive('c_emma', -45, 'r_toddler'); arrive('c_leo', -30, 'r_toddler')
  for (const [cid, m] of [['c_ben', -70], ['c_lucy', -62], ['c_sam', -50], ['c_grace', -48], ['c_eli', -35], ['c_zoe', -28], ['c_max', -20], ['c_ruby', -12]]) arrive(cid, m, 'r_preschool')
  arrive('c_finn', -15, 'r_toddler')
  s.placements.at(-1).to = at(-5)
  s.placements.push({ child_id: 'c_finn', room_id: 'r_preschool', from: at(-5), to: null })

  s.presence.push({ staff_id: 's_marie', room_id: 'r_infant', from: at(-90), to: null })
  s.presence.push({ staff_id: 's_kevin', room_id: 'r_toddler', from: at(-85), to: null })
  s.presence.push({ staff_id: 's_priya', room_id: 'r_preschool', from: at(-80), to: null })

  const log = (cid, kind, extra, mins, by = 's_marie') => s.logs.push({ id: `l_${s.seq++}`, child_id: cid, kind, value: null, meal: null, text: null, ...extra, at: at(mins), by, voided: false })
  log('c_ava', 'meal', { value: 'all', meal: 'breakfast' }, -30)
  log('c_ava', 'diaper', { value: 'wet' }, -20)
  log('c_ava', 'mood', { value: 'happy' }, -15)
  log('c_liam', 'nap_start', {}, -10)
  log('c_ben', 'meal', { value: 'some', meal: 'breakfast' }, -25, 's_priya')
  s.activity.r_infant = 'Sensory bins and songs on the mat.'
  return s
}

let S = null
function load() {
  try {
    if (new URLSearchParams(location.search).has('mockreset') && !sessionStorage.getItem('daycare-day-sheet:mock-reset-done')) {
      sessionStorage.setItem('daycare-day-sheet:mock-reset-done', '1')
      throw new Error('reset')
    }
    const s = JSON.parse(localStorage.getItem(KEY))
    if (s && s.v === 1 && Date.now() - s.created < 8 * 3600_000) return s
  } catch { /* seed below */ }
  const s = seed()
  save(s)
  return s
}
function save(s = S) { try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ } }
const now = () => START + (Date.now() - S.created)

// ---------- lookups ----------
const child = (id) => S.children.find((c) => c.id === id)
const staffById = (id) => S.staff.find((x) => x.id === id)
const person = (id) => S.people.find((p) => p.id === id)
const roomById = (id) => S.rooms.find((r) => r.id === id)
const openVisit = (cid) => S.visits.find((v) => v.child_id === cid && !v.out_at)
const openPlacement = (cid) => S.placements.find((p) => p.child_id === cid && !p.to)
const roomOf = (cid) => (openVisit(cid) ? openPlacement(cid)?.room_id || null : null)
const todayLogs = (cid) => S.logs.filter((l) => l.child_id === cid && !l.voided && localDate(l.at) === localDate(now())).sort((a, b) => a.at - b.at)
const napping = (cid) => todayLogs(cid).filter((l) => l.kind.startsWith('nap_')).at(-1)?.kind === 'nap_start'

const MEAL_LABEL = { breakfast: 'Breakfast', am_snack: 'Morning snack', lunch: 'Lunch', pm_snack: 'Afternoon snack' }
const VALUE_LABEL = { all: 'Ate all', some: 'Ate some', none: 'Ate none' }
const SIMPLE_LABEL = {
  diaper: { wet: 'Wet diaper', bm: 'BM diaper', dry: 'Dry diaper' },
  toilet: { went: 'Used the toilet', tried: 'Tried the toilet' },
  mood: { happy: 'Happy', okay: 'Okay', tired: 'Tired', upset: 'Upset' },
}
function logLabel(l) {
  if (l.kind === 'meal') return `${MEAL_LABEL[l.meal]}: ate ${l.value}`
  if (l.kind === 'nap_start') return 'Fell asleep'
  if (l.kind === 'nap_end') return 'Woke up'
  if (l.kind === 'note') return l.text
  return SIMPLE_LABEL[l.kind][l.value]
}
const logOut = (l) => ({ id: l.id, kind: l.kind, value: l.value, meal: l.meal, text: l.text, at: iso(l.at), time_label: timeLabel(l.at), label: logLabel(l), by: { id: l.by, initials: staffById(l.by).initials } })

function meter(room) {
  const children = S.children.filter((c) => roomOf(c.id) === room.id).length
  const staff = S.presence.filter((p) => !p.to && p.room_id === room.id).length
  const [per, max] = S.rules[room.age_group] || [null, null]
  const C = children === 1 ? '1 child' : `${children} children`
  const St = `${staff} staff`
  const allowed = per == null || max == null ? null : Math.min(staff * per, max)
  const m = { room_id: room.id, room_name: room.name, age_group: room.age_group, children, staff, children_per_caregiver: per, max_children: max, allowed }
  const is = (state, state_label, label, needs_staff) => ({ ...m, state, state_label, needs_staff, label })
  if (children === 0) return is('ok', 'OK', 'No children in the room.', 0)
  if (allowed === null) return is('unset', 'Not set', 'Ratio not set. A supervisor fills it in under Office, Rooms and ratios.', null)
  if (staff === 0) return is('over', 'Over', `${C} with no staff in the room.`, children <= max ? Math.ceil(children / per) : null)
  if (children > max) return is('over', 'Over', `${C}, ${St}. Over the most this room can hold (${max}).`, null)
  if (children > staff * per) { const k = Math.ceil(children / per) - staff; return is('over', 'Over', `${C}, ${St}. Over the ratio: ${St} can have ${staff * per}. Needs ${k} more staff.`, k) }
  if (children === allowed) return is('at_limit', 'At the limit', `${C}, ${St}. At the limit.`, 0)
  return is('ok', 'OK', `${C}, ${St}. Room for ${allowed - children} more.`, 0)
}

function ageLabel(dob) {
  const [y, m, d] = dob.split('-').map(Number)
  const [ty, tm, td] = localDate(now()).split('-').map(Number)
  let months = (ty - y) * 12 + (tm - m) - (td < d ? 1 : 0)
  const years = Math.floor(months / 12)
  months -= years * 12
  const yl = years ? `${years} year${years === 1 ? '' : 's'}` : ''
  const ml = months ? `${months} month${months === 1 ? '' : 's'}` : ''
  return [yl, ml].filter(Boolean).join(' ') || '0 months'
}
function childOut(c) {
  const rid = roomOf(c.id)
  return { id: c.id, name: c.name, initials: c.initials, dob: c.dob, age_label: ageLabel(c.dob), home_room_id: c.home_room_id, room_id: rid,
    room_name: rid ? roomById(rid).name : null, schedule: c.schedule, days: c.days, start_date: c.start_date, end_date: c.end_date, active: c.active }
}
function visitOut(v) {
  const by = (pid) => { const p = person(pid); return p ? { id: p.id, name: p.name, relationship: p.relationship } : null }
  const rec = (sid) => (sid ? { id: sid, initials: staffById(sid).initials } : null)
  return { id: v.id, child_id: v.child_id, date: v.date, in_at: iso(v.in_at), in_label: timeLabel(v.in_at), in_by: by(v.in_by), in_signature_svg: null,
    in_recorded_by: rec(v.in_recorded_by), out_at: iso(v.out_at), out_label: v.out_at ? timeLabel(v.out_at) : null, out_by: by(v.out_by),
    out_signature_svg: null, out_recorded_by: rec(v.out_recorded_by), awaiting_signature: v.awaiting, edited: false, edits: [] }
}

function minutesLabel(m) {
  if (m < 60) return `${m} min`
  return `${Math.floor(m / 60)} h ${m % 60} min`
}
function noteFor(cid, date) {
  const c = child(cid)
  const logs = todayLogs(cid)
  const visits = S.visits.filter((v) => v.child_id === cid && v.date === date).sort((a, b) => a.in_at - b.in_at)
  const home = roomById(roomOf(cid) || c.home_room_id)
  const naps = []
  let start = null
  for (const l of logs) {
    if (l.kind === 'nap_start') start = l
    if (l.kind === 'nap_end' && start) {
      const minutes = Math.floor(l.at / MIN) - Math.floor(start.at / MIN)
      naps.push({ label: `${timeLabel(start.at)} to ${timeLabel(l.at)} (${minutesLabel(minutes)})`, minutes })
      start = null
    }
  }
  if (start) naps.push({ label: `Asleep since ${timeLabel(start.at)}`, minutes: null })
  const placedRooms = [...new Set(S.placements.filter((p) => p.child_id === cid && localDate(p.from) === date).map((p) => p.room_id))]
  const last = visits.at(-1)
  return {
    centre_name: 'SAMPLE Little Harbour Child Care (demo)', sample: true,
    child: { name: c.name, initials: c.initials, room_name: home.name, age_group: roomById(c.home_room_id).age_group },
    date, long_label: longLabel(now()),
    arrived: visits[0] ? { time_label: timeLabel(visits[0].in_at), by: person(visits[0].in_by)?.name } : null,
    left: last?.out_at ? { time_label: timeLabel(last.out_at), by: person(last.out_by)?.name } : null,
    meals: logs.filter((l) => l.kind === 'meal').map((l) => ({ meal_label: MEAL_LABEL[l.meal], value_label: VALUE_LABEL[l.value], time_label: timeLabel(l.at) })),
    naps,
    toileting: logs.filter((l) => l.kind === 'diaper' || l.kind === 'toilet').map((l) => ({ label: logLabel(l), time_label: timeLabel(l.at) })),
    moods: logs.filter((l) => l.kind === 'mood').map((l) => ({ label: logLabel(l), time_label: timeLabel(l.at) })),
    activities: placedRooms.filter((rid) => S.activity[rid]).map((rid) => ({ room_name: roomById(rid).name, text: S.activity[rid] })),
    staff_notes: logs.filter((l) => l.kind === 'note').map((l) => ({ text: l.text, time_label: timeLabel(l.at), by_initials: staffById(l.by).initials })),
    note_line: S.lines[cid] || null,
    infant_record: roomById(c.home_room_id).age_group === 'infant',
    updated_label: `Updated ${timeLabel(now())}`,
  }
}

// ---------- answers ----------
const ok = (body, status = 200) => ({ status, body: JSON.parse(JSON.stringify(body)) })
const fail = (status, code, error, field) => ({ status, body: { error, code, ...(field ? { field } : {}) } })
const randomToken = () => btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(32)))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')

export async function handle(method, path, body = {}, headers = {}) {
  S = load()
  await new Promise((r) => setTimeout(r, 40))
  const res = route(method, new URL(path, 'http://mock').pathname, body || {}, headers)
  save()
  return res
}

function route(method, p, body, headers) {
  let m
  const t = now()
  const date = localDate(t)
  if (method === 'GET' && p === '/api/info') {
    return ok({ centre_name: 'SAMPLE Little Harbour Child Care (demo)', sample: true, phone: '709-555-0100', zone: ZONE, today: date, date_label: dateLabel(t), long_label: longLabel(t), now: iso(t), now_local: nowLocal(t), time_label: timeLabel(t) })
  }
  if (method === 'POST' && p === '/api/signin') {
    const s = S.staff.find((x) => x.active && x.pin === String(body.pin || ''))
    if (!s) return fail(401, 'unauthorized', 'That PIN is not right.', 'pin')
    const token = randomToken()
    S.sessions[token] = s.id
    return ok({ token, role: s.role, staff: { id: s.id, name: s.name, initials: s.initials }, expires_at: iso(t + 12 * 3600_000) })
  }
  if (method === 'GET' && (m = p.match(/^\/api\/note\/([^/]+)$/))) {
    const link = S.links[decodeURIComponent(m[1])]
    if (!link) return fail(404, 'not_found', 'We couldn\'t find that note. Ask the centre for a new link.')
    return ok(noteFor(link.child_id, link.date))
  }

  const token = (headers.Authorization || '').replace(/^Bearer /, '')
  const me = staffById(S.sessions[token])
  if (!me) return fail(401, 'unauthorized', 'Please sign in again.')

  if (method === 'POST' && p === '/api/signout') { delete S.sessions[token]; return ok({ ok: true }) }

  if (method === 'GET' && p === '/api/staff/today') {
    const booked = (c) => c.active && c.days.includes(weekday(t))
    const visitsToday = (cid) => S.visits.filter((v) => v.child_id === cid && v.date === date)
    const away = S.absences.filter((a) => a.date === date)
    const sortName = (a, b) => a.name.localeCompare(b.name)
    return ok({
      date, date_label: dateLabel(t), now: iso(t), now_local: nowLocal(t), centre_name: 'SAMPLE Little Harbour Child Care (demo)', sample: true,
      me: { staff: { id: me.id, name: me.name, initials: me.initials, role: me.role, active: true }, room_id: S.presence.find((x) => !x.to && x.staff_id === me.id)?.room_id || null },
      rooms: S.rooms.map((room) => ({
        room,
        meter: meter(room),
        children: S.children.filter((c) => roomOf(c.id) === room.id).sort(sortName).map((c) => ({
          id: c.id, name: c.name, initials: c.initials, in_label: timeLabel(openVisit(c.id).in_at), napping: napping(c.id),
          last_meal_label: (() => { const l = todayLogs(c.id).filter((x) => x.kind === 'meal').at(-1); return l ? logLabel(l) : null })(),
          awaiting_signature: S.visits.some((v) => v.child_id === c.id && v.awaiting),
        })),
        staff: S.presence.filter((x) => !x.to && x.room_id === room.id).map((x) => { const s = staffById(x.staff_id); return { id: s.id, name: s.name, initials: s.initials, since_label: timeLabel(x.from) } }),
      })),
      not_in_yet: S.children.filter((c) => booked(c) && !visitsToday(c.id).length && !away.some((a) => a.child_id === c.id)).sort(sortName).map(childOut),
      away: away.map((a) => ({ child: childOut(child(a.child_id)), reason_label: a.reason_label })),
      gone_home: S.children.filter((c) => visitsToday(c.id).length && !openVisit(c.id)).sort(sortName).map(childOut),
    })
  }

  if (method === 'POST' && p === '/api/staff/presence') {
    const sid = body.staff_id || me.id
    if (sid !== me.id && me.role !== 'supervisor') return fail(403, 'forbidden', 'Only the supervisor can move someone else.')
    for (const x of S.presence) if (!x.to && x.staff_id === sid) x.to = t
    if (body.room_id) {
      if (!roomById(body.room_id)) return fail(404, 'not_found', 'We couldn\'t find that room.')
      S.presence.push({ staff_id: sid, room_id: body.room_id, from: t, to: null })
    }
    return ok({ rooms: S.rooms.map(meter) })
  }

  if ((m = p.match(/^\/api\/staff\/logs\/([^/]+)$/)) && method === 'DELETE') {
    const l = S.logs.find((x) => x.id === m[1] && !x.voided)
    if (!l) return fail(404, 'not_found', 'We couldn\'t find that log.')
    if (me.role !== 'supervisor' && l.by !== me.id) return fail(403, 'forbidden', 'You can only undo your own logs.')
    l.voided = true
    return ok({ ok: true })
  }

  if ((m = p.match(/^\/api\/staff\/rooms\/([^/]+)\/activity$/)) && method === 'PUT') {
    const text = String(body.text ?? '')
    if (text.length > 500) return fail(400, 'bad_request', 'Keep it to 500 characters.', 'text')
    S.activity[m[1]] = text.trim()
    return ok({ date, room_id: m[1], text: S.activity[m[1]] })
  }

  if (!(m = p.match(/^\/api\/staff\/children\/([^/]+)(\/.*)?$/))) return fail(404, 'not_found', 'Not in the mock.')
  const c = child(m[1])
  if (!c) return fail(404, 'not_found', 'We couldn\'t find that child.')
  const rest = m[2] || ''

  if (method === 'GET' && rest === '') {
    const vs = S.visits.filter((v) => v.child_id === c.id && v.date === date).sort((a, b) => a.in_at - b.in_at)
    const v = openVisit(c.id) || vs.at(-1)
    return ok({ child: childOut(c), visit: v ? visitOut(v) : null, logs: todayLogs(c.id).map(logOut),
      people: S.people.filter((x) => x.child_id === c.id && x.active).map((x) => ({ id: x.id, name: x.name, relationship: x.relationship, may_pick_up: x.may_pick_up })) })
  }
  if (method === 'POST' && rest === '/logs') {
    if (!openVisit(c.id)) return fail(409, 'not_in', `${c.name} is not signed in.`)
    const kinds = { meal: ['all', 'some', 'none'], diaper: ['wet', 'bm', 'dry'], toilet: ['went', 'tried'], mood: ['happy', 'okay', 'tired', 'upset'] }
    const l = { id: `l_${S.seq++}`, child_id: c.id, kind: body.kind, value: null, meal: null, text: null, at: t, by: me.id, voided: false }
    if (kinds[body.kind]) {
      if (!kinds[body.kind].includes(body.value)) return fail(400, 'bad_request', 'Pick one of the buttons.', 'value')
      l.value = body.value
      if (body.kind === 'meal') {
        if (!MEAL_LABEL[body.meal]) return fail(400, 'bad_request', 'Pick a meal.', 'meal')
        l.meal = body.meal
      }
    } else if (body.kind === 'nap_start') {
      if (napping(c.id)) return fail(409, 'already_napping', `${c.name} is already asleep.`)
    } else if (body.kind === 'nap_end') {
      if (!napping(c.id)) return fail(409, 'not_napping', `${c.name} is not asleep.`)
    } else if (body.kind === 'note') {
      const text = String(body.text ?? '').trim()
      if (!text || text.length > 280) return fail(400, 'bad_request', 'Write a note of 1 to 280 characters.', 'text')
      l.text = text
    } else {
      return fail(400, 'bad_request', 'That is not a kind of log.', 'kind')
    }
    S.logs.push(l)
    return ok({ log: logOut(l) }, 201)
  }
  if (method === 'POST' && rest === '/move') {
    if (!openVisit(c.id)) return fail(409, 'not_in', `${c.name} is not signed in.`)
    const to = roomById(body.room_id)
    const pl = openPlacement(c.id)
    if (!to || !to.active || pl.room_id === to.id) return fail(400, 'bad_request', 'Pick another room.', 'room_id')
    const from = roomById(pl.room_id)
    pl.to = t
    S.placements.push({ child_id: c.id, room_id: to.id, from: t, to: null })
    return ok({ from: meter(from), to: meter(to), message: `${c.name} moved to ${to.name}.` })
  }
  if (method === 'POST' && rest === '/in') {
    if (openVisit(c.id)) return fail(409, 'already_in', `${c.name} is already signed in.`)
    const who = person(body.person_id)
    if (!who || who.child_id !== c.id || !who.active) return fail(403, 'not_on_list', `That person is not on ${c.name}'s list. Get the supervisor.`)
    const v = { id: `v_${S.seq++}`, child_id: c.id, date, in_at: t, in_by: who.id, in_recorded_by: me.id, out_at: null, out_by: null, out_recorded_by: null, awaiting: 'in' }
    S.visits.push(v)
    S.placements.push({ child_id: c.id, room_id: c.home_room_id, from: t, to: null })
    return ok({ visit: visitOut(v), meter: meter(roomById(c.home_room_id)), message: `${c.name} signed in at ${timeLabel(t)} by ${who.name}.` }, 201)
  }
  if (method === 'GET' && rest.startsWith('/note')) return ok(noteFor(c.id, date))
  if (method === 'PUT' && rest === '/note') {
    const text = String(body.text ?? '')
    if (text.length > 500) return fail(400, 'bad_request', 'Keep it to 500 characters.', 'text')
    S.lines[c.id] = text.trim() || null
    return ok(noteFor(c.id, date))
  }
  if (method === 'POST' && rest === '/note/link') {
    const tokenValue = randomToken()
    S.links[tokenValue] = { child_id: c.id, date }
    return ok({ token: tokenValue, url: `/note/?t=${tokenValue}&mock=1`, date, expires_at: '2026-09-15T02:30:00.000Z', expires_label: 'Works until midnight tonight.' }, 201)
  }
  return fail(404, 'not_found', 'Not in the mock.')
}
