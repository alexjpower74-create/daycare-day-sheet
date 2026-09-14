// Negative control for the journey spec (lead-owned): a copy whose room view sends "some" when an educator taps "Ate all"
// must turn the journey red. Copies worker/ and app/public/ into app/.negative/journey/ (git-ignored), breaks the COPY by exact
// text replacement (exit 2 if the anchor isn't there exactly once), runs the journey on chromium-tablet against a Worker started
// from the copy (E2E_PORT 7808, E2E_WORKER_DIR), and exits 0 only if it went red on the "ate all" check.
// Appends to app/tests/journey/negative-control.log.
import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP = path.resolve(HERE, '..', '..')
const ROOT = path.resolve(APP, '..')
const base = path.join(APP, '.negative', 'journey')
const PORT = process.env.NEG_PORT || '7808'

rmSync(base, { recursive: true, force: true })
mkdirSync(path.join(base, 'worker'), { recursive: true })
for (const entry of readdirSync(path.join(ROOT, 'worker'))) {
  if (/^\.state-|^\.negative$|^\.wrangler$|^\.logs$|^node_modules$/.test(entry)) continue
  cpSync(path.join(ROOT, 'worker', entry), path.join(base, 'worker', entry), { recursive: true })
}
cpSync(path.join(APP, 'public'), path.join(base, 'app', 'public'), { recursive: true })

const file = path.join(base, 'app', 'public', 'room', 'room.js')
const find = 'doLog(s, { kind, ...(value ? { value } : {}),'
const text = readFileSync(file, 'utf8')
const count = text.split(find).length - 1
if (count !== 1) {
  console.error(`negative-journey: anchor found ${count} times in room/room.js, expected exactly once (update the anchor)`)
  process.exit(2)
}
writeFileSync(file, text.replace(find, () => "doLog(s, { kind, ...(value ? { value: value === 'all' ? 'some' : value } : {}),"))

const r = spawnSync('npx', ['playwright', 'test', 'tests/journey/journey.spec.mjs', '--project', 'chromium-tablet', '--reporter=list',
  '--output', path.join(APP, '.negative', 'journey-results')], {
  cwd: APP, encoding: 'utf8', env: { ...process.env, E2E_PORT: PORT, E2E_WORKER_DIR: path.join(base, 'worker') },
})
const out = `${r.stdout}\n${r.stderr}`
const red = r.status !== 0 && /[Aa]te all/.test(out) && /[Aa]te some/.test(out)
const lines = out.split('\n').filter((l) => /✘|✓|Expected|Received|passed|failed/.test(l)).join('\n')
appendFileSync(path.join(HERE, 'negative-control.log'),
  `\n== ${new Date().toISOString()} journey: the copy's room view sends "some" for "Ate all"\n${lines}\nRESULT: ${red ? 'RED (good: the journey caught the break)' : 'NOT RED (bad)'}\n`)
rmSync(base, { recursive: true, force: true })
console.log(lines)
console.log(red ? 'RED (good): the journey caught the break' : 'NOT RED (bad)')
process.exit(red ? 0 : 1)
