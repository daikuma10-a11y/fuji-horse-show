const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f)
const batch=require('../lib/winter-batch.ts'),ev=require('../lib/winter-event.ts'),api=require('../lib/winter-reception.ts')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,row={event_id:ev.WINTER_EVENT_ID}
const org={...row,id:id(1),name:'合成受付クラブ'},rider={...row,id:id(2),name:'合成選手',organization_id:org.id,jef_member_no:'TEST'},horse={...row,id:id(3),name:'合成馬',organization_id:org.id,jef_registration_no:'TEST'}
const c=ev.winterCompetition('1'),competition={...row,id:id(4),competition_no:'1',competition_date:c.date,name:c.name,official:c.official,fee:c.fee,op_fee:c.opFee,member_fee:c.memberFee,nonmember_fee:c.nonmemberFee}
const add={id:id(5),organization:org,competition,rider,horse,visitorName:'',selection:{},masterForm:true,note:''}
const entry={...row,entry_id:id(6),competition_id:competition.id,competition_no:'1',start_order:1,status:'active',rider_id:rider.id,horse_id:horse.id,organization_id:org.id,is_op:false}
const change={original:entry,from:competition,fromSelection:{},target:{...add,id:id(7),rider:{...rider,id:id(8)}}}
const withdraw={type:'withdraw',id:id(9),entry:{...entry,entry_id:id(10)},organizationId:org.id,organizationName:org.name,riderName:rider.name,horseName:horse.name,visitorName:''}
const queue={...batch.emptyWinterQueue(),items:[{type:'add',input:add},{type:'change',input:change},withdraw]}
module.exports={queue,org,rider,horse,competition,entry,data:{eventId:ev.WINTER_EVENT_ID,organizations:[org],riders:[rider,change.target.rider],horses:[horse],competitions:[competition],entries:[entry,withdraw.entry]}}
if(require.main===module)(async()=>{
 assert.equal(batch.validateWinterQueue(queue),queue)
 assert.throws(()=>batch.validateWinterQueue(queue,'meeting'),/お名前/)
 assert.throws(()=>batch.winterBatchPayload(queue),/お名前/)
 assert.throws(()=>api.reviewWinterAdd(add),/担当者/)
 assert.throws(()=>batch.freezeWinterReception(queue,'  '),/お名前/)
 const frozen=batch.freezeWinterReception(queue,'  受付来訪者  ')
 assert.equal(frozen.visitorName,'受付来訪者');assert.equal(frozen.attempted,true)
 assert.deepEqual(frozen.items.map(batch.winterDraftSummary).map(x=>x.visitorName),Array(3).fill('受付来訪者'))
 assert.deepEqual(queue.items.map(batch.winterDraftSummary).map(x=>x.visitorName),['','',''])
 assert.equal(batch.freezeWinterReception(frozen,'別名'),frozen)
 assert.throws(()=>batch.validateWinterQueue({...frozen,visitorName:'別名'}),/一致/)
 const storage={value:null,getItem(){return this.value},setItem(k,v){this.value=v}}
 batch.writeWinterQueue(storage,frozen);assert.deepEqual(batch.readWinterQueue(storage),frozen)
 const payload=batch.winterBatchPayload(frozen),ids=payload.p_items.map(x=>x.args.p_id)
 assert.deepEqual(ids,[id(5),id(7),id(9)])
 let mode='offline',bodies=[]
 global.fetch=async(url,options)=>{
   assert.equal(url,'/api/winter-reception');assert.ok(!options.headers?.Authorization)
   if(options.method!=='POST')return {ok:true,json:async()=>({ready:true})}
   bodies.push(options.body)
   if(mode==='offline')throw new Error('offline')
   if(mode==='uncertain')return {ok:false,status:409,json:async()=>({error:'timeout',uncertain:true})}
   if(mode==='rejected')return {ok:false,status:409,json:async()=>({error:'料金差分',uncertain:false})}
   return {ok:true,json:async()=>({ids:mode==='wrong'?[id(99)]:ids,total:payload.p_expected_total})}
 }
 await assert.rejects(()=>batch.submitWinterPublicReception(frozen),e=>!(e instanceof batch.WinterBatchRejected)&&e.message==='offline')
 mode='uncertain';await assert.rejects(()=>batch.submitWinterPublicReception(frozen),e=>!(e instanceof batch.WinterBatchRejected))
 mode='ok';assert.deepEqual(await batch.submitWinterPublicReception(frozen),{ids,total:payload.p_expected_total});assert.equal(new Set(bodies).size,1)
 mode='rejected';await assert.rejects(()=>batch.submitWinterPublicReception(frozen),batch.WinterBatchRejected)
 mode='wrong';await assert.rejects(()=>batch.submitWinterPublicReception(frozen),/確定結果/)
 // Already attempted old queues keep their per-row names/IDs and use retry-only server acknowledgement.
 const legacy={...frozen};delete legacy.visitorName
 assert.equal(batch.freezeWinterReception(legacy,'新しい名前'),legacy)
 mode='ok';await batch.submitWinterPublicReception(legacy);assert.equal(JSON.parse(bodies.at(-1)).visitorName,null)
 console.log('PASS: name deferred for all three types, final name binding, strict meeting/direct writes, old queues, immutable retries, public endpoint, uncertainty and receipt validation')
})().catch(e=>{console.error(e);process.exitCode=1})
