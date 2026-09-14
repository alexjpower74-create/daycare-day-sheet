// (dd2 office cross-review, F4) The copy refuses a child's own home room once it closes → the office form's save (which always
// sends home_room_id) fails, and the closed-home-room test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'homeroom',
  why: 'office.js parseChild no longer keeps an unchanged home room: a closed room is refused even for the child already in it',
  patches: [{ file: 'src/office.js', from: 'const keep = current !== null && b.home_room_id === current.home_room_id', to: 'const keep = false' }],
  args: ['--api-only', '--grep', '^children: an edit that sends back the home room'],
  expectRed: ['children: an edit that sends back the home room of a closed room is saved; moving a child into a closed room is still refused'],
}))
