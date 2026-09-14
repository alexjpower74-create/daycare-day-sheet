// dd2's Playwright negative controls. Each one copies the Worker and app/public into app/.negative/<name>/ (git-ignored), breaks
// one thing in the copy, runs one spec test against the copy on E2E_PORT 7807 (E2E_WORKER_DIR points at the copy's worker/), and
// passes only when that test goes red for the intended reason (the output names the intended assertion). The shipped code has no
// switch; only the copy is changed. Output goes to app/tests/web/negative-control.log with the repo path replaced by <repo>.
// Exit 0 = red as intended; 1 = still green or red for another reason; 2 = the break's anchor text is gone from the source.
import { spawnSync } from 'node:child_process'
import { appendFileSync, cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const APP = path.resolve(HERE, '..', '..')
const ROOT = path.resolve(APP, '..')
const LOG = path.join(HERE, 'negative-control.log')
const SKIP = /[\\/](\.state-[^\\/]*|\.wrangler|node_modules|\.negative|first-setup\.sql)([\\/]|$)/

const tidy = (text) => text.split(ROOT).join('<repo>').replace(/\x1b\[[0-9;]*m/g, '')

export function runControl({ id, name, what, file, anchor, replacement, spec, grep, marker, project = 'chromium-390' }) {
  const copy = path.join(APP, '.negative', name)
  rmSync(copy, { recursive: true, force: true })
  mkdirSync(copy, { recursive: true })
  cpSync(path.join(ROOT, 'worker'), path.join(copy, 'worker'), { recursive: true, filter: (src) => !SKIP.test(src.slice(ROOT.length)) })
  cpSync(path.join(APP, 'public'), path.join(copy, 'app', 'public'), { recursive: true })

  const target = path.join(copy, 'app', 'public', file)
  const source = readFileSync(target, 'utf8')
  const header = `\n===== (${id}) ${name}: ${what}\n      ${new Date().toISOString()} · break in the copy's app/public/${file} · ${spec} --grep "${grep}" --project ${project}\n`
  if (anchor !== null && !source.includes(anchor)) {
    appendFileSync(LOG, `${header}ANCHOR MISSING: ${JSON.stringify(anchor)} is no longer in app/public/${file}; update the control.\n`)
    console.log(`(${id}) ${name}: anchor missing, see negative-control.log`)
    rmSync(copy, { recursive: true, force: true })
    return 2
  }
  writeFileSync(target, anchor === null ? source + replacement : source.replace(anchor, replacement))
  if (existsSync(target) && readFileSync(target, 'utf8') === source) throw new Error('the break did not change the copy')

  const run = spawnSync('npx', ['playwright', 'test', `tests/web/${spec}`, '--project', project, '--grep', grep, '--reporter', 'line', '--retries', '0'], {
    cwd: APP,
    encoding: 'utf8',
    env: { ...process.env, E2E_PORT: '7807', E2E_WORKER_DIR: path.join(copy, 'worker'), FORCE_COLOR: '0' },
    maxBuffer: 64 * 1024 * 1024,
  })
  const output = tidy(`${run.stdout || ''}${run.stderr || ''}`)
  const ran = /\b1 (passed|failed)\b/.test(output)
  const red = run.status !== 0 && /\b1 failed\b/.test(output)
  const forTheReason = output.includes(marker)
  const verdict = !ran ? 'DID NOT RUN (no test matched or the server failed): counts as not proven'
    : red && forTheReason ? 'RED as intended'
      : red ? `RED but not for the intended reason (expected the output to name: ${marker})`
        : 'STILL GREEN: the check measured nothing'
  appendFileSync(LOG, `${header}${output.trimEnd()}\n----- verdict: ${verdict}\n`)
  console.log(`(${id}) ${name}: ${verdict}`)
  rmSync(copy, { recursive: true, force: true })
  return red && forTheReason ? 0 : 1
}
