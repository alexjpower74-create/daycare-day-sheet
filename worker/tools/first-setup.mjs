// First setup for a real centre. No network, no SAMPLE rows.
//   node tools/first-setup.mjs --centre "<name>" --phone "<709 number>" --supervisor "<name>" --pin <4–6 digits> [--out <file>]
// Writes SQL (default worker/first-setup.sql, git-ignored): the centre row with sample = 0, the six cited ratio rules, and one
// supervisor whose PIN is hashed exactly as src/auth.js does (PBKDF2-SHA-256, 100 000 iterations, a random salt).
// docs/DEPLOY.md applies it once with `wrangler d1 execute daycare-day-sheet --remote --file first-setup.sql`, then deletes it.
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { hashPin, PIN_RE, randomId, randomSaltHex } from '../src/auth.js'
import { DEFAULT_RULES } from '../src/ratio.js'
import { initialsOf } from '../src/sample.js'

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const sql = (s) => `'${String(s).replace(/'/g, "''")}'`

function oneLine(v, max, what) {
  if (typeof v !== 'string' || /[\u0000-\u001f\u007f]/.test(v) || !v.trim() || v.trim().length > max) {
    throw new Error(`${what}: give 1 to ${max} characters on one line.`)
  }
  return v.trim()
}

export function checkSetup({ centre, phone, supervisor, pin }) {
  const digits = typeof phone === 'string' && /^[\d\s().+-]+$/.test(phone) ? phone.replace(/\D/g, '') : ''
  if (digits.length !== 10) throw new Error('--phone: give a 10-digit phone number.')
  if (typeof pin !== 'string' || !PIN_RE.test(pin)) throw new Error('--pin: give 4 to 6 digits.')
  return {
    centre: oneLine(centre, 80, '--centre'), supervisor: oneLine(supervisor, 60, '--supervisor'), pin,
    phone: `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`,
  }
}

export async function firstSetupSql(input) {
  const v = checkSetup(input)
  const salt = randomSaltHex()
  const hash = await hashPin(v.pin, salt)
  return [
    '-- Daycare Day Sheet: first setup for a real centre. It holds a PIN hash: delete this file once it is applied.',
    `INSERT INTO centre (id, name, sample, phone) VALUES (1, ${sql(v.centre)}, 0, ${sql(v.phone)});`,
    ...DEFAULT_RULES.map((r, i) => `INSERT INTO ratio_rules (age_group, label, children_per_caregiver, max_children, ` +
      `default_children_per_caregiver, default_max_children, citation, sort) VALUES (${sql(r.age_group)}, ${sql(r.label)}, ${r.per}, ` +
      `${r.max}, ${r.per}, ${r.max}, ${sql(r.citation)}, ${i + 1});`),
    `INSERT INTO staff (id, name, initials, role, active, pin_hash, pin_salt) VALUES (${sql(randomId('s'))}, ${sql(v.supervisor)}, ` +
      `${sql(initialsOf(v.supervisor))}, 'supervisor', 1, ${sql(hash)}, ${sql(salt)});`,
    '',
  ].join('\n')
}

function parseArgs(argv) {
  const out = {}
  for (let i = 0; i < argv.length; i += 2) {
    const k = argv[i]
    if (!['--centre', '--phone', '--supervisor', '--pin', '--out'].includes(k) || argv[i + 1] === undefined) {
      throw new Error(`Unknown or empty option ${k}. Usage: node tools/first-setup.mjs --centre "<name>" --phone "<709 number>" --supervisor "<name>" --pin <4–6 digits> [--out <file>]`)
    }
    out[k.slice(2)] = argv[i + 1]
  }
  return out
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const args = parseArgs(process.argv.slice(2))
    const out = path.resolve(args.out || path.join(WORKER, 'first-setup.sql'))
    writeFileSync(out, await firstSetupSql(args), { mode: 0o600 })
    console.log(`Wrote ${path.relative(process.cwd(), out)}. Apply it once, then delete it: it holds the supervisor's PIN hash.`)
  } catch (e) {
    console.error(e.message)
    process.exit(2)
  }
}
