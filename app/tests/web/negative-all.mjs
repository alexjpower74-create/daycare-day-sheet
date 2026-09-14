// Runs dd2's negative controls (a)–(h) one after another. Exit 0 only if every one went red for its intended reason.
//   cd app && node tests/web/negative-all.mjs
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
const HERE = path.dirname(fileURLToPath(import.meta.url))
let bad = 0
for (const f of ['negative-card-state.mjs', 'negative-over-colour.mjs', 'negative-expiry-page.mjs', 'negative-overlay.mjs', 'negative-attendance-day.mjs', 'negative-ratio-reload.mjs', 'negative-still-here.mjs', 'negative-overnight-fix.mjs']) {
  const r = spawnSync('node', [path.join(HERE, f)], { stdio: 'inherit' })
  if (r.status !== 0) bad++
}
console.log(bad ? `${bad} control(s) not proven` : 'all 8 controls red as intended')
process.exit(bad ? 1 : 0)
