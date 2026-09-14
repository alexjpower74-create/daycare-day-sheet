// (l) The copy's confirmation never shows the over banner → the tablet ratio-moment test goes red.
import { doorNegative } from './negative-lib.mjs'

process.exit(doorNegative({
  name: 'over-banner',
  why: 'door.js overBanner never draws #over-banner, whatever the meter says',
  patches: [{ file: 'door/door.js', from: "if (meter && meter.state === 'over') {", to: 'if (false) {' }],
  grep: 'the ratio moment on the tablet',
  expect: ['the over banner', '#over-banner'],
}))
