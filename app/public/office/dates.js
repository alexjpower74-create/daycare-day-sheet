// Calendar arithmetic on the API's centre-local YYYY-MM-DD dates. Pure integer maths (days since 1970-01-01), no Date object, so
// the browser's clock and zone can never leak into the office. "Today" always comes from GET /api/info.
const pad = (n) => String(n).padStart(2, '0')
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_LONG = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

export function toDays(ymd) {
  let [y, m, d] = ymd.split('-').map(Number)
  y -= m <= 2 ? 1 : 0
  const era = Math.floor(y / 400)
  const yoe = y - era * 400
  const doy = Math.floor((153 * ((m + 9) % 12) + 2) / 5) + d - 1
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy
  return era * 146097 + doe - 719468
}

export function fromDays(days) {
  const z = days + 719468
  const era = Math.floor(z / 146097)
  const doe = z - era * 146097
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365)
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100))
  const mp = Math.floor((5 * doy + 2) / 153)
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1
  const m = mp < 10 ? mp + 3 : mp - 9
  const y = yoe + era * 400 + (m <= 2 ? 1 : 0)
  return `${y}-${pad(m)}-${pad(d)}`
}

export const addDays = (ymd, n) => fromDays(toDays(ymd) + n)
/** 0 = Monday … 6 = Sunday (1970-01-01 was a Thursday). */
export const weekdayIndex = (ymd) => (((toDays(ymd) + 3) % 7) + 7) % 7
const parts = (ymd) => ymd.split('-').map(Number)

/** The dates a view shows: a day, the Monday-to-Sunday week, or the calendar month holding `anchor`. */
export function range(view, anchor) {
  if (view === 'day') return { from: anchor, to: anchor }
  if (view === 'week') {
    const from = addDays(anchor, -weekdayIndex(anchor))
    return { from, to: addDays(from, 6) }
  }
  const [y, m] = parts(anchor)
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${pad(m + 1)}-01`
  return { from: `${y}-${pad(m)}-01`, to: addDays(next, -1) }
}

/** Move the anchor one view back (-1) or forward (+1). */
export function shift(view, anchor, dir) {
  if (view === 'day') return addDays(anchor, dir)
  if (view === 'week') return addDays(anchor, 7 * dir)
  const [y, m] = parts(anchor)
  const total = y * 12 + (m - 1) + dir
  return `${Math.floor(total / 12)}-${pad((total % 12) + 1)}-01`
}

export const shortLabel = (ymd) => `${WEEKDAYS[weekdayIndex(ymd)]} ${parts(ymd)[2]}`
export const longDate = (ymd) => { const [y, m, d] = parts(ymd); return `${MONTHS[m - 1]} ${d}, ${y}` }
export const dayLabel = (ymd) => `${WEEKDAYS_LONG[weekdayIndex(ymd)]}, ${longDate(ymd)}`

export function rangeLabel(view, from, to) {
  const [fy, fm, fd] = parts(from)
  const [ty, tm, td] = parts(to)
  if (view === 'day') return dayLabel(from)
  if (view === 'month') return `${MONTHS[fm - 1]} ${fy}`
  const short = (m) => MONTHS[m - 1].slice(0, 3)
  return fy === ty ? `${short(fm)} ${fd} to ${short(tm)} ${td}, ${ty}` : `${short(fm)} ${fd}, ${fy} to ${short(tm)} ${td}, ${ty}`
}
