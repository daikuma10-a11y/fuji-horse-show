const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
function load(file,mocks={}){const full=path.resolve(file),m=new Module(full,module);m.filename=full;m.paths=module.paths;m.require=n=>n in mocks?mocks[n]:require(Module._resolveFilename(n,m));m._compile(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2020}}).outputText,full);return m.exports}
const event=load('lib/winter-event.ts'),order=load('lib/winter-display-order.ts'),ev=event.WINTER_EVENT_ID,org='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222'
const session={accessToken:'admin'},api=load('lib/winter-settlement.ts',{'./winter-event':event,'./winter-display-order':order,'./winter-reception':{loadWinterRequests:async()=>[]},'./supabase-rest':{verifyAdminSession:async s=>s}})
const data={eventId:ev,organizations:[{id:org,event_id:ev,name:'テスト団体'}],competitions:[{id:'c',competition_no:'1',name:'競技',event_id:ev,fee:999999}],riders:[{id:'r',organization_id:org,name:'選手',event_id:ev}],horses:[{id:'h',name:'馬',event_id:ev}],entries:[{entry_id:'i',rider_id:'r',event_id:ev}],timetable:[]}
const initial={id:'i',event_id:ev,entry_fee:5000,inputs:{organizationId:org,competitionId:'c',riderId:'r',horseId:'h'}}
const request=(id,type,status,fee)=>({id,event_id:ev,entry_id:'i',organization_id:org,target_competition_id:'c',rider_id:'r',horse_id:'h',request_type:type,status,fee_amount:fee,payload:{}})
const ledger={initial:[initial],requests:[request('a','add','reflected',13000),request('b','change','reflected',2000),request('w','withdraw','reflected',0),request('p','add','pending',13000),request('x','add','cancelled',13000)],advances:[]}
let account=api.winterSettlementAccount(data,ledger,org)
assert.equal(account.normalTotal,5000);assert.equal(account.extraTotal,15000);assert.equal(account.remaining,20000);assert.equal(account.lines.length,3);assert.equal(account.pending,1)
assert(account.warnings.some(x=>x.includes('未反映')));assert(account.warnings.some(x=>x.includes('未確認')))
const advance={event_id:ev,organization_key:org,paid_amount:5000,note:'確認済み',updated_at:'2026-10-11T00:00:00Z',updated_by:user}
account=api.winterSettlementAccount(data,{...ledger,advances:[advance]},org);assert.equal(account.remaining,15000)
assert.throws(()=>api.winterSettlementAccount(data,{...ledger,initial:[{...initial,event_id:'autumn'}]},org),/Winter/)
assert.throws(()=>api.winterSettlementAccount(data,{...ledger,requests:[request('bad','withdraw','reflected',1)]},org),/棄権/)
assert.throws(()=>api.winterSettlementAccount(data,{...ledger,requests:[request('bad','add','reflected',NaN)]},org),/金額/)
assert(api.winterSettlementAccount({...data,entries:[{entry_id:'unknown',rider_id:'r'}]},ledger,org).warnings.some(x=>x.includes('料金履歴')))
const horseOrg='horse-club',multiData={...data,organizations:[...data.organizations,{id:horseOrg,event_id:ev,name:'馬所属'}]},multiLedger={initial:[{...initial,inputs:{...initial.inputs,organizationId:horseOrg,billingOrganizationId:org}}],requests:[],advances:[]}
assert.equal(api.winterSettlementAccount(multiData,multiLedger,org).normalTotal,5000)
assert.equal(api.winterSettlementAccount(multiData,multiLedger,horseOrg).normalTotal,0)
assert.throws(()=>api.winterSettlementAccount(multiData,{...multiLedger,initial:[{...initial,inputs:{...initial.inputs,billingOrganizationId:'unknown'}}]},org),/団体/)
let stored=null,mode='normal',writes=0
const response=(body,ok=true,status=200)=>({ok,status,json:async()=>body})
global.fetch=async(url,options={})=>{const u=new URL(url);if(u.pathname.endsWith('/user'))return response({id:user,app_metadata:{role:'admin'}});if(u.pathname.endsWith('/organizations')){assert.equal(u.searchParams.get('event_id'),`eq.${ev}`);return response([{id:org}])}
 if(options.method==='POST'||options.method==='PATCH'){writes++;const body=JSON.parse(options.body);assert.equal(body.event_id,ev);assert.equal(body.organization_key,org);if(options.method==='PATCH'){assert.equal(u.searchParams.get('event_id'),`eq.${ev}`);assert.equal(u.searchParams.get('updated_at'),`eq.${stored.updated_at}`)}if(mode==='conflict')return response([]);stored=body;return response([stored])}
 assert.equal(u.searchParams.get('event_id'),`eq.${ev}`);return response(u.pathname.endsWith('/fhs_winter_initial_entries')?[initial]:stored?[stored]:[])
}
;(async()=>{
 const result=await api.saveWinterAdvance(session,org,5000,' 確認済み ',null);assert.equal(result.saved.note,'確認済み');assert.equal(writes,1)
 await api.saveWinterAdvance(session,org,4000,'訂正',result.saved);assert.equal(stored.paid_amount,4000)
 mode='conflict';await assert.rejects(api.saveWinterAdvance(session,org,3000,'訂正',stored),/変更/)
 await assert.rejects(api.saveWinterAdvance(session,org,1.5,'',null),/入金/)
 const loaded=await api.loadWinterSettlement('admin');assert.equal(loaded.initial.length,1)
 global.fetch=async()=>response([{...initial,event_id:'autumn'}]);await assert.rejects(api.loadWinterSettlement('admin'),/Winter/)
 console.log('PASS: saved initial fees, reflected-only requests, no withdrawal refunds, pending/cancelled exclusions, advance totals, unknown-entry warning, event isolation, absolute save/read-back and optimistic conflict rejection')
})().catch(e=>{console.error(e);process.exitCode=1})
