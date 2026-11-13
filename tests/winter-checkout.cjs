const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
function load(file,mocks={}){const full=path.resolve(file),m=new Module(full,module);m.filename=full;m.paths=module.paths;m.require=n=>n in mocks?mocks[n]:require(Module._resolveFilename(n,m));m._compile(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,full);return m.exports}
const event=load('lib/winter-event.ts'),api=load('lib/winter-checkout.ts',{'./winter-event':event}),model=load('lib/winter-master-settlement.ts',{'./winter-checkout':api}),template=load('lib/master/settlement-print.ts',{'../fees':load('lib/fees.ts')}),draft=load('lib/winter-settlement-print.ts',{'./winter-event':event,'./winter-master-settlement':model,'./master/settlement-print':template}),print=load('lib/winter-checkout-print.ts',{'./winter-checkout':api,'./winter-master-settlement':model,'./master/settlement-print':template})
const account={organization:{id:'org',event_id:event.WINTER_EVENT_ID,name:'検証<script>団体'},normalTotal:10000,horseRegistration:{count:1,unitFee:14000,total:14000,horses:[]},initialTotal:24000,extraTotal:3000,adjustmentTotal:-1000,total:26000,advancePaid:24000,advance:{paid_amount:24000},extraPaid:0,remaining:2000,instruction:null,adjustments:[{reason:'訂正<script>',delta:-1000}],lines:[{id:'q',action:'追加',competitionLabel:'第1競技',rider:'選手',horse:'馬',amount:3000}],warnings:[],pending:0}
const record={id:'saved-id',event_id:event.WINTER_EVENT_ID,organization_key:'org',account_version:'v',payment_method:'cash_at_venue',confirmer_name:'確認<script>者',account,created_at:'2026-10-11T13:00:00Z'}
assert.equal(api.validateWinterSettlementRecord(record,'org'),record)
assert.throws(()=>api.validateWinterCheckoutAccount({...account,total:27000}),/合計/)
assert.throws(()=>api.validateWinterSettlementRecord(record,'other'),/一致/)
assert.throws(()=>api.validateWinterSettlementRecord({...record,event_id:'autumn'},'org'),/Winter/)
const html=print.winterCheckoutPrintHtml(record);assert(html.includes('Fuji Horse Show 精算書'));assert(!html.includes('精算書（確認用）'));assert(!html.includes('精算内容の確定は行っていません'));assert(!html.includes('保存済み精算内容'));assert(html.includes('saved-id'));assert(html.includes('支払い予定の確認書です'));assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('¥2,000'));assert(!html.includes('Bearer'))
const zero={...record,payment_method:'no_payment_due',account:{...account,extraPaid:2000,remaining:0}}
assert(print.winterCheckoutPrintHtml(zero).includes('<td>お支払い不要</td>'))
const provisional=draft.winterSettlementPrintHtml(account,new Date(record.created_at))
assert(provisional.includes('精算書（確認用）'));assert(!provisional.includes('受付番号：'));assert(!provisional.includes('保存日時：'));assert(provisional.includes('¥2,000'))
// The recipient sees the final charge once on the affected row, in both print paths.
const changes=[{id:'op',action:'変更',competitionLabel:'第5競技',rider:'選手',horse:'馬',amount:2000},
 {id:'added',action:'追加',competitionLabel:'第5競技',rider:'選手',horse:'馬',amount:8000},
 {id:'swap',action:'変更',competitionLabel:'第16競技',rider:'別選手',horse:'旧馬 → 新馬',amount:2000}]
const corrections=[{delta:-2000,reason:'内部記録A',statement_items:[{lineId:'op',delta:-2000,note:'OP後付け・変更料免除'}]},
 {delta:-1000,reason:'内部記録B',statement_items:[{lineId:'added',delta:-1000,note:'OP競技料4,000円＋追加料3,000円'}]},
 {delta:500,reason:'別途追加料金'}]
const linked={...account,lines:changes,adjustments:corrections,extraTotal:12000,adjustmentTotal:-2500,total:33500,remaining:9500}
const original=JSON.stringify(linked)
for(const page of [draft.winterSettlementPrintHtml(linked),print.winterCheckoutPrintHtml({...record,account:linked})]){
 const detail=[...page.matchAll(/<tr>(.*?)<td class="amount">([^<]*)<\/td><\/tr>/gs)].map(m=>m[2])
 assert.deepEqual(detail,['¥0','¥7,000','¥2,000'])
 for(const value of ['変更料免除','OP競技料4,000円＋追加料3,000円','¥9,000','¥9,500','別途追加料金','¥500'])assert(page.includes(value))
 assert(!page.includes('内部記録')&&!page.includes('金額訂正合計'))
}
assert.equal(JSON.stringify(linked),original)
const historical=print.winterCheckoutPrintHtml({...record,account:{...linked,adjustments:corrections.map(({statement_items,...row})=>row)}})
assert(historical.includes('内部記録A')&&historical.includes('¥12,000')&&historical.includes('¥9,500'))
const missing={...linked,lines:changes.slice(1),extraTotal:10000,total:31500,remaining:7500}
const missingDocument=model.winterMasterSettlementAccount(missing).document
assert.equal(missingDocument.extraTotal,9000)
assert(missingDocument.summaryRows.some(row=>row.value==='¥-2,000'))
assert.throws(()=>model.winterMasterSettlementAccount({...linked,adjustments:[{...corrections[0],statement_items:[{lineId:'op',delta:-1,note:'免除'}]},...corrections.slice(1)]}),/内訳/)
console.log('PASS: snapshot totals/event/org guards, saved print escaping, cash not implicitly paid, zero balance, read-only reprint without POST')
