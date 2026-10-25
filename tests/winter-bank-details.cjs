require('./register-ts.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs')
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {WINTER_BANK_DETAILS:bank,WINTER_EVENT_ID:ev}=require('../lib/winter-event.ts')
const {winterSettlementAccount}=require('../lib/winter-settlement.ts')
const {winterCheckoutBankDetails,validateWinterCheckoutAccount}=require('../lib/winter-checkout.ts')
const {winterMasterSettlementAccount,winterMasterSavedSettlement}=require('../lib/winter-master-settlement.ts')
const {WinterPaymentInstructionForm}=require('../components/winter-payment-instruction-form.tsx')
const org={id:'11111111-1111-4111-8111-111111111111',event_id:ev,name:'確認用団体'}
const data={eventId:ev,organizations:[org],competitions:[],riders:[],horses:[],entries:[]}
const ledger={initial:[],requests:[],advances:[]}
const account=winterSettlementAccount(data,ledger,org.id)
assert.equal(bank,'静岡銀行 御殿場西支店 普通 0110546 フジホースショー事務局 川口 雅美')
assert.equal(account.instruction,undefined,'no individual method chosen')
assert.equal(winterCheckoutBankDetails(account),bank)
assert.equal(account.remaining,0);assert.equal(account.advancePaid,0);assert.equal(account.extraPaid,0)
assert.equal(winterMasterSettlementAccount(account,new Date(),'bank_transfer').document.bankDetails,bank)
assert.equal(winterMasterSettlementAccount(account,new Date(),'cash_at_venue').document.bankDetails,'')
const legacy={...account,instruction:{payment_method:'bank_transfer',bank_details:'当時保存された振込先'}};delete legacy.bankDetails
const saved={id:'saved',event_id:ev,organization_key:org.id,account_version:'v',payment_method:'bank_transfer',confirmer_name:'確認者',account:legacy,created_at:'2026-10-01T00:00:00Z'}
assert.equal(winterMasterSavedSettlement(saved,org.id).document.document.bankDetails,'当時保存された振込先')
assert.equal(winterCheckoutBankDetails({...legacy,instruction:undefined}),'','old missing destination is not rewritten')
assert.equal(winterCheckoutBankDetails({...account,bankDetails:'保存時の口座'}),'保存時の口座')
assert.throws(()=>validateWinterCheckoutAccount({...account,bankDetails:123}),/振込先/)
const form=renderToStaticMarkup(React.createElement(WinterPaymentInstructionForm,{session:{accessToken:'test'},orgId:org.id,instruction:{payment_method:'bank_transfer',bank_details:''},onSession(){},onChanged(){}}))
assert.ok(form.includes(bank),'blank payment form uses official bank')
const migration=fs.readFileSync('supabase/migrations/20261025074518_winter_official_bank_details.sql','utf8')
assert.ok(migration.includes(bank),'database and app destination agree')
console.log('PASS: official destination without per-club configuration, bank/cash print, historical destinations, form default, unchanged money/method, DB/config agreement')
