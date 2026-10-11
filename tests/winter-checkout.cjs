const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
function load(file,mocks={}){const full=path.resolve(file),m=new Module(full,module);m.filename=full;m.paths=module.paths;m.require=n=>n in mocks?mocks[n]:require(Module._resolveFilename(n,m));m._compile(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,full);return m.exports}
const event=load('lib/winter-event.ts'),api=load('lib/winter-checkout.ts',{'./winter-event':event}),draft=load('lib/winter-settlement-print.ts',{'./winter-event':event}),print=load('lib/winter-checkout-print.ts',{'./winter-checkout':api,'./winter-settlement-print':draft})
const account={organization:{id:'org',event_id:event.WINTER_EVENT_ID,name:'検証<script>団体'},normalTotal:10000,horseRegistration:{count:1,unitFee:14000,total:14000,horses:[]},initialTotal:24000,extraTotal:3000,adjustmentTotal:-1000,total:26000,advancePaid:24000,advance:{paid_amount:24000},extraPaid:0,remaining:2000,instruction:null,adjustments:[{reason:'訂正<script>',delta:-1000}],lines:[{id:'q',action:'追加',competitionLabel:'第1競技',rider:'選手',horse:'馬',amount:3000}],warnings:[],pending:0}
const record={id:'saved-id',event_id:event.WINTER_EVENT_ID,organization_key:'org',account_version:'v',payment_method:'cash_at_venue',confirmer_name:'確認<script>者',account,created_at:'2026-10-11T13:00:00Z'}
assert.equal(api.validateWinterSettlementRecord(record,'org'),record)
assert.throws(()=>api.validateWinterCheckoutAccount({...account,total:27000}),/合計/)
assert.throws(()=>api.validateWinterSettlementRecord(record,'other'),/一致/)
assert.throws(()=>api.validateWinterSettlementRecord({...record,event_id:'autumn'},'org'),/Winter/)
const html=print.winterCheckoutPrintHtml(record);assert(html.includes('Fuji Horse Show 精算書'));assert(!html.includes('精算確認用（仮）'));assert(!html.includes('精算内容の確定は行っていません'));assert(html.includes('保存済み精算内容'));assert(html.includes('saved-id'));assert(html.includes('現金・振込の選択は入金済みを示しません'));assert(!html.includes('<script>'));assert(html.includes('&lt;script&gt;'));assert(html.includes('2,000円'));assert(!html.includes('Bearer'))
const zero={...record,payment_method:'no_payment_due',account:{...account,extraPaid:2000,remaining:0}}
assert(print.winterCheckoutPrintHtml(zero).includes('<td>追加のお支払いなし</td>'))
const source=fs.readFileSync('components/winter-self-settlement.tsx','utf8');const reprint=source.slice(source.indexOf(' async function reprint()'),source.indexOf(' const currentSaved'))
assert(!reprint.includes('fetch('));assert(reprint.includes('printRecord(popup,saved)'))
console.log('PASS: snapshot totals/event/org guards, saved print escaping, cash not implicitly paid, zero balance, read-only reprint without POST')
