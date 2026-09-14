// (a) The copy's room card renders data-state="ok" whatever the meter says → room.spec's card-state check goes red.
import { runControl } from './negative-lib.mjs'
process.exit(runControl({
  id: 'a', name: 'card-state', what: 'room card always data-state="ok"',
  file: 'room/room.js',
  anchor: "'data-state': meter.state, 'aria-pressed'",
  replacement: "'data-state': 'ok', 'aria-pressed'",
  spec: 'room.spec.mjs', grep: 'the room card follows the meter',
  marker: 'room card data-state',
}))
