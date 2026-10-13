import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import test from 'node:test'
import { createSpaServer } from './serve-client.mjs'

test('direct visits to activity and my-stuff return the app shell', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'relay-spa-'))
  fs.writeFileSync(path.join(root, 'index.html'), '<title>Relay</title><div id="root"></div>')
  fs.writeFileSync(path.join(root, 'app.js'), 'console.log("relay")')
  const server = createSpaServer(root)
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve))
  const { port } = server.address()
  try {
    for (const route of ['/activity', '/my-stuff', '/']) {
      const response = await fetch(`http://127.0.0.1:${port}${route}`)
      assert.equal(response.status, 200)
      assert.match(await response.text(), /<title>Relay<\/title>/)
    }
    const script = await fetch(`http://127.0.0.1:${port}/app.js`)
    assert.equal(script.status, 200)
    assert.match(await script.text(), /relay/)
  } finally {
    await new Promise((resolve) => server.close(resolve))
  }
})
