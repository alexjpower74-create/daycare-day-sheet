// Door tablet negative controls (dd1). Copies worker/ and app/public/ into app/.negative/door-<name>/ (git-ignored), breaks the COPY
// by exact text replacement (exit 2 if an anchor is not there exactly once), runs one door test on chromium-tablet against a Worker
// started from the copy (E2E_WORKER_DIR, port NEG_PORT, default 7806), and exits 0 only if that test went red for the named reason.
// Every run appends to app/tests/door/negative-control.log. The shipped page has no switch that turns a check off.
import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP = path.resolve(HERE, '..', '..')
const ROOT = path.resolve(APP, '..')
const LOG = path.join(HERE, 'negative-control.log')

// patches: [{ file (under app/public), from, to }]; grep: the test title to run; expect: strings that must all be in the output.
export function doorNegative({ name, why, patches, grep, expect }) {
  const port = process.env.NEG_PORT || '7806'
  const base = path.join(APP, '.negative', `door-${name}`)
  const header = `\n=== door negative:${name} — ${new Date().toISOString()}\nbreak: ${why}\n`
  rmSync(base, { recursive: true, force: true })
  mkdirSync(path.join(base, 'worker'), { recursive: true })
  for (const entry of readdirSync(path.join(ROOT, 'worker'))) {
    if (/^\.state-|^\.negative$|^\.wrangler$|^node_modules$/.test(entry)) continue
    cpSync(path.join(ROOT, 'worker', entry), path.join(base, 'worker', entry), { recursive: true })
  }
  cpSync(path.join(APP, 'public'), path.join(base, 'app', 'public'), { recursive: true })
  for (const p of patches) {
    const file = path.join(base, 'app', 'public', p.file)
    const text = readFileSync(file, 'utf8')
    const count = text.split(p.from).length - 1
    if (count !== 1) {
      appendFileSync(LOG, `${header}RESULT: BREAK DID NOT APPLY — "${p.from.slice(0, 80)}" found ${count} times in ${p.file}\n`)
      rmSync(base, { recursive: true, force: true })
      console.error(`door negative:${name}: anchor found ${count} times in ${p.file}`)
      return 2
    }
    writeFileSync(file, text.replace(p.from, () => p.to))
  }
  const r = spawnSync('npx', ['playwright', 'test', 'tests/door/door.spec.mjs', '--project', 'chromium-tablet', '--grep', grep, '--reporter=list',
    '--output', path.join(base, 'results')], {
    cwd: APP, encoding: 'utf8', env: { ...process.env, E2E_PORT: port, E2E_WORKER_DIR: path.join(base, 'worker'), FORCE_COLOR: '0' },
  })
  const out = `${r.stdout}\n${r.stderr}`.split(ROOT + path.sep).join('')
  const missing = expect.filter((s) => !out.includes(s))
  const red = r.status !== 0 && missing.length === 0 && /\b1 failed\b/.test(out)
  const lines = out.split('\n').filter((l) => /✘|✓|passed|failed|Error:|Expected|Received|something else is on top|Locator:|expected to|unexpected value/.test(l))
    .slice(0, 30).join('\n')
  const result = red ? 'RESULT: RED as intended' : `RESULT: NOT RED — the check measured nothing (exit ${r.status}; missing: ${missing.join(' | ') || 'none'})`
  appendFileSync(LOG, `${header}patched: ${patches.map((p) => `app/public/${p.file}`).join(', ')}\nrun: npx playwright test tests/door/door.spec.mjs --project chromium-tablet --grep "${grep}" (E2E_PORT ${port})\n${lines}\n${result}\n`)
  rmSync(base, { recursive: true, force: true })
  console.log(`${lines}\n${result}`)
  return red ? 0 : 1
}
