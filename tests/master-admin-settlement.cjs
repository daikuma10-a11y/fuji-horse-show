const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server'),{execFileSync}=require('node:child_process')
const resolve=Module._resolveFilename;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)}
for(const ext of ['.ts','.tsx'])Module._extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f)
const master=require('../components/master/admin-settlement.tsx'),{formatYen}=require('../lib/fees.ts')
const old=execFileSync('git',['show','841c888:components/admin/settlement-panel.tsx'],{encoding:'utf8'}),current=fs.readFileSync('components/admin/settlement-panel.tsx','utf8')
function find(source,predicate){const tree=ts.createSourceFile('fixture.tsx',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);let result;function visit(n){if(predicate(n,n.getText(tree)))result=n.getText(tree);ts.forEachChild(n,visit)}visit(tree);assert.ok(result);return result}
const oldSummary=find(old,(n,t)=>ts.isJsxElement(n)&&t.startsWith('<div className="print-hide rounded-2xl border-2 border-border bg-card p-5 shadow-sm">'))
const newSummary=find(current,(n,t)=>ts.isJsxSelfClosingElement(n)&&t.startsWith('<MasterAdminSettlementSummary'))
const oldGroups=find(old,(n,t)=>ts.isReturnStatement(n)&&t.includes('<SelfSettlementHistory session={session}/>')&&t.includes('全団体 追加・変更分')).replace(/^return /,'')
const newGroups=find(current,(n,t)=>ts.isJsxSelfClosingElement(n)&&t.startsWith('<MasterAdminSettlementGroups'))
const noop=()=>{},env={...master,formatYen,selected:{orgId:'a',orgName:'テスト団体',normalEntry:30000,additional:8000,change:2000,competitionDiff:1000,total:41000},due:11000,printDocument:{advanceRecorded:true,advancePaid:30000,extraTotal:11000},manualPaid:0,paymentEditing:false,advance:{paid_amount:30000,note:'事前',updated_at:'2026-10-12T00:00:00Z'},paymentAmount:'30000',paymentNote:'メモ',error:'',saving:false,session:{},rows:[{orgId:'a',orgName:'テスト団体',additional:8000,change:2000,competitionDiff:1000},{orgId:'b',orgName:'別所属',additional:0,change:0,competitionDiff:0}],prepayments:[{organization_key:'a'}],grandTotal:41000,receptionTotal:11000,excludedLegacyCount:2,SelfSettlementHistory:()=>React.createElement('p',null,'履歴'),Cell:({label,value})=>React.createElement('div',null,React.createElement('dt',{className:'text-base font-semibold text-muted-foreground'},label),React.createElement('dd',{className:'mt-1 text-lg font-semibold text-foreground'},value))}
for(const key of ['setPaymentAmount','setPaymentNote','setPaymentEditing','setError','submitPrepayment','setSelectedOrgId'])env[key]=noop
function render(source,values=env){const file=path.resolve('fixture.tsx'),m=new Module(file,module);m.filename=file;m.paths=module.paths;m._compile(ts.transpileModule(`export function Fixture({${Object.keys(values).join(',')}}:any){return (${source})}`,{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX}}).outputText,file);return renderToStaticMarkup(React.createElement(m.exports.Fixture,values))}
assert.equal(render(newGroups),render(oldGroups),'Autumn groups preserve exact HTML')
for(const paymentEditing of [false,true])for(const due of [11000,-1000])for(const advancePaid of [0,20000,30000]){const values={...env,paymentEditing,due,printDocument:{...env.printDocument,advancePaid,advanceRecorded:advancePaid!==0}};assert.equal(render(newSummary,values),render(oldSummary,values),'Autumn summary/editor/details preserve exact HTML')}
const winter=renderToStaticMarkup(React.createElement(master.MasterAdminSettlementSummary,{name:'Winter',normalTotal:30000,advanceTarget:44000,advancePaid:30000,advanceRecorded:true,extraTotal:0,extraPaid:0,due:14000,summaryRows:[{label:'馬匹登録料',value:'¥14,000'}]}));assert.ok(winter.includes('一部入金済み'));assert.ok(!winter.includes('支払い済み ／'));assert.ok(winter.includes('馬匹登録料'))
// Exercise the actual Winter adapter and account calculation: an initial Excel
// entry must not look free merely because there are no reception surcharges.
const {winterSettlementAccount}=require('../lib/winter-settlement.ts'),{WINTER_EVENT_ID:eventId}=require('../lib/winter-event.ts')
const winterSource=fs.readFileSync('components/winter-settlement-panel.tsx','utf8')
const winterGroups=find(winterSource,(n,t)=>ts.isJsxSelfClosingElement(n)&&t.startsWith('<MasterAdminSettlementGroups'))
const data={eventId,organizations:[{id:'club',event_id:eventId,name:'合成団体'}],riders:[{id:'r',event_id:eventId,organization_id:'club',name:'合成選手'}],horses:[{id:'h',event_id:eventId,organization_id:'club',name:'合成馬',roster_source:'shared_roster',is_participant:true}],competitions:[{id:'c',event_id:eventId,competition_no:'1',name:'合成競技'}],entries:[]}
const ledger={initial:[7000,12000,12000].map((fee,i)=>({id:`entry-${i}`,event_id:eventId,entry_fee:fee,inputs:{organizationId:'club',competitionId:'c',riderId:'r',horseId:'h'}})),requests:[],advances:[]}
function groupView(account){return render(winterGroups,{...master,groupAccounts:[account],printing:false,paymentLocked:false,adjustmentLocked:false,onsiteLocked:false,advanceBusy:false,instructionBusy:false,setOrgId:noop})}
for(const paid of [0,20000,45000,46000]){
 const account=winterSettlementAccount(data,{...ledger,advances:paid?[{event_id:eventId,organization_key:'club',paid_amount:paid}]:[]},'club')
 assert.equal(account.extraTotal,0);assert.equal(account.total,45000)
 const markup=groupView(account),row=markup.match(/<button\b[^>]*>([\s\S]*?)<\/button>/)[1]
 assert.ok(row.includes('請求総額 ¥45,000'),'normal entries and horse registration remain visible when surcharges are zero')
 assert.ok(row.includes(`入金済（記録） ${formatYen(paid)}`))
 assert.match(row,new RegExp(`差引残額</span><span[^>]*>${formatYen(45000-paid)}</span>`))
 assert.equal(row.includes('返金・充当を確認'),paid>45000)
 assert.equal(row.includes('事前入金は未確認です'),paid===0)
 assert.ok(!markup.includes('全団体 追加・変更分'))
}
const withUnknown=winterSettlementAccount({...data,entries:[{entry_id:'uncovered',rider_id:'r'}]},ledger,'club')
assert.ok(groupView(withUnknown).includes('料金履歴を確認できない出番'),'unverified billing warnings remain visible in the list')
const source=JSON.stringify({data,ledger});groupView(winterSettlementAccount(data,ledger,'club'));assert.equal(JSON.stringify({data,ledger}),source,'rendering never changes ledger/payment data')
console.log('PASS: exact Autumn admin HTML; Winter initial Excel fees plus horse registration visible with zero surcharges, recorded payments, remaining balances and billing warnings')
