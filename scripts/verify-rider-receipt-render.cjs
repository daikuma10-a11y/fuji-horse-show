const fs = require('fs'), path = require('path'), ts = require('typescript'), assert = require('node:assert/strict')
const { renderToStaticMarkup } = require('react-dom/server'), { createElement } = require('react')
const root = process.cwd(), cache = new Map()
function load(file) {
  if (!path.extname(file)) file += fs.existsSync(file + '.tsx') ? '.tsx' : '.ts'
  if (cache.has(file)) return cache.get(file).exports
  const module = { exports: {} }; cache.set(file, module)
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } }).outputText
  new Function('require', 'module', 'exports', output)(name => name.startsWith('@/') ? load(path.join(root, name.slice(2))) : name.startsWith('.') ? load(path.resolve(path.dirname(file), name)) : require(name), module, module.exports)
  return module.exports
}
const { RiderReceiptForm } = load(path.join(root, 'components/admin/rider-receipt-form.tsx'))
const { ReceiptPrint } = load(path.join(root, 'components/admin/settlement-print-layouts.tsx'))
const source = { key: 'normal:entry-1', riderId: 'p1', rider: '福島大輔', label: '競技1 ／ 福島大輔 ／ 馬A', amount: 10000, paid: 10000 }
const form = renderToStaticMarkup(createElement(RiderReceiptForm, { organizationKey: 'org-7', organization: 'STAR HORSES', sources: [source], receipts: [], session: {}, onBeforeIssue: async () => {}, onSaved: () => {} }))
assert.match(form, /福島大輔/); assert.match(form, /対象の選手/); assert.match(form, /領収書の宛名/); assert.match(form, /領収書のみ保存して印刷/)
const receipt = { id: 'test', recipient: '千葉県馬術連盟', amount: 10000, tax_amount: 909, issue_date: '2026-10-01', purpose: 'エントリー代として', payment_method: 'bank_transfer', issuer_name: '有限会社 富士ファーム', issuer_address: '住所', registration_number: '', selected_items: [], document_items: [{ key: source.key, label: source.label, amount: 10000, limit: 10000 }] }
const printed = renderToStaticMarkup(createElement(ReceiptPrint, { receipt }))
assert.match(printed, /千葉県馬術連盟/); assert.match(printed, /福島大輔/); assert.match(printed, /馬A/); assert.match(printed, /10,000/); assert.match(printed, /対象明細/)
const legacy = renderToStaticMarkup(createElement(ReceiptPrint, { receipt: { ...receipt, document_items: [], selected_items: [{ key: 'request:old', label: '従来の追加', amount: 10000 }] } }))
assert.match(legacy, /従来の追加/)
console.log('PASS: rider selector, editable recipient, receipt-only controls, printed selected rider/horse/amount, and existing receipt layout')
