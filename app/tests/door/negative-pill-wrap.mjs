// (q, next round) The copy puts the status pill back in the narrow column beside the avatar → "In since 12:45 PM" wraps at 1024×768
// and the one-line pill check goes red.
import { doorNegative } from './negative-lib.mjs'

process.exit(doorNegative({
  name: 'pill-wrap',
  why: 'door.css places .status-pill in grid column 2 (beside the avatar, about 120 px) instead of across the card',
  patches: [{ file: 'door/door.css', from: '.child > .status-pill, .child > .chip-sign { grid-column: 1 / -1; justify-self: start; }',
    to: '.child > .status-pill, .child > .chip-sign { grid-column: 2; justify-self: start; }' }],
  grep: 'status pills: short labels stay on one line',
  expect: ['In since 12:45 PM stays on one line'],
}))
