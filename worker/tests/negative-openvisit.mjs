// (j) The copy counts an open visit up to now → the open-visit minutes test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'openvisit',
  why: 'attendance.js splitVisit treats a visit never signed out as ending now (the real clock) instead of 0 minutes',
  patches: [{ file: 'src/attendance.js', from: 'const outAt = v.out_at\n', to: 'const outAt = v.out_at ?? new Date().toISOString()\n' }],
  args: ['--api-only', '--grep', '^attendance: open visits'],
  expectRed: ['attendance: open visits are present with 0 minutes and Not signed out, in the JSON, the CSV and the summary'],
}))
