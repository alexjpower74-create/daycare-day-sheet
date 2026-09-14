// (n, added by dd1) The copy's Done and Clear act only on click again → in Chromium the tap on Done right after a fast stroke is
// lost (measured: no click 250 and 500 ms after the stroke, a click at 900 ms), and the sign-in test goes red waiting for the answer.
import { doorNegative } from './negative-lib.mjs'

process.exit(doorNegative({
  name: 'tap-after-stroke',
  why: 'door.js onPress no longer acts on the touch pointerup, so Done and Clear wait for a click Chromium drops after a fast stroke',
  patches: [{ file: 'door/door.js', from: '    pressedAt = e.timeStamp\n    action()\n', to: '    return\n' }],
  grep: 'sign in by real taps and a drawn signature',
  expect: ['page.waitForResponse', 'Test timeout'],
}))
