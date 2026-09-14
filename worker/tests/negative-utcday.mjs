// (f) The copy cuts visits at UTC midnight instead of local midnight → the across-midnight test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'utcday',
  why: 'attendance.js splitVisit cuts at the next UTC midnight instead of endOfDate(local date)',
  patches: [{ file: 'src/attendance.js', from: 'const cut = endOfDate(date).getTime()', to: 'const cut = (Math.floor(start / 86400000) + 1) * 86400000' }],
  args: ['--api-only', '--grep', '^attendance across midnight'],
  expectRed: ['attendance across midnight: Ava 10:30 PM Sep 14 to 1:15 AM Sep 15 is 90 minutes on Sep 14 and 75 on Sep 15, in the JSON and the CSV'],
}))
