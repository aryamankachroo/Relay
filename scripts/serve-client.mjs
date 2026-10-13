import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
}

export function createSpaServer(rootDir) {
  const root = path.resolve(rootDir)
  return http.createServer((request, response) => {
    const url = new URL(request.url || '/', 'http://127.0.0.1')
    const pathname = decodeURIComponent(url.pathname)
    if (pathname.includes('\0') || pathname.split('/').includes('..')) {
      response.writeHead(400)
      response.end()
      return
    }
    const relative = pathname.replace(/^\/+/, '')
    const file = path.resolve(root, relative)
    if (file !== root && !file.startsWith(`${root}${path.sep}`)) {
      response.writeHead(400)
      response.end()
      return
    }
    if (relative && fs.existsSync(file) && fs.statSync(file).isFile()) {
      response.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream' })
      fs.createReadStream(file).pipe(response)
      return
    }
    const index = path.join(root, 'index.html')
    if (!fs.existsSync(index)) {
      response.writeHead(404)
      response.end('Missing index.html. Run npm run build first.')
      return
    }
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    fs.createReadStream(index).pipe(response)
  })
}

const invoked = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (invoked) {
  const root = path.resolve(process.argv[2] || 'build/client')
  const port = Number(process.env.PORT || 4173)
  const server = createSpaServer(root)
  server.listen(port, '127.0.0.1', () => {
    console.log(`Relay is serving ${root} at http://127.0.0.1:${port}`)
  })
}
