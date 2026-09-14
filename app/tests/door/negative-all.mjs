// Every door tablet negative control, one after another. Exit 0 only if every one went red.
//   node tests/door/negative-all.mjs   (from app/; NEG_PORT picks the port, default 7806)
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const NAMES = ['pickup-list', 'over-banner', 'overlay', 'tap-after-stroke', 'stale-label', 'null-text']
const results = NAMES.map((n) => [n, spawnSync(process.execPath, [path.join(HERE, `negative-${n}.mjs`)], { stdio: 'inherit' }).status])
console.log('\n== door negative controls')
for (const [n, code] of results) console.log(`${code === 0 ? 'RED (good)  ' : 'NOT RED (bad)'} door negative:${n} exit ${code}`)
process.exit(results.every(([, code]) => code === 0) ? 0 : 1)
