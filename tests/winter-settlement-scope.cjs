require('./register-ts.cjs')
const assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {unzipSync,strFromU8}=require('fflate')
const {WINTER_EVENT_ID:ev}=require('../lib/winter-event')
const {winterSettlementAccount}=require('../lib/winter-settlement')
const {winterScopedStatement,winterStatementPayments}=require('../lib/winter-settlement-scope')
const {defaultStatementDate}=require('../lib/master/settlement-scope')
const {masterConfirmationContent}=require('../lib/master/settlement-print')
const {masterStatementWorkbook}=require('../lib/settlement-document')
const {MasterStatementScope}=require('../components/master/settlement-scope')
const before='2026-11-14T01:00:00Z',paid='2026-11-14T07:00:00Z',after='2026-11-15T01:00:00Z'
const data={eventId:ev,organizations:[{id:'a',name:'検証団体<script>',event_id:ev},{id:'b',name:'別団体',event_id:ev}],
 competitions:[{id:'sat',competition_no:'5',competition_date:'2026-11-14',name:'土曜競技',event_id:ev},{id:'sun',competition_no:'16',competition_date:'2026-11-15',name:'日曜競技',event_id:ev}],
 riders:[{id:'r',organization_id:'a',name:'検証選手',event_id:ev}],horses:[{id:'h',name:'検証馬',event_id:ev}],entries:[]}
const request=(id,comp,amount,reflected_at,extra={})=>({id,event_id:ev,request_type:'add',status:'reflected',organization_id:'a',target_competition_id:comp,rider_id:'r',horse_id:'h',fee_amount:amount,created_at:before,reflected_at,payload:{add:{isOp:true}},...extra})
const payment={id:'p',event_id:ev,organization_key:'a',amount:8000,payment_method:'cash_at_venue',created_at:paid,note:'確認済み',reverses_id:null}
const ledger={initial:[],requests:[request('old','sun',8000,before),request('new','sun',7000,after),request('sat-new','sat',2000,after),request('other','sun',7000,after,{organization_id:'b'}),request('pending','sun',7000,null,{status:'pending'})],advances:[{event_id:ev,organization_key:'a',paid_amount:0}],payments:[payment],adjustments:[],onsite:[]}
const scope={date:'2026-11-15',paymentId:'p'},unchanged=JSON.stringify({data,ledger})
const get=(l=ledger,s=scope)=>winterScopedStatement(data,l,'a',s,new Date(after))
let record=get(),doc=record.document.document
assert.deepEqual(doc.lines.map(line=>line.key),['new'])
assert.equal(doc.scope.total,7000);assert.equal(doc.due,9000);assert.match(doc.lines[0].note,/OP/)
assert.match(doc.notice,/2026\/11\/15/);assert.match(doc.notice,/8,000円/)
assert.equal(get(ledger,{date:'',paymentId:'p'}).document.document.scope.total,9000)
assert.equal(get(ledger,{date:'2026-11-15',paymentId:''}).document.document.scope.total,15000)
assert.equal(JSON.stringify({data,ledger}),unchanged,'No charge, payment or entry is mutated')
assert.equal(defaultStatementDate(['2026-11-13','2026-11-14','2026-11-15'],new Date('2026-11-14T10:00:00Z')),'2026-11-15')
assert.equal(defaultStatementDate(['2026-11-13','2026-11-14','2026-11-15'],new Date('2026-11-14T16:00:00Z')),'2026-11-15','JST next-day boundary')
assert.equal(get({...ledger,requests:ledger.requests.filter(row=>row.id!=='new')}).document.document.lines.length,0)
assert.throws(()=>get({...ledger,requests:[request('bad','sun',7000,null)]}),/反映日時/)
assert.throws(()=>get(ledger,{date:'2027-01-01',paymentId:'p'}),/競技日/)
assert.throws(()=>winterScopedStatement({...data,eventId:'autumn'},ledger,'a',scope),/Winter/)
assert.throws(()=>get(ledger,{date:'',paymentId:'unknown'}),/入金/)
const cancelled={...ledger,payments:[payment,{...payment,id:'undo',reverses_id:'p',created_at:after}]}
assert.equal(winterStatementPayments(winterSettlementAccount(data,cancelled,'a')).length,0)
assert.throws(()=>get(cancelled),/入金/)
// A changed competition uses its destination date. Pending submissions do not become charges.
const moved=get({...ledger,requests:[...ledger.requests,request('move','sun',2000,after,{request_type:'change',payload:{before:{competitionId:'sat',riderId:'r',horseId:'h'},change:{toIsOp:true}}})]})
assert.equal(moved.document.document.scope.total,9000);assert.match(moved.document.document.lines.find(x=>x.key==='move').competition,/土曜競技.*日曜競技/)
// A paid entry corrected later contributes only the correction. A new entry uses its corrected price.
const adjustment={id:'adj',sequence:1,event_id:ev,organization_key:'a',delta:-3000,reason:'検証訂正',previous_id:null,before_total:17000,after_total:14000,created_at:after,statement_items:[{lineId:'old',delta:-2000,note:'料金訂正'},{lineId:'new',delta:-1000,note:'OP料金訂正'}]}
const adjusted=get({...ledger,adjustments:[adjustment]})
assert.equal(adjusted.document.document.scope.total,4000)
assert.deepEqual(adjusted.document.document.lines.map(x=>x.amount),[6000,-2000])
assert.equal(get({...ledger,adjustments:[adjustment]},{date:'',paymentId:''}).document.document.scope.total,14000)
const unassigned={...adjustment,delta:-1000,after_total:16000,statement_items:undefined}
const unassignedDoc=get({...ledger,adjustments:[unassigned]})
assert.equal(unassignedDoc.document.document.scope.total,7000);assert.ok(unassignedDoc.document.warnings.some(x=>x.includes('競技日を特定できない')))
assert.equal(get({...ledger,adjustments:[unassigned]},{date:'',paymentId:'p'}).document.document.scope.total,8000)
// Settlement-only runs and their dated reversals remain signed, without touching the start list.
const run={id:'run',event_id:ev,organization_key:'a',action_type:'add',inputs:{organizationId:'a',competitionId:'sun',riderId:'r',horseId:'h',isOp:true},entry_fee:4000,fee_amount:7000,note:'現場追加',created_at:before,reverses_id:null}
const reversal=get({...ledger,onsite:[run,{...run,id:'undo-run',created_at:after,reverses_id:'run'}]})
assert.equal(reversal.document.document.scope.total,0);assert.equal(reversal.document.document.lines.find(x=>x.key==='undo-run').amount,-7000)
// HTML and real XLSX share the extract and its total, with full-club balance separately labelled.
const html=masterConfirmationContent(record),sheet=strFromU8(unzipSync(masterStatementWorkbook(record))['xl/worksheets/sheet1.xml'])
for(const output of [html,sheet]){assert.match(output,/対象明細合計/);assert.match(output,/団体全体のお支払い残額/);assert.ok(!output.includes('事前料金合計'));assert.ok(!output.includes('土曜競技'));assert.ok(!output.includes('<script>'));assert.match(output,/OP参加/)}
assert.match(sheet,/<f>SUM\(F\d+:F\d+\)<\/f><v>7000<\/v>/);assert.ok(!sheet.includes('undefined'));assert.ok(!sheet.includes('MAX('))
let chosen,previews=0,prints=0,excels=0
const props={dates:['2026-11-14','2026-11-15'],payments:winterStatementPayments(winterSettlementAccount(data,ledger,'a')),scope,record,busy:false,error:'',onScope:x=>chosen=x,onPreview:()=>previews++,onPrint:()=>prints++,onExcel:()=>excels++}
const tree=MasterStatementScope(props)
const walk=n=>n&&typeof n==='object'?[n,...React.Children.toArray(n.props?.children).flatMap(walk)]:[]
const nodes=walk(tree),selects=nodes.filter(n=>n.type==='select')
selects[0].props.onChange({target:{value:'2026-11-14'}});assert.deepEqual(chosen,{date:'2026-11-14',paymentId:'p'})
selects[1].props.onChange({target:{value:''}});assert.deepEqual(chosen,{date:'2026-11-15',paymentId:''})
nodes.filter(n=>n.type==='button').forEach(n=>n.props.onClick());assert.deepEqual([previews,prints,excels],[1,1,1])
const markup=renderToStaticMarkup(React.createElement(MasterStatementScope,props));assert.match(markup,/2026\/11\/15/);assert.match(markup,/この明細を印刷/)
assert.match(renderToStaticMarkup(React.createElement(MasterStatementScope,{...props,record:get({...ledger,requests:[request('old','sun',8000,before)]})})),/まだありません/)
console.log('PASS: date and payment cutoff, reflection vs submission, cross-club isolation, OP, late corrections, independent corrections, onsite reversals, no mutation, HTML/XLSX totals and shared scope controls')

// Exercise the actual Winter controller: fresh reads, auth errors, double clicks, print and selection reset.
const rest=require('../lib/supabase-rest'),loadData=require('../lib/winter-data'),settlement=require('../lib/winter-settlement'),excel=require('../lib/settlement-document')
const originals=[React.useState,React.useRef,React.useEffect,rest.verifyAdminSession,loadData.loadWinterData,settlement.loadWinterSettlement,excel.downloadMasterStatement]
let state=[],cursor=0,effects=[],verifications=0,reads=0,opened=0,printed=0,exported=null,fail=false,release
React.useState=initial=>{const i=cursor++;if(!(i in state))state[i]=typeof initial==='function'?initial():initial;return[state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}]}
React.useRef=initial=>{const i=cursor++;if(!(i in state))state[i]={current:initial};return state[i]}
React.useEffect=fn=>{const i=cursor++;if(!(i in state)){state[i]=true;effects.push(fn())}}
rest.verifyAdminSession=async()=>{verifications++;if(fail)throw Error('ログインを確認してください');return {accessToken:'verified'}}
loadData.loadWinterData=async()=>{reads++;return data}
settlement.loadWinterSettlement=async token=>{assert.equal(token,'verified');reads++;return ledger}
excel.downloadMasterStatement=row=>{exported=row}
const popup={opener:{},closed:false,document:{write:()=>{},close:()=>{},fonts:{ready:new Promise(resolve=>release=resolve)}},focus:()=>{},print:()=>printed++,close:()=>{popup.closed=true}}
global.window={open:()=>{opened++;return popup}}
const {WinterStatementScope}=require('../components/winter-settlement-scope')
const render=()=>{cursor=0;return WinterStatementScope({session:{accessToken:'old'},account:winterSettlementAccount(data,ledger,'a'),dates:['2026-11-14','2026-11-15'],disabled:false,onSession:()=>{}})}
const flush=()=>new Promise(resolve=>setImmediate(resolve))
;(async()=>{
 let view=render();view.props.onScope(scope);view=render();view.props.onPreview();view.props.onPreview();await flush();view=render()
 assert.equal(verifications,1);assert.equal(reads,2);assert.equal(view.props.record.document.document.scope.total,7000)
 view.props.onExcel();assert.equal(exported.document.document.scope.total,7000)
 view.props.onPrint();view.props.onPrint();assert.equal(opened,1);assert.equal(popup.opener,null);release();await flush();assert.equal(printed,1)
 view=render();view.props.onScope({date:'2026-11-14',paymentId:'p'});view=render();assert.equal(view.props.record,null)
 fail=true;view.props.onPreview();await flush();view=render();assert.match(view.props.error,/ログイン/);assert.equal(view.props.record,null);assert.equal(reads,2)
 assert.equal(JSON.stringify({data,ledger}),unchanged)
 console.log('PASS: Winter controller fresh authorized reads, no duplicate previews or prints, Excel snapshot, reset on filter change, login failure blocks stale output')
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{
 effects.forEach(cleanup=>cleanup?.());[React.useState,React.useRef,React.useEffect,rest.verifyAdminSession,loadData.loadWinterData,settlement.loadWinterSettlement,excel.downloadMasterStatement]=originals;delete global.window
})
