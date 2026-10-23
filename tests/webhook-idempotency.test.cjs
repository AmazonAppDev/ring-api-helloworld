const assert = require('node:assert/strict')
const { readFileSync } = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')
const ts = require('typescript')
const { NextRequest } = require('next/server')

// Loads the real webhook route (and its real schema + broadcaster) from
// TypeScript source with a fresh module state per test. `broadcastEvent` is
// wrapped so a test can make the handler fail on demand.
function fixture() {
  const cache = new Map()
  const control = { failNextBroadcast: null }
  function load(relativePath) {
    if (cache.has(relativePath)) return cache.get(relativePath)
    const filename = path.join(__dirname, '..', relativePath)
    const code = ts.transpileModule(readFileSync(filename, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: filename,
    }).outputText
    const module = { exports: {} }
    cache.set(relativePath, module.exports)
    vm.runInNewContext(code, {
      module, exports: module.exports,
      require(id) {
        if (id === '@/lib/sse-broadcast') return broadcaster
        if (id === '@/lib/schemas/webhook') return load('lib/schemas/webhook.ts')
        return require(id)
      },
      ReadableStream, Response, TextEncoder, console, process, setInterval, clearInterval,
    }, { filename })
    cache.set(relativePath, module.exports)
    return module.exports
  }
  const realBroadcaster = load('lib/sse-broadcast.ts')
  const broadcaster = {
    ...realBroadcaster,
    broadcastEvent(event) {
      if (control.failNextBroadcast) {
        const error = control.failNextBroadcast
        control.failNextBroadcast = null
        throw error
      }
      realBroadcaster.broadcastEvent(event)
    },
  }
  return { route: load('app/api/webhook/route.ts'), store: realBroadcaster.eventStore, control }
}

// v1.1 motion_detected payload, shape taken from Ring's Notifications docs.
function ringPayload({ requestId, timestamp = 1770989995231, deviceId = 'dev1' } = {}) {
  return {
    meta: { version: '1.1', time: '2026-02-13T13:39:57.200155525Z', request_id: requestId, account_id: 'ava1.ring.account.XXXYYY' },
    data: {
      id: `${deviceId}_motion_${timestamp}`,
      type: 'motion_detected',
      attributes: { source: deviceId, source_type: 'devices', timestamp, sub_type: 'human' },
      relationships: { devices: { links: { self: `/v1/devices/${deviceId}` } } },
    },
  }
}

const post = (route, payload) =>
  route.POST(new NextRequest('http://localhost/api/webhook', { method: 'POST', body: JSON.stringify(payload) }))

// The route logs failures with console.error; silence it so test output stays readable.
const quiet = () => { const original = console.error; console.error = () => {}; return () => { console.error = original } }

test('a delivery is processed once and its duplicate is deduped', async () => {
  const { route, store } = fixture()
  const first = await post(route, ringPayload({ requestId: 'req-ok' }))
  assert.equal(first.status, 200)
  assert.equal((await first.json()).status, 'processed')
  const duplicate = await post(route, ringPayload({ requestId: 'req-ok' }))
  assert.equal(duplicate.status, 200)
  assert.equal((await duplicate.json()).status, 'already_processed')
  assert.equal(store.length, 1)
})

test('handler fails then Ring retries: the retry is processed, not dropped', async () => {
  const { route, store, control } = fixture()
  const restore = quiet()
  try {
    control.failNextBroadcast = new Error('transient downstream failure')
    const failed = await post(route, ringPayload({ requestId: 'req-retry' }))
    assert.equal(failed.status, 500, 'a failed handler must answer non-2xx so Ring retries')
    assert.equal(store.length, 0)

    const retry = await post(route, ringPayload({ requestId: 'req-retry' }))
    assert.equal(retry.status, 200)
    assert.equal((await retry.json()).status, 'processed')
    assert.equal(store.length, 1)
    assert.equal(store[0].metadata.request_id, 'req-retry')

    const afterSuccess = await post(route, ringPayload({ requestId: 'req-retry' }))
    assert.equal((await afterSuccess.json()).status, 'already_processed')
    assert.equal(store.length, 1)
  } finally { restore() }
})

test('a timestamp that throws RangeError never turns into already_processed on retry', async () => {
  const { route, store } = fixture()
  const restore = quiet()
  try {
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await post(route, ringPayload({ requestId: 'req-bad-ts', timestamp: 1e20 }))
      assert.equal(response.status, 500, `attempt ${attempt} must stay non-2xx`)
      assert.equal(store.length, 0)
    }
  } finally { restore() }
})

test('a failed delivery does not block a different request_id', async () => {
  const { route, store, control } = fixture()
  const restore = quiet()
  try {
    control.failNextBroadcast = new Error('boom')
    assert.equal((await post(route, ringPayload({ requestId: 'req-a' }))).status, 500)
    const other = await post(route, ringPayload({ requestId: 'req-b' }))
    assert.equal((await other.json()).status, 'processed')
    assert.equal(store.length, 1)
  } finally { restore() }
})
