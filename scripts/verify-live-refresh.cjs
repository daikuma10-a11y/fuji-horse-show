const fs = require('fs'), ts = require('typescript'), assert = require('node:assert/strict')
const mod = { exports: {} }
new Function('module', 'exports', ts.transpileModule(fs.readFileSync('lib/live-refresh.ts', 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText)(mod, mod.exports)
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
;(async () => {
  let calls = 0, concurrent = 0, maximum = 0
  const loop = mod.exports.startLiveRefresh(async () => {
    calls++; concurrent++; maximum = Math.max(maximum, concurrent)
    await wait(15); concurrent--
  }, 5)
  await wait(7)
  loop.refresh(); loop.refresh(); loop.refresh()
  await wait(60)
  assert.equal(calls, 2, 'One initial read and one queued read')
  await wait(40)
  assert.equal(calls, 2, 'Idle clients must not poll')
  assert.equal(maximum, 1)
  loop.refresh(); loop.stop(); await wait(20)
  assert.equal(calls, 2, 'Unmount cancels queued reads')
  class FakeSocket {
    static OPEN = 1
    constructor(url) { this.url = url; this.readyState = 1; FakeSocket.last = this; this.sent = [] }
    send(value) { this.sent.push(JSON.parse(value)) }
    close() { this.onclose?.() }
  }
  global.WebSocket = FakeSocket
  let changes = 0, connected = false
  const stop = mod.exports.subscribeToEventChanges('https://example.supabase.co', 'public-key', 'event', () => changes++, value => connected = value)
  const ws = FakeSocket.last; ws.onopen()
  const join = ws.sent[0]
  ws.onmessage({ data: JSON.stringify({ topic: join.topic, ref: join.ref, event: 'phx_reply', payload: { status: 'ok' } }) })
  assert(connected); assert.equal(changes, 1)
  ws.onmessage({ data: JSON.stringify({ topic: 'other', event: 'broadcast', payload: { event: 'changed' } }) })
  assert.equal(changes, 1)
  ws.onmessage({ data: JSON.stringify({ topic: join.topic, event: 'broadcast', payload: { event: 'changed' } }) })
  assert.equal(changes, 2)
  stop(); ws.onmessage({ data: JSON.stringify({ topic: join.topic, event: 'broadcast', payload: { event: 'changed' } }) })
  assert.equal(changes, 2)
  console.log('PASS: event-driven reads, idle silence, burst coalescing, no overlap, websocket join, changes and cleanup')
})().catch(error => { console.error(error); process.exitCode = 1 })
