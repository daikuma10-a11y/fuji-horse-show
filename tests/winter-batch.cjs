const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
function load(relative,mocks={}){const file=path.resolve(relative),m=new Module(file,module);m.filename=file;m.paths=module.paths;m.require=name=>name in mocks?mocks[name]:require(Module._resolveFilename(name,m));m._compile(ts.transpileModule(fs.readFileSync(file,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,file);return m.exports}
const ev=load('lib/winter-event.ts'),api=load('lib/winter-reception.ts',{'./winter-event':ev}),ch=load('lib/winter-change.ts',{'./winter-event':ev,'./winter-reception':api}),batch=load('lib/winter-batch.ts',{'./winter-event':ev,'./winter-reception':api,'./winter-change':ch}),monitor=load('lib/winter-monitor.ts',{'./winter-event':ev,'./winter-reception':api})
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,row={event_id:ev.WINTER_EVENT_ID},org={...row,id:id(1),name:'団体'},rider={...row,id:id(2),name:'選手',organization_id:org.id,jef_member_no:'TEST'},horse={...row,id:id(3),name:'馬',organization_id:org.id,jef_registration_no:'TEST'}
const c=ev.winterCompetition('5'),competition={...row,id:id(4),competition_no:'5',competition_date:c.date,name:c.name,official:c.official,fee:c.fee,op_fee:c.opFee,member_fee:c.memberFee,nonmember_fee:c.nonmemberFee}
const input={id:id(5),organization:org,competition,rider,horse,visitorName:'担当',selection:{membership:'member'}}
let queue={...batch.emptyWinterQueue(),items:[{type:'add',input}]}
assert.equal(batch.winterBatchPayload(queue).p_expected_total,8000)
const storage={value:null,getItem(){return this.value},setItem(key,value){this.value=value}}
batch.writeWinterQueue(storage,queue);assert.deepEqual(batch.readWinterQueue(storage),queue)
assert.throws(()=>batch.writeWinterQueue({setItem(){throw Error('quota')}},queue),/保存できません/)
storage.value='garbled';assert.throws(()=>batch.readWinterQueue(storage),/消さず/)
assert.throws(()=>batch.validateWinterQueue({...queue,eventId:'Autumn'}),/未確定一覧/)
assert.throws(()=>batch.validateWinterQueue({...queue,items:[...queue.items,...queue.items]}),/受付番号/)
const other={type:'add',input:{...input,id:id(6),organization:{...org,id:id(7)},rider:{...rider,organization_id:id(7)},horse:{...horse,organization_id:id(7)}}}
assert.throws(()=>batch.validateWinterQueue({...queue,items:[...queue.items,other]}),/団体ごと/)
const entry={...row,entry_id:id(8),competition_id:competition.id,competition_no:'5',start_order:1,status:'active',rider_id:rider.id,horse_id:horse.id,organization_name:org.name,is_op:false}
const wd={type:'withdraw',id:id(9),entry,organizationId:org.id,organizationName:org.name,riderName:rider.name,horseName:horse.name,visitorName:'担当'}
assert.throws(()=>batch.validateWinterQueue({...queue,items:[wd,{...wd,id:id(10)}]}),/同じ出番/)
assert.deepEqual(monitor.moveWinterEntry(['a','b','c'],'c','a'),['c','a','b'])
assert.throws(()=>monitor.moveWinterEntry(['a'],'b','a'),/人馬/)
assert.deepEqual(monitor.winterOrderSnapshot([entry])[0],{entryId:entry.entry_id,startOrder:1,riderId:rider.id,horseId:horse.id,isOp:false})
;(async()=>{
 let mode='ok',bodies=[]
 global.fetch=async(url,options)=>{assert.ok(url.endsWith('/submit_winter_reception_batch'));assert.equal(options.headers.Authorization,'Bearer test');bodies.push(options.body);if(mode==='network')throw Error('offline');if(mode==='reject')return{ok:false,status:400,json:async()=>({message:'料金が更新されています'})};return{ok:true,json:async()=>({ids:mode==='wrong'?[id(99)]:[input.id],total:8000})}}
 assert.deepEqual(await batch.submitWinterBatch(queue,'test'),{ids:[input.id],total:8000})
 mode='network';await assert.rejects(()=>batch.submitWinterBatch(queue,'test'),/offline/)
 mode='ok';await batch.submitWinterBatch(queue,'test');assert.equal(new Set(bodies).size,1)
 mode='reject';await assert.rejects(()=>batch.submitWinterBatch(queue,'test'),batch.WinterBatchRejected)
 mode='wrong';await assert.rejects(()=>batch.submitWinterBatch(queue,'test'),/確定結果/)
 await assert.rejects(()=>batch.submitWinterBatch(queue,''),batch.WinterBatchRejected)
 console.log('PASS: mixed draft validation, membership price, persistence failures, corruption, event isolation, duplicate targets, stable network retries, definitive rejection, receipt verification and order movement')
})().catch(e=>{console.error(e);process.exitCode=1})
