// (g) The copy has no formula guard → the CSV test must go red.
import { negative } from './negative-lib.mjs'

process.exit(await negative({
  name: 'csvguard',
  why: "csv.js cell() no longer prefixes ' to a cell starting with = + - @ tab or CR",
  patches: [{ file: 'src/csv.js', from: "if (FORMULA_START.test(s)) s = `'${s}`", to: '' }],
  args: ['--api-only', '--grep', '^CSV:'],
  expectRed: ['CSV: CRLF lines, quoting of Smith, "Junior", the formula guard on =SUM(A1), and the filenames'],
}))
