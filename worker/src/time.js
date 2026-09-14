// Centre-local dates, labels and midnights in America/St_Johns. Pure (Intl only), so the unit tests run it in node.
export const TZ = 'America/St_Johns'

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October',
  'November', 'December']
export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun']
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/

const partsFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23',
})

// The wall clock in St. John's at an instant: { date: 'YYYY-MM-DD', hour, minute, second }.
export function localParts(instant) {
  const p = {}
  for (const x of partsFormat.formatToParts(new Date(instant))) p[x.type] = x.value
  return { date: `${p.year}-${p.month}-${p.day}`, hour: Number(p.hour) % 24, minute: Number(p.minute), second: Number(p.second) }
}

export const localDate = (instant) => localParts(instant).date

// "09:00"
export function localHHMM(instant) {
  const { hour, minute } = localParts(instant)
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`
}

const utcOf = (date) => {
  const [y, m, d] = date.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d))
}

export function isValidDate(date) {
  return typeof date === 'string' && DATE_RE.test(date) && utcOf(date).toISOString().slice(0, 10) === date
}

export function addDays(date, n) {
  const t = utcOf(date)
  t.setUTCDate(t.getUTCDate() + n)
  return t.toISOString().slice(0, 10)
}

// 'mon' … 'sun'
export const weekdayKey = (date) => WEEKDAY_KEYS[(utcOf(date).getUTCDay() + 6) % 7]

// "Mon Sep 14"
export function dateLabel(date) {
  const t = utcOf(date)
  return `${DAYS[(t.getUTCDay() + 6) % 7].slice(0, 3)} ${MONTHS[t.getUTCMonth()].slice(0, 3)} ${t.getUTCDate()}`
}

// "Monday, September 14"
export function longLabel(date) {
  const t = utcOf(date)
  return `${DAYS[(t.getUTCDay() + 6) % 7]}, ${MONTHS[t.getUTCMonth()]} ${t.getUTCDate()}`
}

// "8:05 AM"
export function timeLabel(instant) {
  const { hour, minute } = localParts(instant)
  return `${hour % 12 === 0 ? 12 : hour % 12}:${String(minute).padStart(2, '0')} ${hour < 12 ? 'AM' : 'PM'}`
}

// The instant of a St. John's wall time, or null inside the spring-forward gap. In the repeated fall-back hour the
// earlier instant wins. Newfoundland is UTC−2:30 (NDT) or UTC−3:30 (NST).
export function localInstant(date, hour = 0, minute = 0) {
  const [y, m, d] = date.split('-').map(Number)
  const wall = Date.UTC(y, m - 1, d, hour, minute)
  const hits = [150, 210].map((off) => wall + off * 60000).filter((t) => {
    const p = localParts(t)
    return p.date === date && p.hour === hour && p.minute === minute
  })
  return hits.length ? new Date(Math.min(...hits)) : null
}

// The local midnight that starts / ends a date. DST changes at 2:00 AM, so midnight always exists exactly once.
export const startOfDate = (date) => localInstant(date, 0, 0)
export const endOfDate = (date) => localInstant(addDays(date, 1), 0, 0)

// Whole minutes of a span: floor at both ends, so the parts of a span always add up to the whole.
export const minutesBetween = (start, end) =>
  Math.floor(new Date(end).getTime() / 60000) - Math.floor(new Date(start).getTime() / 60000)

// "1 h 25 min", "45 min", "2 h"
export function durationLabel(minutes) {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} min`
  return m ? `${h} h ${m} min` : `${h} h`
}

// "1 year 6 months", "8 months", "2 years"
export function ageLabel(dob, today) {
  const [by, bm, bd] = dob.split('-').map(Number)
  const [ty, tm, td] = today.split('-').map(Number)
  let months = (ty - by) * 12 + (tm - bm)
  if (td < bd) months--
  months = Math.max(0, months)
  const y = Math.floor(months / 12)
  const m = months % 12
  const parts = []
  if (y) parts.push(`${y} ${y === 1 ? 'year' : 'years'}`)
  if (m || !y) parts.push(`${m} ${m === 1 ? 'month' : 'months'}`)
  return parts.join(' ')
}
