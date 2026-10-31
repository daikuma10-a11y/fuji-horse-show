require('./register-ts.cjs')
const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
const {NextRequest}=require('next/server')
const file=path.resolve('app/api/winter-reception/route.ts'),m=new Module(file,module);m.filename=file;m.paths=module.paths;m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,file)
const {GET,POST}=m.exports,token='1'.repeat(64),origin='https://winter.example.test',cookie='fhs-winter-reception-device'
const body={p_items:[{type:'withdraw',args:{p_id:'00000000-0000-4000-8000-000000000001',p_entry_id:'00000000-0000-4000-8000-000000000002',p_visitor_name:'来訪者'}}],p_expected_total:0,visitorName:'来訪者'}
const post=(value=body,headers={})=>new NextRequest(origin+'/api/winter-reception',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:`${cookie}=${token}`,...headers},body:JSON.stringify(value)})
;(async()=>{
 process.env.WINTER_SELF_SETTLEMENT_PROXY_SECRET='synthetic-server-secret'
 let calls=[],mode='ok'
 global.fetch=async(url,options)=>{assert.equal(url,'https://mhgyhyxagkkwdiepifdp.supabase.co/functions/v1/winter-self-settlement');const b=JSON.parse(options.body);assert.equal(b.proxySecret,'synthetic-server-secret');calls.push(b);if(b.action==='public-setup')return Response.json({token});if(b.action==='reception-ready')return mode==='expired'?Response.json({error:'expired'},{status:401}):Response.json({ready:true});if(mode==='network')throw Error('offline');if(mode==='reject')return Response.json({error:'料金不一致',uncertain:false},{status:409});return Response.json({ids:mode==='wrong'?[]:body.p_items.map(x=>x.args.p_id),total:0})}
 let response=await GET(new NextRequest(origin+'/api/winter-reception'));assert.equal(response.status,200);assert.deepEqual(await response.json(),{ready:true});const set=response.headers.get('set-cookie');assert.match(set,/HttpOnly/);assert.match(set,/SameSite=strict/i);assert.match(set,/Path=\/api\/winter-reception/);assert.ok(!set.includes('synthetic-server-secret'))
 mode='expired';response=await GET(new NextRequest(origin+'/api/winter-reception',{headers:{Cookie:`${cookie}=${token}`}}));assert.equal(response.status,200);assert.equal(calls.at(-1).action,'public-setup')
 mode='ok';const before=calls.length
 for(const request of [post(body,{Origin:'https://foreign.test'}),post(body,{Cookie:''}),post({...body,visitorName:'別名'}),post({...body,p_items:[{...body.p_items[0],type:'reflect'}]}),post({...body,p_items:[...body.p_items,...body.p_items]})]){response=await POST(request);assert.ok(response.status>=400&&response.status<500);assert.equal((await response.json()).uncertain,false)}
 assert.equal(calls.length,before)
 response=await POST(post());assert.equal(response.status,200);assert.equal(calls.at(-1).action,'reception-confirm');assert.equal(calls.at(-1).name,'来訪者')
 mode='reject';response=await POST(post());assert.equal(response.status,409);assert.equal((await response.json()).uncertain,false)
 mode='network';response=await POST(post());assert.equal(response.status,503);assert.equal((await response.json()).uncertain,true)
 mode='wrong';response=await POST(post());assert.equal(response.status,503);assert.equal((await response.json()).uncertain,true)
 delete process.env.WINTER_SELF_SETTLEMENT_PROXY_SECRET
 console.log('PASS: same-origin device cookie, no secret exposure, expired-session renewal, action/name/duplicate validation, exact acknowledgement and network uncertainty')
})().catch(e=>{console.error(e);process.exitCode=1})
