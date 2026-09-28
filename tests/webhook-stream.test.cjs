const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')

// Run the real route and broadcaster with native Web Streams and controlled
// heartbeat timers. No Next server, Ring credentials or network is needed.
function fixture() {
  const timers = new Map()
  let nextTimer = 0
  const modules = new Map()
  function load(relativePath) {
    if (modules.has(relativePath)) return modules.get(relativePath)
    const filename = path.join(__dirname, '..', relativePath)
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: filename,
    }).outputText
    const module = { exports: {} }
    vm.runInNewContext(code, {
      module, exports: module.exports,
      require(id) {
        if (id === '@/lib/sse-broadcast') return load('lib/sse-broadcast.ts')
        if (id === '@/lib/schemas/webhook') return { parseRingWebhook() { throw new Error('GET must not parse webhooks') } }
        return require(id)
      },
      ReadableStream, Response, TextEncoder, console, process,
      setInterval(fn, delay) {
        assert.equal(delay, 30000)
        const id = ++nextTimer
        timers.set(id, fn)
        return id
      },
      clearInterval(id) { timers.delete(id) },
    }, { filename })
    modules.set(relativePath, module.exports)
    return module.exports
  }
  const route = load('app/api/webhook/route.ts')
  return { route, broadcaster: load('lib/sse-broadcast.ts'), timers }
}

for (const reason of [undefined, 'browser disconnected', new Error('request aborted')]) {
  test(`cancel releases the client and heartbeat (${String(reason)})`, async () => {
    const { route, broadcaster, timers } = fixture()
    const response = await route.GET()
    assert.equal(response.headers.get('content-type'), 'text/event-stream')
    assert.equal(broadcaster.getClients().size, 1)
    assert.equal(timers.size, 1)
    await assert.doesNotReject(response.body.cancel(reason))
    assert.equal(broadcaster.getClients().size, 0)
    assert.equal(timers.size, 0)
  })
}

test('canceling one client preserves replay, broadcasts and heartbeat for another', async () => {
  const { route, broadcaster, timers } = fixture()
  const event = { event_id: 'recorded', event_type: 'motion_detected' }
  broadcaster.eventStore.push(event)
  const first = await route.GET()
  const second = await route.GET()
  const reader = second.body.getReader()
  const decode = async () => new TextDecoder().decode((await reader.read()).value)
  assert.equal(await decode(), ': connected\n\n')
  assert.equal(await decode(), `data: ${JSON.stringify(event)}\n\n`)
  await first.body.cancel('closed first tab')
  assert.equal(broadcaster.getClients().size, 1)
  assert.equal(timers.size, 1)
  const next = { event_id: 'live', event_type: 'ding' }
  broadcaster.broadcastEvent(next)
  assert.equal(await decode(), `data: ${JSON.stringify(next)}\n\n`)
  for (const tick of timers.values()) tick()
  assert.equal(await decode(), ': ping\n\n')
  await reader.cancel()
  assert.equal(broadcaster.getClients().size, 0)
  assert.equal(timers.size, 0)
})

test('failed heartbeat releases the client as well as its timer', async () => {
  const { route, broadcaster, timers } = fixture()
  const response = await route.GET()
  const controller = [...broadcaster.getClients()][0]
  controller.error(new Error('connection lost'))
  for (const tick of [...timers.values()]) tick()
  assert.equal(broadcaster.getClients().size, 0)
  assert.equal(timers.size, 0)
  await assert.rejects(response.body.getReader().read(), /connection lost/)
})
