// Install fake-indexeddb@6.2.4 for this test; no participant data is used.
require('./register-ts.cjs')
const assert=require('node:assert/strict')
const idb=require(process.env.FHS_TEST_IDB_PATH||'fake-indexeddb');Object.assign(global,{indexedDB:idb.indexedDB,IDBKeyRange:idb.IDBKeyRange})
const {WINTER_EVENT_ID:ev,winterCompetition}=require('../lib/winter-event.ts'),batch=require('../lib/winter-batch.ts'),offline=require('../lib/winter-offline.ts'),store=require('../lib/master/device-reception-store.ts'),sync=require('../lib/winter-offline-sync.ts')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const organizations=[1,2,3].map(n=>({id:id(n),event_id:ev,name:'合成クラブ'+n}))
const riders=organizations.flatMap((o,n)=>[0,1].map(k=>({id:id(10+n*2+k),event_id:ev,name:'合成選手'+n+k,organization_id:o.id,jef_member_no:'TEST',is_participant:true,roster_source:'manual'})))
const horses=organizations.map((o,n)=>({id:id(20+n),event_id:ev,name:'合成馬'+n,organization_id:o.id,jef_registration_no:'TEST',is_participant:true,roster_source:'manual'}))
const competitions=['1','2'].map((no,n)=>{const c=winterCompetition(no);return {id:id(30+n),event_id:ev,name:c.name,competition_no:no,competition_date:c.date,official:c.official,fee:c.fee,op_fee:c.opFee,member_fee:c.memberFee,nonmember_fee:c.nonmemberFee}})
const entries=organizations.map((o,n)=>({entry_id:id(40+n),event_id:ev,competition_id:competitions[0].id,competition_no:'1',start_order:n+1,status:'active',rider_id:riders[n*2].id,horse_id:horses[n].id,organization_id:o.id,organization_name:o.name,is_op:false}))
const data={eventId:ev,organizations,riders,horses,competitions,entries,timetable:[]}
const target=(n,ident)=>({id:id(ident),organization:organizations[n],competition:competitions[0],rider:riders[n*2],horse:horses[n],visitorName:'',selection:{isOp:false},masterForm:true,note:''})
const drafts=[{type:'add',input:target(0,100)},{type:'change',input:{original:entries[1],from:competitions[0],fromSelection:{isOp:false},target:{...target(1,101),rider:riders[3]}}},{type:'withdraw',id:id(102),entry:entries[2],organizationId:organizations[2].id,organizationName:organizations[2].name,riderName:riders[4].name,horseName:horses[2].name,visitorName:''}]
const memory=new Map;global.localStorage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};global.window={localStorage,dispatchEvent(){}}
const prep={id:offline.preparationId,revision:1,kind:'preparation',schema:1,eventId:ev,eventName:'合成大会',retrievedAt:new Date().toISOString(),build:'a'.repeat(64),data}
let server=[],posts=0,mode='ok',lookupOffline=false
const rowFor=(receipt,item)=>{const s=batch.winterDraftSummary(item.draft);return {id:s.id,event_id:ev,original_entry_id:s.originalId,fee_amount:s.total,status:'pending',payload:{offlineReception:sync.offlineStamp(receipt.id,item)}}}
global.fetch=async(url,options={})=>{
 if(lookupOffline)throw Error('offline')
 if(String(url).includes('/rpc/list_winter_reception_requests'))return {ok:true,json:async()=>server}
 if(String(url).includes('/rpc/submit_winter_offline_item')){
  posts++;const body=JSON.parse(options.body),r=await store.readDeviceRecord(body.p_receipt_id),i=r.items.find(i=>batch.winterDraftSummary(i.draft).id===body.p_item.args.p_id)
  assert.equal(i.status,'unknown','unknown persisted before network');assert.equal(i.locked,true)
  if(mode==='reject')return {ok:false,status:400,json:async()=>({message:'料金が変わりました'})}
  if(mode!=='lostBefore'&&!server.some(s=>s.id===body.p_item.args.p_id))server.push(rowFor(r,i))
  if(mode.startsWith('lost'))throw Error('network lost')
  return {ok:true,json:async()=>({receiptId:r.id,ids:[body.p_item.args.p_id],total:body.p_expected_total})}
 }
 const table=new URL(url).pathname.split('/').at(-1),rows={organizations,riders,horses,competitions,reception_entries:entries}[table];assert.ok(rows,table);return {ok:true,json:async()=>structuredClone(rows)}
}
;(async()=>{
 offline.assertSnapshot(prep);await store.writeDeviceRecord(prep,null)
 const receipts=[]
 for(let n=0;n<3;n++){
  const q=batch.freezeWinterReception({...batch.emptyWinterQueue(),localOnly:true,receiptId:id(200+n),items:[drafts[n]]},'合成来訪者'+n)
  batch.writeWinterQueue(localStorage,q);const r=await offline.archiveReception(q,prep);receipts.push(r)
  // Simulated process restart at the precise archive/reset boundary; persistent IDB readback is real fake-indexeddb, not a stubbed store.
  await offline.recoverSealedInput();assert.equal(batch.readWinterQueue(localStorage).items.length,0)
  assert.equal((await store.readDeviceRecord(r.id)).items[0].status,'queued')
  assert.equal((await offline.archiveReception(q,prep)).id,r.id,'retry keeps receipt id')
 }
 assert.equal((await offline.listOfflineReceipts()).length,3);assert.equal(posts,0,'archive/reopen never posts')
 assert.equal(batch.readWinterQueue(localStorage).items.length,0,'next club has empty input')
 const saved=await store.readDeviceRecord(receipts[0].id)
 await assert.rejects(()=>store.writeDeviceRecord({...saved,revision:saved.revision+1},null),/別画面/)
 // Quota/write failure leaves active visitor and prior receipts intact.
 const put=idb.IDBObjectStore.prototype.put;idb.IDBObjectStore.prototype.put=function(){throw new DOMException('quota','QuotaExceededError')}
 const bad=batch.freezeWinterReception({...batch.emptyWinterQueue(),localOnly:true,receiptId:id(299),items:[{type:'add',input:target(0,199)}]},'保存失敗試験');batch.writeWinterQueue(localStorage,bad)
 await assert.rejects(()=>offline.archiveReception(bad,prep),/保存できません/);idb.IDBObjectStore.prototype.put=put
 assert.equal(batch.readWinterQueue(localStorage).receiptId,id(299));assert.equal((await offline.listOfflineReceipts()).length,3)
 batch.writeWinterQueue(localStorage,batch.emptyWinterQueue())
 // Response lost AFTER commit; exact ID/stamp readback establishes success without another POST.
 mode='lostAfter';await sync.sendOfflineItem(receipts[0].id,0,'dummy');assert.equal((await store.readDeviceRecord(receipts[0].id)).items[0].status,'unknown')
 const before=posts;await sync.reviewOfflineReceipts('dummy');assert.equal(posts,before);assert.equal((await store.readDeviceRecord(receipts[0].id)).items[0].status,'sent');assert.equal(server.length,1)
 // Loss BEFORE commit remains locked across reads; an independent club still proceeds.
 mode='lostBefore';await sync.sendOfflineItem(receipts[1].id,0,'dummy');let second=await store.readDeviceRecord(receipts[1].id);assert.equal(second.items[0].locked,true)
 mode='ok';await sync.sendOfflineItem(receipts[2].id,0,'dummy');assert.equal((await store.readDeviceRecord(receipts[2].id)).items[0].status,'sent')
 await sync.sendOfflineItem(receipts[1].id,0,'dummy');second=await store.readDeviceRecord(receipts[1].id);assert.equal(second.items[0].status,'sent');assert.equal(server.length,3);assert.equal(new Set(server.map(r=>r.id)).size,3)
 assert.equal(server.reduce((s,r)=>s+r.fee_amount,0),batch.winterDraftSummary(drafts[0]).total+batch.winterDraftSummary(drafts[1]).total)
 // Context changes and duplicate local targets flag only affected items.
 const base=structuredClone(receipts[1]),other=structuredClone(receipts[2]);base.items[0].status='queued';base.items[0].locked=false
 const changed=structuredClone(data);changed.entries[1].rider_id=riders[0].id
 assert.equal(sync.inspectOfflineItem(base.id,base.items[0],changed,[],[base]).status,'review')
 const dup=structuredClone(base);dup.id=id(500);dup.items[0].draft.input.target.id=id(501)
 assert.match(sync.inspectOfflineItem(base.id,base.items[0],data,[],[base,dup]).message,/複数/)
 assert.equal(sync.inspectOfflineItem(other.id,other.items[0],data,[],[base,dup,other]).status,'queued')
 // Missing server response is never equated with rejection; unavailability preserves all local receipts.
 lookupOffline=true;await assert.rejects(()=>sync.reviewOfflineReceipts('dummy'),/offline/);assert.equal((await offline.listOfflineReceipts()).length,3);lookupOffline=false
 const corrupt=structuredClone(prep);corrupt.data.eventId='autumn';assert.throws(()=>offline.assertSnapshot(corrupt))
 console.log('PASS: 3 clubs/add/change/withdraw, durable archive/readback/reset, restart boundary, quota failure, CAS, no automatic upload, lost-before/lost-after response, exact IDs and fees, independent progress, changed target/duplicate conflicts, event isolation')
})().catch(e=>{console.error(e);process.exitCode=1})
