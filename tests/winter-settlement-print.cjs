require('./register-ts.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
function load(file,mocks={}){const full=path.resolve(file),m=new Module(full,module);m.filename=full;m.paths=module.paths;m.require=n=>n in mocks?mocks[n]:require(Module._resolveFilename(n,m));m._compile(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,full);return m.exports}
const event=load('lib/winter-event.ts'),checkout=load('lib/winter-checkout.ts',{'./winter-event':event}),model=load('lib/winter-master-settlement.ts',{'./winter-checkout':checkout}),template=load('lib/master/settlement-print.ts',{'../fees':load('lib/fees.ts')}),{winterSettlementPrintHtml}=load('lib/winter-settlement-print.ts',{'./winter-event':event,'./winter-master-settlement':model,'./master/settlement-print':template})
const account={organization:{id:'org',event_id:event.WINTER_EVENT_ID,name:'団体<script>alert(1)</script>'},normalTotal:317000,horseRegistration:{count:2,unitFee:14000,total:28000},initialTotal:345000,extraTotal:200000,advancePaid:317000,extraPaid:5000,advance:{},instruction:{payment_method:'bank_transfer',bank_details:'検証銀行\n口座<script>悪意</script>'},remaining:223000,total:545000,adjustmentTotal:0,adjustments:[],pending:0,warnings:['事前入金 <確認>'],lines:Array.from({length:41},(_,i)=>({id:String(i),action:i===3?'棄権':'変更',competitionLabel:`第${i+1}競技 フジ中障害飛越競技B → 第${i+2}競技 フジ中障害飛越競技Cファイナル`,rider:`検証選手${i+1} → 川口 大輔`,horse:`検証馬${i+1} → ハリー・ポッター・D`,amount:i===3?0:5000}))}
const html=winterSettlementPrintHtml(account,new Date('2026-10-11T03:38:31Z'))
assert.equal((html.match(/<script>/g)||[]).length,1,'Only the local text-fit script is executable');assert(!html.includes('<script>alert'));assert(html.includes('&lt;script&gt;'));assert(html.includes('&lt;確認&gt;'));assert.equal((html.match(/<td class="amount">/g)||[]).length,40)
assert(html.includes('検証馬41'));assert(html.includes('後日振込'));assert(html.includes('口座&lt;script&gt;'));assert(html.includes('入金額は各「入金済み」欄をご確認ください'));assert(html.includes('最終請求書・領収書ではありません'));assert(html.includes('¥200,000'));assert(html.includes('追加・変更分の入金済み'));assert(html.includes('2頭 × ¥14,000 ＝ ¥28,000'));assert(html.includes('¥345,000'));assert(html.includes('¥5,000'));assert(!html.includes('追加・変更分の入金は含みません'));assert(!html.includes('Bearer'));assert(!html.includes('https://'));assert(!html.includes('事前エントリーの明細</'));assert.throws(()=>winterSettlementPrintHtml({...account,organization:{...account.organization,event_id:'autumn'}}),/Winter/)
const source=fs.readFileSync('components/winter-settlement-panel.tsx','utf8'),print=source.slice(source.indexOf(' async function print('),source.indexOf(' useEffect(()=>{let active'))
assert(print.includes('loadWinterData()'));assert(print.includes('loadWinterSettlement(verified.accessToken)'));assert(!print.includes('saveWinterAdvance'));assert(!print.includes('setLedger'));assert(print.includes('popup?.close()'))
if(process.env.FHS_PRINT_QA_DIR){fs.mkdirSync(process.env.FHS_PRINT_QA_DIR,{recursive:true});fs.writeFileSync(path.join(process.env.FHS_PRINT_QA_DIR,'winter-draft-long.html'),html);fs.writeFileSync(path.join(process.env.FHS_PRINT_QA_DIR,'winter-draft-short.html'),winterSettlementPrintHtml({...account,extraTotal:15000,total:360000,remaining:38000,lines:account.lines.slice(0,4)},new Date('2026-10-11T03:38:31Z')))}
console.log('PASS: 40 charge lines preserved and zero-fee withdrawal omitted, unsafe names escaped, Winter isolation, draft/limitations explicit, no external print assets or credentials, fresh read-only print without advance-save/reset')

// Refunds and applied advance credit are visible in both current and saved papers.
const {winterSettlementDraft}=require('../lib/winter-settlement-print')
const {winterMasterSavedSettlement}=require('../lib/winter-master-settlement')
const {masterSettlementSummary}=require('../lib/master/settlement-summary')
const {masterStatementWorkbook}=require('../lib/settlement-document')
const {unzipSync,strFromU8}=require('fflate')
const base={...account,normalTotal:10000,horseRegistration:{count:1,unitFee:14000,total:14000},initialTotal:24000,
 extraTotal:7000,total:31000,advancePaid:25000,extraPaid:0,remaining:6000,warnings:[],
 lines:[{id:'new',action:'追加',competitionLabel:'検証競技',rider:'検証選手',horse:'検証馬',amount:7000}]}
const original=JSON.stringify(base)
const order=['事前エントリー合計','馬匹登録料（1頭）','事前料金合計','追加・変更の合計','請求総額','お支払い額']
for(const [extraPaid,refundTotal,remaining,refundDue,credit] of [[0,0,6000,0,1000],[6000,0,0,0,1000],[8000,0,-2000,2000,0],[-1000,1000,7000,0,0]]){
 const a={...base,extraPaid,refundTotal,remaining}
 const draft=winterSettlementDraft(a)
 const saved=winterMasterSavedSettlement({id:'qa-saved',event_id:event.WINTER_EVENT_ID,organization_key:'org',account_version:'qa',payment_method:'cash_at_venue',confirmer_name:'確認者',created_at:'2026-11-14T00:00:00Z',account:a},'org')
 for(const paper of [draft,saved]){
  const summary=masterSettlementSummary(paper.document.document)
  assert.deepEqual(summary.charges.map(row=>row.label),order)
  assert.equal(summary.charges.at(-1).amount,Math.max(0,remaining))
  const overflow=summary.payments.find(row=>row.kind==='overpayment')
  assert.equal(overflow.amount,1000)
  assert.equal(overflow.value.includes('差引済み'),credit>0)
  assert.equal(summary.payments.find(row=>row.kind==='refundDue')?.amount??0,refundDue)
  assert.equal(summary.payments.find(row=>row.kind==='refund')?.amount??0,refundTotal)
  const text=template.masterConfirmationContent(paper)
  const sheet=strFromU8(unzipSync(masterStatementWorkbook(paper))['xl/worksheets/sheet1.xml'])
  for(const output of [text,sheet]){
   const positions=order.map(label=>output.indexOf(label))
   assert.ok(positions.every((position,i)=>position>=0&&(!i||positions[i-1]<position)))
   assert.match(output,/事前過入金・返金対象分/)
   assert.equal(output.includes('ご返金額（未返金）'),refundDue>0)
   assert.equal(output.includes('今回精算で差引済み'),credit>0)
  }
  assert.match(sheet,/<f>MAX\(0,F\d+-F\d+-F\d+(?:\+F\d+)?\)<\/f>/)
  const totalCells=[...sheet.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)].filter(([, ,s])=>s.includes('事前料金合計')||s.includes('請求総額'))
  assert.ok(totalCells.every(([, ,s])=>/<f>F\d+(?:\+F\d+)+<\/f>/.test(s)))
 }
}
assert.equal(JSON.stringify(base),original)
console.log('PASS: ordered charges, 1,000-yen advance credit, cash payment, unpaid refund and completed refund, saved reprints and Excel formulas')
