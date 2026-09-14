// PINs (PBKDF2-SHA-256, 100 000 iterations, per-staff salt), bearer tokens (stored as SHA-256) and the wrong-PIN guard.
import { clientIp } from './clock.js'
import { ApiError, forbidden, unauthorized } from './http.js'

export const PBKDF2_ITERATIONS = 100000
export const STAFF_HOURS = 12
export const DOOR_DAYS = 30
export const PIN_WRONG_MAX = 5
export const PIN_WINDOW_MS = 15 * 60e3
export const PIN_RE = /^\d{4,6}$/
export const WRONG_PIN = 'That PIN is not right.'

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
const unhex = (s) => new Uint8Array(s.match(/../g).map((h) => parseInt(h, 16)))

export async function hashPin(pin, saltHex) {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: unhex(saltHex), iterations: PBKDF2_ITERATIONS }, key, 256)
  return hex(bits)
}

export function sameHex(a, b) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export const sha256Hex = async (text) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

// 32 random bytes → 43 base64url characters.
export function randomToken(bytes = 32) {
  const b = crypto.getRandomValues(new Uint8Array(bytes))
  return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export const randomId = (prefix) => `${prefix}_${hex(crypto.getRandomValues(new Uint8Array(8)))}`
export const randomSaltHex = () => hex(crypto.getRandomValues(new Uint8Array(16)))

// ---------- the wrong-PIN guard (per client IP) ----------

const ipOf = (c) => clientIp(c.request, c.env)

// 5 wrong PINs from one IP within 15 minutes → 429 for the rest of that window, even for the right PIN.
export async function assertPinAllowed(c) {
  const r = await c.db.prepare('SELECT COUNT(*) AS n FROM pin_attempts WHERE ip = ? AND ok = 0 AND at > ?')
    .bind(ipOf(c), new Date(c.now.getTime() - PIN_WINDOW_MS).toISOString()).first()
  if (r.n >= PIN_WRONG_MAX) throw new ApiError(429, 'rate_limited', 'Too many tries. Wait 15 minutes, then try again.')
}

export async function recordWrongPin(c) {
  await c.db.prepare('INSERT INTO pin_attempts (ip, ok, at) VALUES (?, 0, ?)').bind(ipOf(c), c.nowIso).run()
}

// The active staff member whose PIN this is, or null.
export async function staffByPin(c, pin) {
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) return null
  const { results } = await c.db.prepare('SELECT * FROM staff WHERE active = 1 ORDER BY id').all()
  for (const s of results) {
    if (sameHex(await hashPin(pin, s.pin_salt), s.pin_hash)) return s
  }
  return null
}

// ---------- sessions ----------

export async function createSession(c, kind, staffId, ms) {
  const token = randomToken()
  const expires = new Date(c.now.getTime() + ms).toISOString()
  await c.db.prepare('INSERT INTO sessions (token_hash, kind, staff_id, created_at, expires_at) VALUES (?, ?, ?, ?, ?)')
    .bind(await sha256Hex(token), kind, staffId, c.nowIso, expires).run()
  return { token, expires_at: expires }
}

// access: 'any' | 'door' | 'staff' | 'office'. Sets c.session, c.staff (the staff row for staff tokens) and c.role.
export async function requireAccess(c, access) {
  const h = c.request.headers.get('Authorization') || ''
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : ''
  if (!token) throw unauthorized('Sign in first.')
  const hash = await sha256Hex(token)
  const row = await c.db.prepare(`SELECT s.token_hash, s.kind, s.staff_id, st.role, st.active, st.name, st.initials
    FROM sessions s JOIN staff st ON st.id = s.staff_id WHERE s.token_hash = ? AND s.expires_at > ?`)
    .bind(hash, c.nowIso).first()
  if (!row || (row.kind === 'staff' && row.active !== 1)) throw unauthorized('Your sign-in has run out. Sign in again.')
  c.session = row
  c.role = row.kind === 'door' ? 'door' : row.role
  c.staff = row.kind === 'staff' ? { id: row.staff_id, name: row.name, initials: row.initials, role: row.role } : null
  if (access === 'door' && c.role !== 'door') throw forbidden('This is for the door tablet only.')
  if (access === 'staff' && c.role === 'door') throw forbidden('The door tablet cannot open staff pages. Sign in with your own PIN.')
  if (access === 'office' && c.role !== 'supervisor') throw forbidden('Only the supervisor can open the office.')
}
