// (p, M4) The copy passes an empty section to replaceChildren again → the grid prints "null" under a filtered room, and the
// grid test's "no stray text" check goes red. Found in the M4 screenshot of the Preschool room filter.
import { doorNegative } from './negative-lib.mjs'

process.exit(doorNegative({
  name: 'null-text',
  why: 'door.js drawGrid hands replaceChildren the null for a missing Not booked today section',
  patches: [{ file: 'door/door.js', from: '  ].filter(Boolean))\n}', to: '  ])\n}' }],
  grep: 'grid: every SAMPLE child',
  expect: ['no stray text in the filtered grid'],
}))
