// (e) The copy never checks expires_at → the next-day test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'expiry-never',
  why: 'staff.js parentNote skips the expires_at comparison (if (false)), so a link works forever',
  patches: [{ file: 'src/staff.js', from: 'if (c.now.getTime() >= Date.parse(link.expires_at)) {', to: 'if (false) {' }],
  args: ['--api-only', '--grep', '^parent link: dead'],
  expectRed: ['parent link: dead at 12:00:00 AM NDT the next day (410 with the exact message), unknown token 404'],
}))
