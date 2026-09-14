// CSV for the office exports. Pure. CRLF line ends, RFC 4180 quoting, and a formula guard so a spreadsheet never runs a cell.
export const ATTENDANCE_HEADER = ['Date', 'Child', 'Room', 'In', 'Dropped off by', 'Out', 'Picked up by', 'Minutes', 'Hours', 'Away', 'Note']
export const SUMMARY_HEADER = ['Child', 'Room', 'Days present', 'Minutes', 'Hours', 'Days away', 'Sick', 'Holiday', 'Appointment',
  'Family reasons', 'Other', 'Not signed out']

const FORMULA_START = /^[=+\-@\t\r]/

export function cell(value) {
  let s = value === null || value === undefined ? '' : String(value)
  if (FORMULA_START.test(s)) s = `'${s}`
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export const csvText = (rows) => rows.map((r) => `${r.map(cell).join(',')}\r\n`).join('')

// Minutes as hours with 2 decimals: 350 → "5.83".
export const hours = (minutes) => (Math.round((minutes * 100) / 60) / 100).toFixed(2)
