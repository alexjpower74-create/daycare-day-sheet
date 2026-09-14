// (k) The copy's pick-up list shows every person (ignores may_pick_up) → "the pick-up list does not contain Rick D." goes red.
import { doorNegative } from './negative-lib.mjs'

process.exit(doorNegative({
  name: 'pickup-list',
  why: 'door.js peopleStep offers every person at pick-up, may_pick_up or not',
  patches: [{ file: 'door/door.js', from: "const people = kind === 'out' ? d.people.filter((p) => p.may_pick_up) : d.people", to: 'const people = d.people' }],
  grep: 'not on the list: the neighbour may drop off',
  expect: ['the pick-up list does not contain Rick D.'],
}))
