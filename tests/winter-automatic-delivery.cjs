// Actual route, IndexedDB delivery engine and React reconnect/foreground lifecycle.
require('./register-ts.cjs')
const assert=require('node:assert/strict'),{JSDOM}=require(process.env.JSDOM_MODULE||'jsdom')
const dom=new JSDOM('<div id="root"></div>',{url:'https://winter.test/winter',pretendToBeVisual:true})
for(const k of ['window','document','HTMLElement','Event','localStorage'])global[k]=dom.window[k]
Object.defineProperty(global,'navigator',{configurable:true,value:dom.window.navigator})
global.indexedDB=require(process.env.FHS_TEST_IDB_PATH||'fake-indexeddb').indexedDB
global.IS_REACT_ACT_ENVIRONMENT=true
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),{NextRequest}=require('next/server')
const fixture=require('./winter-public-reception.cjs'),batch=require('../lib/winter-batch.ts'),offline=require('../lib/winter-offline.ts'),store=require('../lib/master/device-reception-store.ts'),delivery=require('../lib/winter-automatic-delivery.ts')
const {POST}=require('../app/api/winter-reception/offline/route.ts'),{WinterAutomaticDelivery}=require('../components/winter-automatic-delivery.tsx')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,token='1'.repeat(64),origin='https://winter.test'
const data={...fixture.data,timetable:[]},prep={id:offline.preparationId,revision:1,kind:'preparation',schema:1,eventId:data.eventId,eventName:'合成大会',retrievedAt:new Date().toISOString(),build:'a'.repeat(64),data}
let online=true,hidden=false,mode='ok',calls=[],server=new Map(),ready=0
Object.defineProperty(navigator,'onLine',{get:()=>online});Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden})
const post=(body,headers={})=>new NextRequest(origin+'/api/winter-reception/offline',{method:'POST',headers:{Origin:origin,Cookie:`fhs-winter-reception-device=${token}`,...headers},body:JSON.stringify(body)})
async function archive(n,drafts=fixture.queue.items){const q=batch.freezeWinterReception({...batch.emptyWinterQueue(),receiptId:id(n),localOnly:true,items:structuredClone(drafts)},'合成来訪者');const r=await offline.archiveReception(q,prep);return r}
global.fetch=async(url,options={})=>{
 if(!online)throw Error('offline')
 if(url==='/api/winter-reception'){ready++;return Response.json({ready:true})}
 if(url==='/api/winter-reception/offline'){
  assert.ok(!options.headers.Authorization,'no administrator credentials');const b=JSON.parse(options.body),r=await store.readDeviceRecord(b.receiptId),i=r.items.find(i=>batch.winterDraftSummary(i.draft).id===b.source.item.args.p_id)
  assert.equal(i.locked,true);assert.equal(i.status,'unknown','persisted before request')
  return POST(post(b))
 }
 assert.match(url,/functions\/v1\/winter-self-settlement$/)
 const b=JSON.parse(options.body);assert.equal(b.action,'reception-offline');assert.equal(b.proxySecret,'synthetic-secret');assert.equal(b.token,token);calls.push(b)
 const key=b.source.item.args.p_id,prior=server.get(key)
 if(prior){assert.deepEqual(prior.source,b.source,'exact immutable retry');assert.equal(prior.receiptId,b.receiptId)}
 if(mode==='lostBefore')throw Error('lost before commit')
 if(!prior)server.set(key,{receiptId:b.receiptId,source:b.source,status:b.source.item.type==='change'?'review':'registered'})
 if(mode==='lostAfter')throw Error('lost after commit')
 const saved=server.get(key)
 return Response.json({receiptId:b.receiptId,requestId:mode==='wrong'?id(999):key,total:b.source.total,status:saved.status,receivedAt:'2026-10-31T12:00:00Z'})
}
async function waitFor(test){for(let i=0;i<200&&!await test();i++)await act(async()=>{await new Promise(r=>setTimeout(r,10))});assert.ok(await test(),document.body.textContent)}
;(async()=>{
 process.env.WINTER_SELF_SETTLEMENT_PROXY_SECRET='synthetic-secret'
 await store.writeDeviceRecord(prep,null)
 batch.writeWinterQueue(localStorage,fixture.queue);const draftRaw=localStorage.getItem(require('../lib/winter-event.ts').winterStorageKey('reception-queue'))
 await delivery.deliverWinterReceipts();assert.equal(ready,0,'unfinished queue never uploads')
 const receipt=await archive(200),one=receipt.items[0],p=offline.itemPayload(one),body={receiptId:receipt.id,source:{draft:one.draft,item:p.p_items[0],context:one.context,total:p.p_expected_total}}
 const before=calls.length
 for(const req of [post(body,{Origin:'https://foreign.test'}),post(body,{Cookie:''}),post({...body,source:{...body.source,total:1}}),post({...body,receiptId:'bad'}),post({...body,source:{...body.source,item:{...body.source.item,type:'reflect'}}})])assert.ok((await POST(req)).status>=400)
 assert.equal(calls.length,before,'invalid requests never reach proxy')
 mode='lostAfter';const a=delivery.deliverWinterReceipts(),b=delivery.deliverWinterReceipts();assert.equal(a,b,'coalesced sends');await assert.rejects(()=>a)
 assert.equal(server.size,3,'independent finalized items all reach HQ');assert.equal(calls.length,3)
 assert.ok((await store.readDeviceRecord(receipt.id)).items.every(i=>!i.handoff&&i.locked))
 mode='wrong';await assert.rejects(()=>delivery.deliverWinterReceipts());assert.ok((await store.readDeviceRecord(receipt.id)).items.every(i=>!i.handoff),'wrong ack cannot mark delivered')
 mode='ok';await delivery.deliverWinterReceipts();const saved=await store.readDeviceRecord(receipt.id)
 assert.deepEqual(saved.items.map(i=>i.handoff.status),['registered','review','registered']);assert.deepEqual(saved.items.map(i=>i.draft),receipt.items.map(i=>i.draft));assert.deepEqual(saved.items.map(i=>i.context),receipt.items.map(i=>i.context))
 const sent=calls.length;await delivery.deliverWinterReceipts();assert.equal(calls.length,sent,'HQ review no longer requires device retry')
 assert.deepEqual(batch.readWinterQueue(localStorage),fixture.queue,'unfinished visitor content preserved')
 // Actual mounted component: offline archive, reconnect, sleep, foreground.
 const fresh=structuredClone(fixture.queue.items[0]);fresh.input.id=id(401);online=false;await archive(400,[fresh])
 const root=createRoot(document.getElementById('root'));await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(WinterAutomaticDelivery))))
 await waitFor(()=>document.body.textContent.includes('1件'));assert.equal(calls.length,sent);assert.ok(!document.body.textContent.includes('合成来訪者'))
 online=true;await act(async()=>window.dispatchEvent(new Event('online')));await waitFor(async()=>(await store.readDeviceRecord(id(400))).items[0].handoff);assert.equal(server.size,4)
 hidden=true;fresh.input.id=id(501);await archive(500,[fresh]);await act(async()=>window.dispatchEvent(new Event('winter-queue-changed')));await act(async()=>new Promise(r=>setTimeout(r,30)));assert.equal(server.size,4,'sleep does not promise background upload')
 mode='lostBefore';hidden=false;await act(async()=>document.dispatchEvent(new Event('visibilitychange')));await waitFor(()=>document.body.textContent.includes('自動再確認'));assert.equal(server.size,4)
 mode='ok';await act(async()=>window.dispatchEvent(new Event('online')));await waitFor(async()=>(await store.readDeviceRecord(id(500))).items[0].handoff);assert.equal(server.size,5)
 assert.deepEqual(batch.readWinterQueue(localStorage),fixture.queue)
 await act(async()=>root.unmount());dom.window.close()
 console.log('PASS: same-origin/cookie/bound payload, finalized-only auto-delivery, actual IndexedDB CAS/readback, three types, lost-before/after exact retry, coalescing, invalid ack, review handoff, reconnect/foreground, no admin credential/reflection/payment; simulated device/HTTP')
})().catch(e=>{console.error(e);process.exitCode=1})
