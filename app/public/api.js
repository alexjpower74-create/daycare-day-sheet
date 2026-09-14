// The one door to docs/API.md for the room view, the daily notes and the office. Same-origin fetch('/api/…') only.
// Errors come back as ApiError carrying the API's own `error` text, `code` and `field`, so pages show them as they are.

export class ApiError extends Error {
  constructor(status, body) {
    super((body && body.error) || 'Something went wrong. Try again.')
    this.status = status
    this.code = (body && body.code) || 'network'
    this.field = (body && body.field) || null
  }
}

const TOKEN_KEY = 'daycare-day-sheet:staff-token'
const STAFF_KEY = 'daycare-day-sheet:staff'

async function send(method, path, body, headers) {
  let r
  try {
    r = await fetch(path, {
      method,
      headers: { ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
    })
  } catch {
    return { status: 0, body: { error: 'Could not reach the centre\'s server. Check the connection and try again.', code: 'network' } }
  }
  const text = await r.text()
  let parsed = null
  try { parsed = text ? JSON.parse(text) : null } catch { parsed = null }
  return { status: r.status, body: parsed }
}

/** Call the API; resolves with the JSON body, rejects with ApiError. A 401 on a staff call forgets the token. */
export async function call(method, path, body, { auth = false } = {}) {
  const headers = {}
  if (auth) {
    const t = staffSession.token()
    if (t) headers.Authorization = `Bearer ${t}`
  }
  const r = await send(method, path, body, headers)
  if (r.status >= 200 && r.status < 300) return r.body
  if (auth && r.status === 401) staffSession.clear()
  throw new ApiError(r.status, r.body)
}

const store = {
  get(k) { try { return localStorage.getItem(k) } catch { return null } },
  set(k, v) { try { localStorage.setItem(k, v) } catch { /* private mode: session lasts this page only */ } },
  del(k) { try { localStorage.removeItem(k) } catch { /* ignore */ } },
}
let memoryToken = null
let memoryStaff = null

/** The staff member signed in on this phone (12-hour token from POST /api/signin). */
export const staffSession = {
  token: () => store.get(TOKEN_KEY) || memoryToken,
  staff() {
    if (memoryStaff) return memoryStaff
    try { return JSON.parse(store.get(STAFF_KEY) || 'null') } catch { return null }
  },
  role: () => staffSession.staff()?.role || null,
  save({ token, role, staff }) {
    memoryToken = token
    memoryStaff = { ...staff, role }
    store.set(TOKEN_KEY, token)
    store.set(STAFF_KEY, JSON.stringify(memoryStaff))
  },
  clear() {
    memoryToken = null
    memoryStaff = null
    store.del(TOKEN_KEY)
    store.del(STAFF_KEY)
  },
}

const id = encodeURIComponent

export const api = {
  info: () => call('GET', '/api/info'),

  // Staff sign-in and out
  async signin(pin) {
    const r = await call('POST', '/api/signin', { pin })
    staffSession.save(r)
    return r
  },
  async signout() {
    try { await call('POST', '/api/signout', undefined, { auth: true }) } finally { staffSession.clear() }
  },

  // Room view
  today: () => call('GET', '/api/staff/today', undefined, { auth: true }),
  presence: (roomId) => call('POST', '/api/staff/presence', { room_id: roomId }, { auth: true }),
  child: (childId) => call('GET', `/api/staff/children/${id(childId)}`, undefined, { auth: true }),
  log: (childId, body) => call('POST', `/api/staff/children/${id(childId)}/logs`, body, { auth: true }),
  undo: (logId) => call('DELETE', `/api/staff/logs/${id(logId)}`, undefined, { auth: true }),
  move: (childId, roomId) => call('POST', `/api/staff/children/${id(childId)}/move`, { room_id: roomId }, { auth: true }),
  recordIn: (childId, personId) => call('POST', `/api/staff/children/${id(childId)}/in`, { person_id: personId }, { auth: true }),
  recordOut: (childId, personId) => call('POST', `/api/staff/children/${id(childId)}/out`, { person_id: personId }, { auth: true }),

  // Daily note (staff)
  activity: (roomId, text) => call('PUT', `/api/staff/rooms/${id(roomId)}/activity`, { text }, { auth: true }),
  note: (childId, date) => call('GET', `/api/staff/children/${id(childId)}/note${date ? `?date=${id(date)}` : ''}`, undefined, { auth: true }),
  saveLine: (childId, text, date) => call('PUT', `/api/staff/children/${id(childId)}/note`, date ? { text, date } : { text }, { auth: true }),
  makeLink: (childId) => call('POST', `/api/staff/children/${id(childId)}/note/link`, undefined, { auth: true }),

  // Parent link (public)
  parentNote: (token) => call('GET', `/api/note/${id(token)}`),

  // Office (supervisor)
  officeChildren: () => call('GET', '/api/office/children', undefined, { auth: true }),
  addChild: (body) => call('POST', '/api/office/children', body, { auth: true }),
  saveChild: (childId, body) => call('PUT', `/api/office/children/${id(childId)}`, body, { auth: true }),
  addPerson: (childId, body) => call('POST', `/api/office/children/${id(childId)}/people`, body, { auth: true }),
  savePerson: (personId, body) => call('PUT', `/api/office/people/${id(personId)}`, body, { auth: true }),
  removePerson: (personId) => call('DELETE', `/api/office/people/${id(personId)}`, undefined, { auth: true }),
  rooms: () => call('GET', '/api/office/rooms', undefined, { auth: true }),
  addRoom: (body) => call('POST', '/api/office/rooms', body, { auth: true }),
  saveRoom: (roomId, body) => call('PUT', `/api/office/rooms/${id(roomId)}`, body, { auth: true }),
  ratios: () => call('GET', '/api/office/ratios', undefined, { auth: true }),
  saveRatio: (group, body) => call('PUT', `/api/office/ratios/${id(group)}`, body, { auth: true }),
  resetRatio: (group) => call('POST', `/api/office/ratios/${id(group)}/reset`, undefined, { auth: true }),
  staffList: () => call('GET', '/api/office/staff', undefined, { auth: true }),
  addStaff: (body) => call('POST', '/api/office/staff', body, { auth: true }),
  saveStaff: (staffId, body) => call('PUT', `/api/office/staff/${id(staffId)}`, body, { auth: true }),
  addAbsence: (body) => call('POST', '/api/office/absences', body, { auth: true }),
  removeAbsence: (absenceId) => call('DELETE', `/api/office/absences/${id(absenceId)}`, undefined, { auth: true }),
  fixVisit: (visitId, body) => call('PUT', `/api/office/visits/${id(visitId)}`, body, { auth: true }),
  attendance: (from, to) => call('GET', `/api/office/attendance?from=${id(from)}&to=${id(to)}`, undefined, { auth: true }),
  register: (date, roomId) => call('GET', `/api/office/register?date=${id(date)}&room_id=${id(roomId)}`, undefined, { auth: true }),
  followUps: () => call('GET', '/api/office/follow-ups', undefined, { auth: true }),

  /** A CSV export as the Worker sent it (bytes untouched), with the filename from Content-Disposition. */
  async download(path) {
    const token = staffSession.token()
    let r
    try {
      r = await fetch(path, { headers: token ? { Authorization: `Bearer ${token}` } : {}, cache: 'no-store' })
    } catch {
      throw new ApiError(0, { error: 'Could not reach the centre\'s server. Check the connection and try again.', code: 'network' })
    }
    if (!r.ok) {
      let body = null
      try { body = await r.json() } catch { body = null }
      if (r.status === 401) staffSession.clear()
      throw new ApiError(r.status, body)
    }
    const match = (r.headers.get('Content-Disposition') || '').match(/filename="([^"]+)"/)
    return { blob: await r.blob(), filename: match ? match[1] : 'attendance.csv' }
  },
}
