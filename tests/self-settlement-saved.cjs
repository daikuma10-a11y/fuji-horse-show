const assert = require('node:assert/strict')
const { load } = require('./self-settlement.cjs')
const { currentSavedSettlement } = load('lib/self-settlement-saved.ts')
const account = { document: { organizationKey: 'org-1', organization: 'テスト団体', due: 8000, issuedDate: '2026/10/06', method: '後日振込', bankDetails: 'テスト銀行', lines: [{ competition: '競技1', amount: 8000 }] }, normalLines: [], warnings: [] }
const saved = { id: 'saved', organization_key: 'org-1', amount: 8000, document: structuredClone(account) }
assert.equal(currentSavedSettlement(account, [saved]), saved)
const nextDay = structuredClone(account); nextDay.document.issuedDate = '2026/10/07'
assert.equal(currentSavedSettlement(nextDay, [saved]), saved)
const changed = structuredClone(account); changed.document.lines[0].competition = '競技2'
assert.equal(currentSavedSettlement(changed, [saved]), null, 'same amount with changed entries needs confirmation')
const method = structuredClone(account); method.document.method = '当日現金'
assert.equal(currentSavedSettlement(method, [saved]), null)
const warning = structuredClone(account); warning.warnings.push('未反映の申請')
assert.equal(currentSavedSettlement(warning, [saved]), null)
assert.equal(currentSavedSettlement(account, []), null)
assert.equal(currentSavedSettlement(account, [{ ...saved, organization_key: 'org-2' }]), null)
console.log('PASS: restore unchanged saved statements, reject changed entries, payment method, warnings and organization')
