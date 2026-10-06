const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),Module=require('node:module'),ts=require('typescript')
if(fs.existsSync('.env.local'))process.loadEnvFile('.env.local')
const cache=new Map()
function load(file,mocks={}){file=path.resolve(file);const key=file+Object.keys(mocks).join(',');if(cache.has(key))return cache.get(key).exports;const mod=new Module(file,module);mod.paths=module.paths;cache.set(key,mod);mod.require=name=>{
 if(name in mocks)return mocks[name]
 if(name.startsWith('.')||name.startsWith('@/')){const base=name.startsWith('@/')?path.resolve(name.slice(2)):path.resolve(path.dirname(file),name);for(const ext of ['','.ts','.tsx','.json']){const p=base+ext;if(fs.existsSync(p)&&fs.statSync(p).isFile())return ext==='.json'?require(p):load(p,mocks)}}
 return require(name)
};mod._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2020}}).outputText,file);return mod.exports}
const {selfSettlementAccount,selfSettlementOrganizations}=load('lib/self-settlement-account.ts')
const fixture={organizations:[{id:'org-1',name:'テスト団体'}],players:[{id:'p',name:'選手',orgId:'org-1'}],horses:[{id:'h',name:'馬',orgId:'org-1'}],competitions:[{id:'comp',number:1,name:'競技',entryFee:5000}],startEntries:[{id:'11111111-1111-4111-8111-111111111111',competitionId:'comp',playerId:'p',horseId:'h',organizationId:'org-1'}],requests:[{id:'r',orgId:'org-1',type:'add',status:'reflected',officialEntryId:'11111111-1111-4111-8111-111111111111',fee:{addBase:3000,addEntry:5000,changeBase:0,competitionDiff:0,total:8000},add:{competitionId:'comp',playerId:'p',horseId:'h'}}],feeOverrides:[],prepayments:[],manualRecords:[],receipts:[],paymentInstructions:[]}
const initial=selfSettlementAccount(fixture,'org-1')
assert.equal(initial.document.extraTotal,8000);assert.equal(initial.document.due,8000)
fixture.feeOverrides=[{source_type:'add',source_id:'r',corrected_fee:4000}]
fixture.manualRecords=[{id:'m',request_id:'r',organization_key:'org-1',competition_key:'comp',rider_key:'p',horse_key:'h',paid_amount:1000,period:'at_venue'}]
fixture.receipts=[{organization_key:'org-1',selected_items:[{key:'request:r',amount:2000}]}]
const corrected=selfSettlementAccount(fixture,'org-1')
assert.equal(corrected.document.extraTotal,7000);assert.equal(corrected.document.extraPaid,3000);assert.equal(corrected.document.due,4000);assert.equal(corrected.document.lines[0].paid,3000)
fixture.requests.push({...fixture.requests[0],id:'pending',status:'pending'})
assert.ok(selfSettlementAccount(fixture,'org-1').warnings.some(w=>w.includes('未反映')))
fixture.requests.pop()
fixture.prepayments=[{organization_key:'org-1',paid_amount:99999}]
assert.ok(selfSettlementAccount(fixture,'org-1').warnings.some(w=>w.includes('過入金')))
const {NextRequest}=require('next/server')
let proxyCalls=[];const stable={document:{...corrected.document,due:4000},normalLines:[],warnings:[]}
const route=load('app/api/self-settlement/route.ts',{'@/lib/self-settlement-server':{CHECKOUT_COOKIE:'device',accountVersion:()=> 'v1',checkoutProxy:async(action,token,input)=>{proxyCalls.push({action,token,input});if(action==='data')return{};if(action==='history')return[];if(action==='confirm')return {id:input.input.p_id,document:input.input.p_document};if(action==='setup'||action==='public-setup')return {token:'a'.repeat(64)}}},'@/lib/self-settlement-data':{checkoutData:async()=>({...fixture,financialVersion:'fp'})},'@/lib/self-settlement-account':{selfSettlementAccount:()=>stable,selfSettlementOrganizations:()=>[{id:'org-1',name:'テスト団体'}]},'@/lib/supabase-rest':{signInAdmin:async()=>({accessToken:'admin'})}})
const request=(body,cookie=true,origin='https://fhsfix.vercel.app')=>new NextRequest('https://fhsfix.vercel.app/api/self-settlement',{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(cookie?{Cookie:'device=test-device'}:{})},body:JSON.stringify(body)})
async function main(){
 const visitor=await route.GET(new NextRequest('https://fhsfix.vercel.app/api/self-settlement'));assert.equal(visitor.status,200);assert.ok(visitor.headers.get('set-cookie')?.includes('HttpOnly'));assert.ok(proxyCalls.some(c=>c.action==='public-setup'))
 const confirm={action:'confirm',org:'org-1',name:'担当者',method:'bank_transfer',version:'v1',id:'11111111-1111-4111-8111-111111111111',amount:1,document:{due:1}}
 assert.equal((await route.POST(request(confirm,false))).status,401)
 assert.equal((await route.POST(request(confirm,true,'https://other.example'))).status,403)
 assert.equal((await route.POST(request({...confirm,version:'old'}))).status,409)
 let response=await route.POST(request(confirm));assert.equal(response.status,200)
 const call=proxyCalls.find(c=>c.action==='confirm');assert.equal(call.input.input.p_document.document.due,4000);assert.equal(call.input.input.p_method,'bank_transfer');assert.equal(call.input.input.p_financial_version,'fp');assert.equal(proxyCalls.some(c=>c.action==='paid'),false)
 response=await route.POST(request({action:'setup',email:'staff@example.test',password:'sample'}));assert.equal(response.status,200);assert.match(response.headers.get('set-cookie'),/HttpOnly/);assert.match(response.headers.get('set-cookie'),/SameSite=strict/i);assert.equal(JSON.stringify(await response.json()).includes('token'),false)
 if(!process.env.CHECKOUT_TEST_DEVICE){console.log('PASS: settlement calculation and API authorization/version/idempotency checks (live verification skipped: no test device).');return}
 const server=load('lib/self-settlement-server.ts'),data=load('lib/self-settlement-data.ts')
 const live=await data.checkoutData(server.checkoutProxy('data',process.env.CHECKOUT_TEST_DEVICE))
 const organizations=selfSettlementOrganizations(live)
 let total=0,blocked=0
 for(const org of organizations){const account=selfSettlementAccount(live,org.id);assert.equal(account.document.due,account.document.normalTotal+account.document.extraTotal-account.document.advancePaid-account.document.extraPaid);assert.equal(account.document.extraTotal,account.document.lines.reduce((sum,line)=>sum+line.amount,0));assert.equal(account.document.normalTotal,account.normalLines.reduce((sum,line)=>sum+line.amount,0));if(account.warnings.length)blocked++;total++}
 console.log(`PASS: fee corrections, prior payments, receipt allocations, pending/refund blocks; unauthenticated/CSRF/version rejection, server-calculated amounts, HTTP-only setup; ${total} live organizations reconciled (${blocked} need staff review).`)
}
module.exports={load}
if(require.main===module)main().catch(error=>{console.error(error);process.exitCode=1})
