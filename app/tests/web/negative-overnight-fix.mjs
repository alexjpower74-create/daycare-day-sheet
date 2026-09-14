// (h) The copy's Fix a time pre-fills the sign-in date with the cell's date (the old behaviour) → from the Sep 15 cell of an
// overnight visit the Worker refuses, and attendance.spec's 200 check goes red.
import { runControl } from './negative-lib.mjs'
process.exit(runControl({
  id: 'h', name: 'overnight-fix', what: 'Fix a time sends the cell date as the sign-in date',
  file: 'office/attendance.js',
  anchor: "control('input', 'fix-in_date', 'in_date', { type: 'date' }, endDate(first?.in_label, date))",
  replacement: "control('input', 'fix-in_date', 'in_date', { type: 'date' }, date)",
  spec: 'attendance.spec.mjs', grep: 'second day of an overnight visit',
  // The copy's pre-fill is the defect, so the spec's first check on the dialog catches it (before the 200 check is reached).
  marker: 'the visit\'s own sign-in date',
}))
