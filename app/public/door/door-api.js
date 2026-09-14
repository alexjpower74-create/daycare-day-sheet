// The door tablet's only way to the API (docs/API.md door routes). Same-origin fetch. The 30-day device token lives in
// localStorage under daycare-day-sheet:door-token; a 401 forgets it, so the page shows "Set up this tablet" again.
export const TOKEN_KEY = 'daycare-day-sheet:door-token'

let memoryToken = null

export const doorSession = {
  token() {
    try { return localStorage.getItem(TOKEN_KEY) || memoryToken } catch { return memoryToken }
  },
  save(token) {
    memoryToken = token
    try { localStorage.setItem(TOKEN_KEY, token) } catch { /* private mode: this page load only */ }
  },
  clear() {
    memoryToken = null
    try { localStorage.removeItem(TOKEN_KEY) } catch { /* nothing stored */ }
  },
}

// Carries the API's own words (`error`), `code` and `field`, so the page shows them as they are.
export class DoorApiError extends Error {
  constructor(status, body) {
    super(body?.error || (status ? 'Something went wrong. Try again.' : "Could not reach the centre's computer. Check the connection."))
    this.status = status
    this.code = body?.code || (status ? 'error' : 'network')
    this.field = body?.field || null
  }
}

async function call(method, path, body, { auth = true } = {}) {
  const headers = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = auth ? doorSession.token() : null
  if (token) headers.Authorization = `Bearer ${token}`
  let r
  try {
    r = await fetch(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), cache: 'no-store' })
  } catch {
    throw new DoorApiError(0, null)
  }
  let parsed = null
  try { parsed = await r.json() } catch { parsed = null }
  if (r.ok) return parsed
  if (auth && r.status === 401) doorSession.clear()
  throw new DoorApiError(r.status, parsed)
}

const id = encodeURIComponent

export const doorApi = {
  info: () => call('GET', '/api/info', undefined, { auth: false }),
  async unlock(pin) {
    const r = await call('POST', '/api/door/unlock', { pin }, { auth: false })
    doorSession.save(r.token)
    return r
  },
  children: () => call('GET', '/api/door/children'),
  child: (childId) => call('GET', `/api/door/children/${id(childId)}`),
  signIn: (childId, personId, signature) => call('POST', `/api/door/children/${id(childId)}/in`, { person_id: personId, signature }),
  signOut: (childId, personId, signature) => call('POST', `/api/door/children/${id(childId)}/out`, { person_id: personId, signature }),
  addSignature: (visitId, which, personId, signature) =>
    call('POST', `/api/door/visits/${id(visitId)}/sign`, { which, person_id: personId, signature }),
}
