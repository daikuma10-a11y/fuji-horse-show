require('./register-ts.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
function load(file,mocks={}){const full=path.resolve(file),m=new Module(full,module);m.filename=full;m.paths=module.paths;m.require=n=>n in mocks?mocks[n]:require(Module._resolveFilename(n,m));m._compile(ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true}}).outputText,full);return m.exports}
const event=load('lib/winter-event.ts'),ev=event.WINTER_EVENT_ID,org='11111111-1111-4111-8111-111111111111',user='22222222-2222-4222-8222-222222222222',session={accessToken:'admin'}
const api=load('lib/winter-settlement.ts',{'./winter-event':event,'./winter-display-order':load('lib/winter-display-order.ts'),'./winter-reception':{loadWinterRequests:async()=>[]},'./supabase-rest':{verifyAdminSession:async s=>s}})
let stored=null,mode='normal',writes=0
const response=(data,status=200)=>({ok:status<400,status,json:async()=>data})
global.fetch=async(url,options={})=>{const u=new URL(url)
 if(u.pathname.endsWith('/user'))return response({id:user,app_metadata:{role:mode==='nonadmin'?'user':'admin'}})
 if(u.pathname.endsWith('/organizations')){assert.equal(u.searchParams.get('event_id'),`eq.${ev}`);return response([{id:org}])}
 assert(u.pathname.endsWith('/settlement_payment_instructions'),'must never modify a payment/advance table')
 if(options.method){writes++;assert.equal(options.headers.Prefer,'return=representation');const body=JSON.parse(options.body);assert.equal(body.event_id,ev);assert.equal(body.organization_key,org);assert.equal(body.updated_by,user)
 if(options.method==='PATCH'){assert.equal(u.searchParams.get('event_id'),`eq.${ev}`);assert.equal(u.searchParams.get('organization_key'),`eq.${org}`);assert.equal(u.searchParams.get('updated_at'),`eq.${stored.updated_at}`);assert(new Date(body.updated_at)>new Date(stored.updated_at))}else{assert.equal(options.method,'POST');assert(!u.searchParams.has('on_conflict'))}
 if(mode==='conflict')return response([]);if(mode==='duplicate')return response({},409);stored={...body,updated_at:body.updated_at.replace('Z','+00:00')};return response([stored])}
 assert.equal(u.searchParams.get('event_id'),`eq.${ev}`);return response(stored?[mode==='changed'?{...stored,bank_details:'別の変更'}:stored]:[])
}
;(async()=>{
 const bank=await api.saveWinterPaymentInstruction(session,org,'bank_transfer',' 検証銀行\n普通123 ',null);assert.equal(bank.saved.bank_details,'検証銀行\n普通123');assert.equal(writes,1)
 const cash=await api.saveWinterPaymentInstruction(session,org,'cash_at_venue','前の銀行口座',bank.saved);assert.equal(cash.saved.bank_details,'');assert.equal(cash.saved.payment_method,'cash_at_venue')
 mode='conflict';await assert.rejects(api.saveWinterPaymentInstruction(session,org,'cash_at_venue','',cash.saved),/変更/)
 mode='duplicate';await assert.rejects(api.saveWinterPaymentInstruction(session,org,'cash_at_venue','',null),/別の操作/)
 mode='changed';await assert.rejects(api.saveWinterPaymentInstruction(session,org,'bank_transfer','確認銀行',stored),/保存後/)
 mode='nonadmin';const before=writes;await assert.rejects(api.saveWinterPaymentInstruction(session,org,'cash_at_venue','',null),/権限/);assert.equal(writes,before)
 await assert.rejects(api.saveWinterPaymentInstruction(session,org,'bank_transfer',' ',null),/振込先/)
 await assert.rejects(api.saveWinterPaymentInstruction(session,org,'bank_transfer','a'.repeat(2001),null),/振込先/)
 await assert.rejects(api.saveWinterPaymentInstruction(session,org,'cash_at_venue','',{...stored,event_id:'autumn'}),/Winter/)
 const data={eventId:ev,organizations:[{id:org,event_id:ev,name:'団体'}],competitions:[],riders:[],horses:[],entries:[]},ledger={initial:[],requests:[],advances:[],instructions:[{...stored,event_id:ev}]}
 const account=api.winterSettlementAccount(data,ledger,org);assert.equal(account.instruction.payment_method,'bank_transfer');assert.equal(account.remaining,0);assert.equal(account.advancePaid,0)
 assert.throws(()=>api.winterSettlementAccount(data,{...ledger,instructions:[{...stored,event_id:'autumn'}]},org),/Winter/)
 console.log('PASS: payment plan POST/CAS update/read-back, duplicate/conflict/changed read/nonadmin rejection, cash clears bank, Winter isolation; no payment receipt or balance mutation')
})().catch(e=>{console.error(e);process.exitCode=1})
