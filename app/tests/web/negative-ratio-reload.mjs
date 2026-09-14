// (f) The copy's ratio form shows the cited default instead of the saved value → office.spec's check after reload goes red.
import { runControl } from './negative-lib.mjs'
process.exit(runControl({
  id: 'f', name: 'ratio-reload', what: 'ratio form shows the cited default, not the saved number',
  file: 'office/office.js',
  anchor: "number('per', 'children_per_caregiver', rule.children_per_caregiver, 50,",
  replacement: "number('per', 'children_per_caregiver', rule.default_children_per_caregiver, 50,",
  spec: 'office.spec.mjs', grep: 'an edit to 1:4',
  marker: 'ratio form after reload',
}))
