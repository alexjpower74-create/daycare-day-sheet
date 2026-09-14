// (c) The copy's sign-out ignores may_pick_up → the neighbour test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'pickup',
  why: 'visits.js signOut drops "&& person.may_pick_up === 1": anyone active on the list may pick up',
  patches: [{ file: 'src/visits.js', from: ' && person.may_pick_up === 1', to: '' }],
  args: ['--api-only', '--grep', '^authorized pick-up'],
  expectRed: ["authorized pick-up: the neighbour, another child's parent and an unknown id are refused and Ava stays in; the grandmother signs her out"],
}))
