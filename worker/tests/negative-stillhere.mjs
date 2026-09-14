// (Next round) The copy flags a visit open today as not signed out → the still-here test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'stillhere',
  why: 'attendance.js isStillHere is always false, so a child still here today is flagged Not signed out and counted',
  patches: [{ file: 'src/attendance.js', from: 'const isStillHere = (p) => p.open && p.date === today', to: 'const isStillHere = (p) => false' }],
  args: ['--api-only', '--grep', '^attendance: a visit open today'],
  expectRed: ['attendance: a visit open today is still here, with no Not signed out flag; the next day the same visit is not signed out'],
}))
