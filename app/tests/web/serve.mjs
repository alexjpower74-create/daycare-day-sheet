// Static server for app/public on 127.0.0.1, for M1 page work against the ?mock=1 stand-in before dd1's Worker is merged.
// Not used by any Playwright spec (those run against the real Worker). /api/* answers 404 JSON so pages show a plain error.
//   node tests/web/serve.mjs            (port 7801, dd2's dev port)
import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../public')
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' }

export function serve(port = 7801) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname.startsWith('/api/')) {
      res.writeHead(404, { 'Content-Type': 'application/json' })
      return res.end(JSON.stringify({ error: 'No Worker on this server. Open the page with ?mock=1.', code: 'not_found' }))
    }
    let file = path.join(ROOT, decodeURIComponent(url.pathname))
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end() }
    try {
      if ((await stat(file)).isDirectory()) file = path.join(file, 'index.html')
      const body = await readFile(file)
      res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' })
      res.end(body)
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' })
      res.end('Not found')
    }
  })
  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)))
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 7801)
  await serve(port)
  console.log(`app/public on http://127.0.0.1:${port}/  (add ?mock=1)`)
}
