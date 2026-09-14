// (Next round item 4) The copy answers sample: true with no centre row → the empty-D1 info test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'info-sample',
  why: 'index.js info answers sample: true when the centre row does not exist yet',
  patches: [{ file: 'src/index.js', from: "sample: centre ? centre.sample === 1 : false,", to: "sample: centre ? centre.sample === 1 : true," }],
  args: ['--api-only', '--grep', '^info before the centre row exists'],
  expectRed: ['info before the centre row exists: centre_name "", phone "", sample false; a reset then makes it the SAMPLE centre'],
}))
