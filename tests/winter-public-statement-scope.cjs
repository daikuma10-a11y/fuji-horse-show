require('./register-ts.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript'),{webcrypto}=require('node:crypto')
const {WINTER_EVENT_ID:event,WINTER_BANK_DETAILS:bank}=require('../lib/winter-event')
const {validateWinterStatementContext,winterScopedCheckoutStatement}=require('../lib/winter-statement-context')
const org='11111111-1111-4111-8111-111111111111',version='b'.repeat(64),token='a'.repeat(64)
const before='2026-11-14T01:00:00Z',paid='2026-11-14T07:00:00Z',after='2026-11-15T01:00:00Z'
const account={organization:{id:org,event_id:event,name:'検証団体'},bankDetails:bank,normalTotal:0,horseRegistration:{count:0,unitFee:14000,total:0},initialTotal:0,extraTotal:15000,adjustmentTotal:0,total:15000,advancePaid:0,extraPaid:8000,remaining:7000,adjustments:[],warnings:[],lines:[{id:'old',action:'追加',competitionLabel:'日曜競技',rider:'検証選手',horse:'検証馬',amount:8000},{id:'new',action:'追加',competitionLabel:'日曜競技',rider:'検証選手',horse:'検証馬',amount:7000,isOp:true}]}
const context={eventId:event,orgId:org,dates:['2026-11-15'],sources:[{id:'old',date:'2026-11-15',at:before},{id:'new',date:'2026-11-15',at:after}],payments:[{id:'pay',at:paid,amount:8000,method:'cash_at_venue',reversesId:null}],adjustments:[]}
const paper=winterScopedCheckoutStatement(account,context,{date:'2026-11-15',paymentId:'pay'},new Date(after),'bank_transfer')
assert.equal(paper.document.document.scope.total,7000);assert.equal(paper.document.document.bankDetails,bank);assert.equal(paper.document.document.method,'後日振込')
assert.throws(()=>validateWinterStatementContext({...context,orgId:'foreign'},account),/団体/)
assert.throws(()=>validateWinterStatementContext({...context,eventId:'autumn'},account),/Winter/)
assert.throws(()=>validateWinterStatementContext({...context,sources:[]},account),/履歴/)
assert.throws(()=>validateWinterStatementContext({...context,payments:[]},account),/入金/)
assert.throws(()=>validateWinterStatementContext({...context,sources:[context.sources[0],context.sources[0]]},account),/履歴/)
const sanitized=validateWinterStatementContext({...context,secret:'no',payments:[{...context.payments[0],note:'internal',created_by:'staff'}]},account)
assert.ok(!JSON.stringify(sanitized).includes('internal'));assert.ok(!JSON.stringify(sanitized).includes('secret'))
// Run the deployed Edge entrypoint against synthetic REST responses, including pagination and concurrent change.
const source=fs.readFileSync('supabase/functions/winter-self-settlement/index.ts','utf8'),proxyHash=source.match(/const PROXY_HASH='([a-f0-9]+)'/)[1]
let handler,calls=[],valid=true,mode='normal',snapshots=0
const crypto={getRandomValues:a=>webcrypto.getRandomValues(a),subtle:{digest:async(algorithm,bytes)=>new TextDecoder().decode(bytes)==='synthetic-secret'?Uint8Array.from(Buffer.from(proxyHash,'hex')).buffer:webcrypto.subtle.digest(algorithm,bytes)}}
const edgeFetch=async(url,options={})=>{
 calls.push({url,options});assert.equal(options.headers.Authorization,'Bearer synthetic-service')
 const u=new URL(url),table=u.pathname.split('/').at(-1)
 if(table==='fhs_winter_settlement_devices')return Response.json(valid?[{token_hash:'valid'}]:[])
 if(table==='get_winter_settlement_account'){assert.equal(JSON.parse(options.body).p_org,org);snapshots++;return Response.json({account,version:mode==='changed'&&snapshots===2?'c'.repeat(64):version})}
 assert.equal(options.method,undefined,'Scope metadata is read-only')
 assert.equal(u.searchParams.get('event_id'),'eq.'+event)
 if(table!=='competitions')assert.equal(u.searchParams.get(table==='reception_requests'?'organization_id':'organization_key'),'eq.'+org)
 const offset=Number(u.searchParams.get('offset'))
 if(table==='competitions')return Response.json([{id:'sun',competition_date:'2026-11-15'}])
 if(table==='reception_requests'){
  assert.equal(u.searchParams.get('status'),'eq.reflected')
  if(mode==='pages')return Response.json(Array.from({length:offset?1:500},(_,i)=>({id:'r'+(offset+i),target_competition_id:'sun',reflected_at:after})))
  return Response.json(context.sources.map(row=>({id:row.id,target_competition_id:'sun',reflected_at:row.at})))
 }
 if(table==='fhs_winter_settlement_only')return Response.json([])
 if(table==='fhs_winter_extra_payments')return Response.json([{id:'pay',created_at:paid,amount:8000,payment_method:'cash_at_venue',reverses_id:null}])
 if(table==='fhs_winter_charge_adjustments')return Response.json([])
 throw Error('Unexpected query '+url)
}
vm.runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{exports:{},Deno:{env:{get:n=>n==='SUPABASE_URL'?'https://db.test':'synthetic-service'},serve:h=>handler=h},crypto,TextEncoder,Request,Response,AbortSignal,URLSearchParams,Uint8Array,fetch:edgeFetch})
const req=body=>new Request('https://edge.test',{method:'POST',body:JSON.stringify(body)})
const args={proxySecret:'synthetic-secret',action:'statement-scope',token,org}
;(async()=>{
 assert.equal((await handler(req({...args,proxySecret:'bad'}))).status,401);assert.equal(calls.length,0)
 valid=false;assert.equal((await handler(req(args))).status,401);valid=true;calls=[];snapshots=0
 let response=await handler(req(args));assert.equal(response.status,200);const body=await response.json()
 assert.deepEqual(body.context,context);assert.equal(snapshots,2);assert.ok(!JSON.stringify(body).includes('synthetic-service'));assert.ok(!JSON.stringify(body).includes(token))
 validateWinterStatementContext(body.context,body.account)
 mode='changed';snapshots=0;response=await handler(req(args));assert.equal(response.status,409)
 mode='pages';snapshots=0;response=await handler(req(args));assert.equal(response.status,200);assert.equal((await response.json()).context.sources.length,501)
 // Actual Next route keeps cookie scope and validates metadata before returning anything.
 process.env.WINTER_SELF_SETTLEMENT_PROXY_SECRET='synthetic-secret';mode='normal'
 global.fetch=async(url,options)=>{const input=JSON.parse(options.body);assert.equal(input.action,'statement-scope');assert.equal(input.org,org);return Response.json({...body,context:mode==='foreign'?{...context,orgId:'foreign'}:{...context,secret:'hidden'}})}
 const {GET}=require('../app/api/winter-self-settlement/route')
 const {NextRequest}=require('next/server')
 const nextReq=()=>new NextRequest('https://winter.test/api/winter-self-settlement?'+new URLSearchParams({org,scope:'1'}),{headers:{cookie:'fhs-winter-self-settlement-device='+token}})
 response=await GET(nextReq());assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.ok(!JSON.stringify(await response.json()).includes('hidden'))
 mode='foreign';response=await GET(nextReq());assert.equal(response.status,409)
 console.log('PASS: public snapshot scope calculation, method/bank, context identity/coverage/payment checks, server auth and event/org isolation, pagination, concurrent-change rejection, sanitized no-store Next response')
})().catch(e=>{console.error(e);process.exitCode=1})
