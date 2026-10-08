const assert = require('node:assert/strict')
const fs = require('node:fs')
const ts = require('typescript')
const Module = require('node:module')
const file = require('node:path').resolve('lib/winter-event.ts')
const m = new Module(file, module)
m.filename = file
m.paths = module.paths
m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true, target: ts.ScriptTarget.ES2020 }
}).outputText, file)
const w = m.exports
assert.equal(w.winterEntryPrice(w.winterCompetition('1'), {}), 8000)
assert.equal(w.winterEntryPrice(w.winterCompetition('1'), { isOp: true }), 7000)
assert.equal(w.winterEntryPrice(w.winterCompetition('①'), {}), 7000)
assert.throws(() => w.winterEntryPrice(w.winterCompetition('①'), { isOp: true }))
assert.throws(() => w.winterEntryPrice(w.winterCompetition('6'), { isOp: true }))
for (const number of ['5', '25']) {
  assert.throws(() => w.winterEntryPrice(w.winterCompetition(number), {}))
  assert.equal(w.winterEntryPrice(w.winterCompetition(number), { membership: 'member' }), 5000)
  assert.equal(w.winterEntryPrice(w.winterCompetition(number), { membership: 'nonmember' }), 10000)
}
for (const number of ['8', '32']) {
  assert.throws(() => w.winterEntryPrice(w.winterCompetition(number), { membership: 'member' }))
  assert.equal(w.winterEntryPrice(w.winterCompetition(number), { membership: 'member', instructorConfirmed: true }), 12000)
  assert.equal(w.winterEntryPrice(w.winterCompetition(number), { membership: 'nonmember', instructorConfirmed: true }), 15000)
}
assert.throws(() => w.assertWinterEvent('2af66251-66a2-4c51-8180-a5badf0584d4'))
w.assertWinterEvent(w.WINTER_EVENT_ID)
assert.match(w.winterStorageKey('reception-draft'), new RegExp(w.WINTER_EVENT_ID))
console.log('PASS: Winter prices, explicit fee categories, instructor checks, OP restrictions and event isolation')
