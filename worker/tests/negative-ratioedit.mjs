// (h) The copy's meter reads the cited defaults instead of the saved rule → the ratio edit test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'ratioedit',
  why: 'db.js loadMeters passes default_children_per_caregiver / default_max_children to the meter instead of the saved numbers',
  patches: [{
    file: 'src/db.js',
    from: 'children_per_caregiver: rule ? rule.children_per_caregiver : null, max_children: rule ? rule.max_children : null,',
    to: 'children_per_caregiver: rule ? rule.default_children_per_caregiver : null, max_children: rule ? rule.default_max_children : null,',
  }],
  args: ['--api-only', '--grep', '^ratios:'],
  expectRed: ['ratios: list with the note, change, back to the cited number, edited; the next meter uses the saved numbers'],
}))
