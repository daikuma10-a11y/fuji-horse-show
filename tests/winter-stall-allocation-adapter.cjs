require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {createStallPlan,defaultStallOptions}=require('../lib/master/stall-allocation.ts')
const {loadWinterStallPlan,saveWinterStallPlan}=require('../lib/winter-stall-allocation.ts')
const {WINTER_EVENT_ID}=require('../lib/winter-event.ts')
const groups=[{id:'g1',name:'架空クラブ',horses:[{id:'h1',name:'架空馬'}]}]
const plan=createStallPlan(groups,defaultStallOptions(groups),'2026-10-30T00:00:00Z')
const original=global.fetch
;(async()=>{
 let stored=null,posts=0,calls=0,lastInput,loseResponse=false,reject=false
 global.fetch=async(url,options)=>{
  calls++;assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Bearer test-token')
  if(options.method==='POST'){
   posts++;assert.ok(url.endsWith('/rpc/save_winter_stall_allocation'))
   lastInput=JSON.parse(options.body).p_input;assert.equal(lastInput.eventId,WINTER_EVENT_ID)
   if(reject)return {ok:false,status:409,json:async()=>({message:'別の端末で更新されています'})}
   stored={event_id:WINTER_EVENT_ID,request_id:lastInput.requestId,value:lastInput.value,confirmed_at:'2026-10-30T01:00:00Z'}
   if(loseResponse)throw new Error('response lost after commit')
   return {ok:true,json:async()=>lastInput.requestId}
  }
  const q=new URL(url).searchParams;assert.equal(q.get('event_id'),`eq.${WINTER_EVENT_ID}`);assert.equal(q.get('order'),'revision.desc')
  return {ok:true,json:async()=>stored?[stored]:[]}
 }
 await assert.rejects(()=>loadWinterStallPlan(''),/ログイン/);assert.equal(calls,0)
 assert.equal(await loadWinterStallPlan('test-token'),null)
 loseResponse=true
 const recovered=await saveWinterStallPlan(plan,null,'test-token')
 assert.equal(recovered.requestId,lastInput.requestId);assert.equal(posts,1)
 const retry=await saveWinterStallPlan(plan,null,'test-token')
 assert.equal(retry.requestId,recovered.requestId,'same snapshot/expected yields same retry key')
 stored={...stored,request_id:'e'.repeat(64)};reject=true
 await assert.rejects(()=>saveWinterStallPlan(plan,recovered.requestId,'test-token'),/別の端末/)
 assert.equal(stored.request_id,'e'.repeat(64),'newer saved version is preserved')
 stored={...stored,event_id:'00000000-0000-0000-0000-000000000000'}
 await assert.rejects(()=>loadWinterStallPlan('test-token'),/Winter/)
 global.fetch=async()=>({ok:false});await assert.rejects(()=>loadWinterStallPlan('test-token'),/取得できません/)
 console.log('PASS: authenticated event-scoped reads, lost-response recovery, stable retry ID, concurrent update rejection, wrong-event and failed-read guards')
})().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>{global.fetch=original})
