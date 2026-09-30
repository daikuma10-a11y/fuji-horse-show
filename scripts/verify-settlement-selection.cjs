const fs = require('fs'), ts = require('typescript'), assert = require('node:assert/strict')
function load(name) { const module = { exports: {} }; const output = ts.transpileModule(fs.readFileSync(`lib/${name}.ts`, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText; new Function('exports', 'module', output)(module.exports, module); return module.exports }
const { settlementChoices, allocateSettlement, selectedSettlementDocument } = load('settlement-selection')
const document = { organization: 'Test', organizationKey: 'test', issuedDate: '2026/9/30', method: '現金', bankDetails: '', normalTotal: 10000, advancePaid: 10000, normalRemaining: 0, extraTotal: 13000, extraPaid: 2000, due: 11000, lines: [
  { key: 'request:a', action: '追加', competition: '競技1', rider: 'A', horse: 'B', amount: 11000, paid: 2000, entryFee: 8000, serviceFee: 3000, difference: 0, note: '' },
  { key: 'request:b', action: '変更', competition: '競技2', rider: 'C', horse: 'D', amount: 2000, paid: 0, entryFee: 0, serviceFee: 2000, difference: 0, note: '' },
] }
let choices = settlementChoices(document, [])
assert.equal(choices[0].remaining, 0)
assert.equal(choices[1].remaining, 9000)
assert.throws(() => allocateSettlement(choices, [], 100))
assert.throws(() => allocateSettlement(choices, ['request:b'], 2001))
assert.throws(() => allocateSettlement(choices, ['request:a'], 0))
assert.deepEqual(allocateSettlement(choices, ['request:a', 'request:b'], 10000).map(item => item.amount), [9000, 1000])
const selected = selectedSettlementDocument(document, choices, ['request:b'])
assert.equal(selected.due, 2000); assert.equal(selected.lines.length, 1); assert.equal(selected.normalTotal, 0)
const receipt = { selected_items: [{ key: 'request:a', amount: 9000 }] }
document.lines[0].paid = 11000; document.extraPaid = 11000; document.due = 2000
choices = settlementChoices(document, [receipt])
assert.equal(choices[1].remaining, 0); assert.equal(choices[1].limit, 9000); assert.equal(choices[2].remaining, 2000)
const normal = { ...document, normalTotal: 15000, normalRemaining: 15000, advancePaid: 5000 }
assert.equal(settlementChoices(normal, [{ selected_items: [{ key: 'normal', amount: 5000 }] }])[0].remaining, 10000)
const { settlementWorkbook } = load('settlement-document')
fs.writeFileSync('/tmp/fhs-document-check/selection.xlsx', settlementWorkbook(selected))
console.log('PASS: selected charges, prior payment, partial payment, zero/overpayment rejection and remaining balances')
