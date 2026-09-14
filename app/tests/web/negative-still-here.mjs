// (g) The copy's attendance page ignores still_here and flags today's open visit as Not signed out with Fix a time
// → attendance.spec's Still here check goes red.
import { runControl } from './negative-lib.mjs'
process.exit(runControl({
  id: 'g', name: 'still-here', what: 'today\'s open visit flagged Not signed out',
  file: 'office/attendance.js',
  anchor: '    if (day.still_here) {',
  replacement: '    if (false) { // broken copy: still_here ignored',
  spec: 'attendance.spec.mjs', grep: 'reads Still here with no flag',
  marker: 'today\'s open visit reads Still here',
}))
