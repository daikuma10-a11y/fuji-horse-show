const fs = require('fs'), ts = require('typescript'), assert = require('node:assert/strict')
function load(name) { const module = { exports: {} }; const output = ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; new Function('exports', 'module', output)(module.exports, module); return module.exports }
const { riderReceiptChoices } = load('rider-receipt')
const { allocateSettlement } = load('settlement-selection')
const sources = [
  { key: 'normal:entry-1', riderId: 'rider-1', rider: '福島大輔', label: '事前 ／ 競技1 ／ 福島大輔 ／ 馬A', amount: 10000, paid: 10000 },
  { key: 'normal:entry-2', riderId: 'rider-2', rider: '別の選手', label: '事前 ／ 競技2 ／ 別の選手 ／ 馬B', amount: 8000, paid: 8000 },
  { key: 'request:extra-1', riderId: 'rider-1', rider: '福島大輔', label: '追加 ／ 競技3 ／ 福島大輔 ／ 馬C', amount: 11000, paid: 6000 },
  { key: 'request:withdraw-1', riderId: 'rider-1', rider: '福島大輔', label: '棄権 ／ 競技4', amount: 0, paid: 0 },
]
const groupReceipt = { selected_items: [{ key: 'normal', amount: 18000 }, { key: 'request:extra-1', amount: 6000 }] }
const selectedKeys = ['normal:entry-1', 'request:extra-1']
const choices = riderReceiptChoices(sources, [groupReceipt])
const chosen = choices.filter(item => item.riderId === 'rider-1')
assert.equal(chosen.reduce((sum, item) => sum + item.remaining, 0), 16000)
const documentItems = allocateSettlement(chosen, selectedKeys, 16000)
assert.deepEqual(documentItems.map(item => item.amount), [10000, 6000])
const documentReceipt = { recipient: '千葉県馬術連盟', amount: 16000, selected_items: [], document_items: documentItems }
assert.equal([groupReceipt, documentReceipt].flatMap(row => row.selected_items).reduce((sum, item) => sum + item.amount, 0), 24000)
assert.equal(riderReceiptChoices(sources, [groupReceipt, documentReceipt]).filter(item => item.riderId === 'rider-1').reduce((sum, item) => sum + item.remaining, 0), 0)
assert.throws(() => allocateSettlement(chosen, selectedKeys, 16001))
assert.throws(() => allocateSettlement(chosen, ['request:withdraw-1'], 1))
const partial = { selected_items: [], document_items: allocateSettlement(chosen, selectedKeys, 4000) }
assert.equal(riderReceiptChoices(sources, [partial])[0].remaining, 6000)
assert.equal(riderReceiptChoices([{ ...sources[0], paid: 0 }], [])[0].remaining, 0)
assert.equal(riderReceiptChoices([{ ...sources[2], paid: 15000 }], [])[0].remaining, 11000)
assert.equal(choices.filter(item => item.riderId === 'rider-2')[0].remaining, 8000)
console.log('PASS: rider selection, alternate recipient, paid-only caps, partial/repeated documents, zero-fee exclusion, and unchanged group payments')
