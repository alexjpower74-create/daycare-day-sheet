// (M4) The copy's follow-ups list signatures owed only for children signed in now → the gone-home follow-ups test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'followups',
  why: 'reports.js followUps keeps only visits still open, so a signature owed for a child who went home disappears',
  patches: [{ file: 'src/reports.js', from: '  const waiting = pending\n', to: '  const waiting = pending.filter((v) => v.out_at === null)\n' }],
  args: ['--api-only', '--grep', '^follow-ups'],
  expectRed: ["follow-ups: a signature owed for a child who went home is listed, one 15 dates old is not, signing removes it; open visits from before today oldest first, not today's"],
}))
