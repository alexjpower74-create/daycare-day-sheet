// (m) A transparent overlay over #action-in in the copy → the tap() hit-test goes red (a covered button is not "fine").
import { doorNegative } from './negative-lib.mjs'

process.exit(doorNegative({
  name: 'overlay',
  why: 'door.css puts a transparent ::after layer over .action-wrap, so a finger lands on the layer, not on #action-in',
  patches: [{
    file: 'door/door.css',
    from: '.action-wrap { position: relative; }',
    to: '.action-wrap { position: relative; }\n.action-wrap::after { content: ""; position: absolute; inset: 0; background: transparent; }',
  }],
  grep: 'sign in by real taps and a drawn signature',
  expect: ['tap(Sign in) hit-test', 'something else is on top'],
}))
