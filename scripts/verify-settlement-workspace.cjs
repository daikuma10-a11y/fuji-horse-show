const fs = require('fs'), path = require('path'), ts = require('typescript'), assert = require('node:assert/strict')
const React = require('react')
const root = process.cwd(), cache = new Map()
let current
const hooks = {
  ...React,
  useState(initial) {
    const harness = current, index = harness.index++
    if (!(index in harness.state)) harness.state[index] = typeof initial === 'function' ? initial() : initial
    return [harness.state[index], next => { harness.state[index] = typeof next === 'function' ? next(harness.state[index]) : next }]
  },
  useRef(initial) { const harness = current, index = harness.index++; return harness.state[index] ??= { current: initial } },
  useId() { current.index++; return 'test-panel' },
  useEffect() {},
}
function load(file) {
  if (!path.extname(file)) file += fs.existsSync(file + '.tsx') ? '.tsx' : '.ts'
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'module', 'exports', output)(name => name === 'react' ? hooks : name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name), module, module.exports)
  return module.exports
}
function harness(Component, props) {
  const instance = { state: [], index: 0, props, render() { current = instance; instance.index = 0; return Component(instance.props) } }
  return instance
}
function elements(node, predicate) {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap(child => elements(child, predicate))
  return [...(predicate(node) ? [node] : []), ...elements(node.props?.children, predicate)]
}
function text(node) { if (Array.isArray(node)) return node.map(text).join(''); if (node && typeof node === 'object') return text(node.props?.children); return node == null ? '' : String(node) }
const { SettlementDocuments } = load(path.join(root, 'components/admin/settlement-documents.tsx'))
const { RiderReceiptForm } = load(path.join(root, 'components/admin/rider-receipt-form.tsx'))
const document = { organizationKey: 'org-7', organization: 'STAR HORSES', issuedDate: '2026/10/01', normalTotal: 10000, normalRemaining: 0, advancePaid: 10000, advanceRecorded: true, extraTotal: 11000, extraPaid: 0, due: 11000, method: '当日現金', bankDetails: '', lines: [
  { key: 'request:add', riderId: 'p1', action: '追加', period: '大会期間中', competitionNumber: 1, competition: '競技1', rider: '福島大輔', horse: '馬A', amount: 11000, paid: 0, note: '' },
  { key: 'request:withdraw', riderId: 'p1', action: '棄権', period: '大会期間中', competitionNumber: 2, competition: '競技2', rider: '福島大輔', horse: '馬B', amount: 0, paid: 0, note: '' },
] }
const instance = harness(SettlementDocuments, { document, receiptSources: [], receipts: [], session: {}, ready: true, onReceiptSaved() {}, onBeforeIssue: async () => {}, paymentMethod: 'bank_transfer' })
let view = instance.render()
let panels = elements(view, node => node.type === 'section')
assert.equal(panels.length, 3); assert(panels.every(node => node.props.hidden))
const actionButtons = () => elements(view, node => node.type === 'button' && 'aria-controls' in node.props)
assert.deepEqual(actionButtons().map(node => text(node.props.children[0])), ['精算する', '領収書を作る', '精算書を印刷・保存'])
actionButtons()[0].props.onClick(); view = instance.render()
panels = elements(view, node => node.type === 'section')
assert.deepEqual(panels.map(node => node.props.hidden), [false, true, true])
const checks = elements(panels[0], node => node.type === 'input' && node.props.type === 'checkbox')
assert.equal(checks.length, 3); assert.equal(checks[0].props.checked, false); assert(checks.slice(1).every(node => node.props.checked))
checks[1].props.onChange({ target: { checked: false } }); view = instance.render()
actionButtons()[1].props.onClick(); view = instance.render()
actionButtons()[0].props.onClick(); view = instance.render()
assert.equal(elements(view, node => node.type === 'input' && node.props.type === 'checkbox')[1].props.checked, false, 'selection survives panel switches')
actionButtons()[2].props.onClick(); view = instance.render()
assert.deepEqual(elements(view, node => node.type === 'section').map(node => node.props.hidden), [true, true, false])
instance.props.ready = false; view = instance.render()
assert.match(text(view), /上の支払方法を保存/)
assert(elements(view, node => node.type === 'button' && text(node) === '団体全体の精算書を印刷')[0].props.disabled)
const sources = [
  { key: 'normal:p1', riderId: 'p1', rider: '福島大輔', label: '福島大輔 ／ 馬A', amount: 10000, paid: 10000 },
  { key: 'normal:p2', riderId: 'p2', rider: '別選手', label: '別選手 ／ 馬B', amount: 8000, paid: 8000 },
  { key: 'request:unpaid', riderId: 'p1', rider: '福島大輔', label: '未入金の追加', amount: 11000, paid: 0 },
]
const receiptForm = harness(RiderReceiptForm, { embedded: true, organizationKey: 'org-7', organization: 'STAR HORSES', sources, receipts: [], session: {}, onBeforeIssue: async () => {}, onSaved() {} })
let form = receiptForm.render()
const select = () => elements(form, node => node.type === 'select')[0]
select().props.onChange({ target: { value: '__all__' } }); form = receiptForm.render()
assert.match(text(form), /対象：2件 ／ ¥18,000/)
select().props.onChange({ target: { value: 'p1' } }); form = receiptForm.render()
assert.match(text(form), /対象：1件 ／ ¥10,000/)
assert.equal(elements(form, node => node.type === 'input' && node.props.type === 'checkbox' && node.props.disabled).length, 1)
const recipient = elements(form, node => node.type === 'input' && node.props.value === 'STAR HORSES')[0]
recipient.props.onChange({ target: { value: '千葉県馬術連盟' } }); form = receiptForm.render()
assert(elements(form, node => node.type === 'input' && node.props.value === '千葉県馬術連盟').length)
console.log('PASS: three closed task panels, one visible action, persistent selection, default add/withdrawal checks, print prerequisites, group/rider paid-only receipt selection and editable recipient')
for (const advancePaid of [0, 5000]) {
  const unpaidDocument = { ...document, advancePaid, advanceRecorded: advancePaid > 0, normalRemaining: 10000 - advancePaid, due: 21000 - advancePaid }
  const unpaid = harness(SettlementDocuments, { ...instance.props, ready: true, document: unpaidDocument })
  let unpaidView = unpaid.render()
  elements(unpaidView, node => node.type === 'button' && 'aria-controls' in node.props)[0].props.onClick()
  unpaidView = unpaid.render()
  const normalCheckbox = elements(unpaidView, node => node.type === 'input' && node.props.type === 'checkbox')[0]
  assert.equal(normalCheckbox.props.disabled, false)
  normalCheckbox.props.onChange({ target: { checked: true } }); unpaidView = unpaid.render()
  assert.match(text(unpaidView), new RegExp(`選択分：¥${(21000 - advancePaid).toLocaleString('en-US')}`))
  elements(unpaidView, node => node.type === 'button' && text(node) === '選択分の精算書を印刷')[0].props.onClick()
  unpaidView = unpaid.render()
  const printed = elements(unpaidView, node => typeof node.type === 'function' && node.type.name === 'StatementPrint').at(-1).props.document
  assert.equal(printed.due, 21000 - advancePaid); assert.equal(printed.selection.includeNormal, true)
  assert.equal(printed.organization, 'STAR HORSES'); assert.equal(printed.advancePaid, advancePaid)
}
console.log('PASS: unpaid and partially paid advance entries can be checked and included in printed settlement balances')
