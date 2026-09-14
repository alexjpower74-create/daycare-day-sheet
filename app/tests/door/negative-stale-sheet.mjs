// (r, dd2's door review finding 1) The copy keeps the stale sheet after a 409 → the pad offers the same refused write, and the
// "sheet now offers Sign out" check goes red.
import { doorNegative } from './negative-lib.mjs'

process.exit(doorNegative({
  name: 'stale-sheet',
  why: 'door.js submit no longer restarts the sheet on already_in / not_in / bad_state; it only shows the text and re-enables Done',
  patches: [{ file: 'door/door.js', from: "    if (e.status === 409 && ['already_in', 'not_in', 'bad_state'].includes(e.code)) return restartSheet(d.child.id, e.message)\n", to: '' }],
  grep: 'a change on another device while the sheet is open',
  expect: ['#sheet-notice'],
}))
