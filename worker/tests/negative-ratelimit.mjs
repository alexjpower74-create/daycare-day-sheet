// (i) The copy never counts wrong PINs → the 429 test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'ratelimit',
  why: 'index.js checkPin no longer calls recordWrongPin, so wrong PINs are never counted',
  patches: [{ file: 'src/index.js', from: '    await recordWrongPin(c)\n', to: '' }],
  args: ['--api-only', '--grep', '^PIN guard'],
  expectRed: ['PIN guard: 5 wrong PINs from one IP, then 429 even for the right PIN on both routes; another IP still works'],
}))
