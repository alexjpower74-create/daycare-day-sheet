// (b) The copy's meter treats children = allowed as over (>=) → the at_limit check in the ratio-moment test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'limit',
  why: 'ratio.js row 5 compares children >= staff × per instead of >, so a room exactly at the limit reads over',
  patches: [{ file: 'src/ratio.js', from: 'if (children > staff * per) {', to: 'if (children >= staff * per) {' }],
  args: ['--api-only', '--grep', '^ratio moment'],
  expectRed: ['ratio moment: at the limit with the third infant, over with the fourth in that very answer; staff/today agrees; a second educator and leaving change it'],
}))
