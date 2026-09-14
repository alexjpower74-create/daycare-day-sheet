// (a) The copy's present-children count leaves out the most recently signed-in child → the ratio-moment test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'count',
  why: 'loadMeters counts present children from kids.results.slice(0, -1): the child signed in last is not counted',
  patches: [{ file: 'src/db.js', from: 'const present = kids.results\n', to: 'const present = kids.results.slice(0, -1)\n' }],
  args: ['--api-only', '--grep', '^ratio moment'],
  expectRed: ['ratio moment: at the limit with the third infant, over with the fourth in that very answer; staff/today agrees; a second educator and leaving change it'],
}))
