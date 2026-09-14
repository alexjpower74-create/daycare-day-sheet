// (o, M4) The copy's Worker labels a visit left open from an earlier day "In since 8:05 AM" as if the child came today → the door
// card check for Ruby's open visit from last week goes red.
import { doorNegative } from './negative-lib.mjs'

process.exit(doorNegative({
  name: 'stale-label',
  why: 'worker db.js status labels every open visit "In since …", whatever date it was opened',
  patches: [{ file: 'worker/src/db.js', from: 'open.date === today ?', to: 'true ?' }],
  grep: 'a visit left open from last week',
  expect: ['the card tells the truth about an old open visit'],
}))
