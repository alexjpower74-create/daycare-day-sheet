// (b) The copy's CSS maps over to the ok colour while data-state still says over → the stateColour check goes red
// (proves the colour check reads the colour a person sees, not the attribute).
import { runControl } from './negative-lib.mjs'
process.exit(runControl({
  id: 'b', name: 'over-colour', what: '[data-state="over"] painted with the ok colour',
  file: 'style.css',
  anchor: null,
  replacement: '\n[data-state="over"] { --state: var(--ok); --on-state: var(--on-ok); }\n',
  spec: 'room.spec.mjs', grep: 'the room card follows the meter',
  marker: 'stateColour of the over card',
}))
