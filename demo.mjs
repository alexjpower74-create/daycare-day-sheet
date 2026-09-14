// npm run demo: Daycare Day Sheet on this computer with the SAMPLE centre and a SAMPLE three weeks of attendance.
// Local only. TEST_MODE is on so the seed route exists; never deploy with it (docs/DEPLOY.md).
// Usage: npm run demo            keeps everything from last time (seeds only the first time)
//        npm run demo -- --fresh starts again from the SAMPLE seed
// PORT (default 7801) picks the port; the wrangler inspector uses PORT + 10.

import { spawn, spawnSync } from 'node:child_process'
import { existsSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const worker = join(dirname(fileURLToPath(import.meta.url)), 'worker')
const PORT = Number(process.env.PORT || 7801)
const BASE = `http://127.0.0.1:${PORT}`
const state = join(worker, '.state-demo')
const fresh = process.argv.includes('--fresh') || !existsSync(state)
const env = { ...process.env, WRANGLER_SEND_METRICS: 'false' }

if (fresh) {
  rmSync(state, { recursive: true, force: true })
  const m = spawnSync('wrangler', ['d1', 'migrations', 'apply', 'daycare-day-sheet', '--local', '--persist-to', state], { cwd: worker, env, stdio: 'inherit' })
  if (m.status !== 0) process.exit(m.status ?? 1)
}

const child = spawn('wrangler', ['dev', '--local', '--port', String(PORT), '--inspector-port', String(PORT + 10), '--persist-to', state,
  '--var', 'TEST_MODE:1', '--show-interactive-dev-session=false'], { cwd: worker, env, stdio: ['ignore', 'ignore', 'inherit'], detached: true })
const stop = () => { try { process.kill(-child.pid, 'SIGTERM') } catch {} process.exit(0) }
process.on('SIGINT', stop)
process.on('SIGTERM', stop)
child.on('exit', (code) => { console.error(`wrangler dev stopped (${code}).`); process.exit(code ?? 1) })

for (let i = 0; ; i++) {
  try { if ((await fetch(`${BASE}/api/info`)).ok) break } catch {}
  if (i > 120) { console.error(`The Worker did not answer on ${BASE}.`); stop() }
  await new Promise((r) => setTimeout(r, 500))
}

let example = ''
if (fresh) {
  const r = await fetch(`${BASE}/api/test/seed`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scenario: 'demo' }) })
  const body = await r.json().catch(() => ({}))
  console.log(r.ok ? `Seeded the SAMPLE centre around ${body.today ?? 'today'}.` : `Seeding failed: ${JSON.stringify(body)}`)
  if (body.note_url) example = `\n  A parent's daily note        ${BASE}${body.note_url}   (works until midnight)`
}

console.log(`
Daycare Day Sheet is running (SAMPLE centre and people, local only, nothing is sent).
  Start page                   ${BASE}/
  Door tablet                  ${BASE}/door/     set up with the supervisor PIN 4826
  Room view (staff phone)      ${BASE}/room/     PIN 1593 (Marie), 2604 (Kevin), 3715 (Priya) or 4826 (Dana)
  Office                       ${BASE}/office/   PIN 4826 (supervisor)${example}
Press Ctrl+C to stop.`)
