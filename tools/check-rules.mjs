// npm run rules: every quote in docs/RULES.md must be an exact substring of the raw source saved in data/sources/.
// Both sides get the same treatment: HTML (windows-1252) is stripped of tags, entities decoded; PDFs go through pdftotext;
// then all runs of whitespace become one space. Nothing else is normalised, so a changed word, letter or punctuation mark fails.
// A self-test runs first: a quote with one letter changed must NOT be found, or the checker measured nothing (exit 2).
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const RULES = path.join(ROOT, 'docs', 'RULES.md')

const ENTITIES = { nbsp: ' ', amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', rsquo: '’', lsquo: '‘', rdquo: '”', ldquo: '“', ndash: '–', mdash: '—', sect: '§' }
const squash = (s) => s.replace(/\s+/g, ' ').trim()

const cache = new Map()
function sourceText(rel) {
  if (cache.has(rel)) return cache.get(rel)
  const file = path.join(ROOT, rel)
  if (!existsSync(file)) throw new Error(`source file missing: ${rel}`)
  let text
  if (rel.endsWith('.pdf')) {
    text = execFileSync('pdftotext', ['-enc', 'UTF-8', file, '-'], { maxBuffer: 64 * 1024 * 1024 }).toString('utf8')
  } else {
    const raw = new TextDecoder('windows-1252').decode(readFileSync(file))
    text = raw
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
      .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
      .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
  }
  const out = squash(text)
  cache.set(rel, out)
  return out
}

function parseRules(md) {
  const blocks = md.split(/^### /m).slice(1)
  return blocks.map((b) => {
    const title = b.split('\n')[0].trim()
    const source = (b.match(/`(data\/sources\/[^`]+)`/) || [])[1]
    const url = (b.match(/<(https:\/\/[^>]+)>/) || [])[1]
    const fetched = (b.match(/fetched (\d{4}-\d{2}-\d{2})/) || [])[1]
    const quotes = []
    let cur = null
    for (const line of b.split('\n')) {
      if (line.startsWith('>')) { cur = (cur ?? '') + ' ' + line.replace(/^>\s?/, ''); continue }
      if (cur !== null) { quotes.push(squash(cur)); cur = null }
    }
    if (cur !== null) quotes.push(squash(cur))
    return { title, source, url, fetched, quotes: quotes.filter(Boolean) }
  })
}

const rules = parseRules(readFileSync(RULES, 'utf8'))
let failures = 0

// Self-test: the first quote must be found, and the same quote with one letter changed must not be.
const probe = rules.find((r) => r.source && r.quotes.length)
if (!probe) { console.error('self-test: no rule with a source and a quote'); process.exit(2) }
const good = probe.quotes[0]
const i = good.search(/[a-z]/)
const bad = good.slice(0, i) + (good[i] === 'e' ? 'a' : 'e') + good.slice(i + 1)
const selfOk = sourceText(probe.source).includes(good) && !sourceText(probe.source).includes(bad)
console.log(`self-test: exact quote found, one-letter change ${sourceText(probe.source).includes(bad) ? 'ALSO FOUND' : 'not found'} -> ${selfOk ? 'ok' : 'BROKEN'}`)
if (!selfOk) process.exit(2)

for (const r of rules) {
  const problems = []
  if (!r.source) problems.push('no `data/sources/...` path')
  if (!r.url) problems.push('no <https://...> source URL')
  if (!r.fetched) problems.push('no "fetched YYYY-MM-DD"')
  if (!r.quotes.length) problems.push('no > quote')
  if (r.source) {
    for (const q of r.quotes) {
      if (!sourceText(r.source).includes(q)) problems.push(`quote not in source: "${q.slice(0, 90)}${q.length > 90 ? '…' : ''}"`)
    }
  }
  if (problems.length) { failures++; console.log(`FAIL ${r.title}\n  - ${problems.join('\n  - ')}`) }
  else console.log(`ok   ${r.title} (${r.quotes.length} quote${r.quotes.length === 1 ? '' : 's'})`)
}

console.log(`\n${rules.length - failures} of ${rules.length} rules verified against data/sources/`)
process.exit(failures ? 1 : 0)
