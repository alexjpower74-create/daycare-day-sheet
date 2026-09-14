// (d) The copy cuts the parent link at UTC midnight instead of local midnight → the 11:59 PM test must go red
// (UTC midnight after Sep 14 is 9:30 PM NDT, so a link made at 9:00 PM NDT dies half an hour later.)
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'expiry',
  why: 'staff.js makeLink sets expires_at to UTC midnight after today (Date.parse(today) + 1 day) instead of endOfDate(today)',
  patches: [{ file: 'src/staff.js', from: 'const expires = endOfDate(c.today)', to: 'const expires = new Date(Date.parse(c.today) + 86400000)' }],
  args: ['--api-only', '--grep', '^parent link: made at 9:00 PM'],
  expectRed: ['parent link: made at 9:00 PM NDT, still works at 11:59:59 PM NDT and shows a log added after it was made'],
}))
