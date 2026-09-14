// (e) The copy's attendance page keeps a visit's minutes on its sign-in date only: a day holding only the part after midnight
// shows nothing → attendance.spec's Sep 15 cell check goes red.
import { runControl } from './negative-lib.mjs'
process.exit(runControl({
  id: 'e', name: 'attendance-day', what: 'the part of a visit after midnight is dropped from the next date',
  file: 'office/attendance.js',
  anchor: "  if (day.status === 'present') {",
  replacement: "  if (day.status === 'present' && (day.parts || []).length && day.parts.every((p) => p.continued)) return null // broken copy\n  if (day.status === 'present') {",
  spec: 'attendance.spec.mjs', grep: 'splits a visit across midnight',
  marker: 'Ava Sep 15 cell',
}))
