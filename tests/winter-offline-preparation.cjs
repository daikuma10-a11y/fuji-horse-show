// Real preparation/storage/auth adapters with synthetic HTTP and Worker transport.
require('./register-ts.cjs')
const assert=require('node:assert/strict'),{JSDOM}=require(process.env.JSDOM_MODULE||'jsdom')
const dom=new JSDOM('<div id="root"></div>',{url:'https://winter.test/winter/admin'})
for(const key of ['window','document','HTMLElement','Event','MouseEvent','StorageEvent','localStorage'])global[key]=key==='window'?dom.window:dom.window[key]
Object.defineProperty(window,'isSecureContext',{value:true})
global.indexedDB=require(process.env.FHS_TEST_IDB_PATH||'fake-indexeddb').indexedDB
global.IS_REACT_ACT_ENVIRONMENT=true
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client')
const fixture=require('./winter-public-reception.cjs'),batch=require('../lib/winter-batch.ts'),offline=require('../lib/winter-offline.ts')
const Panel=require('../components/winter-offline-preparation.tsx').WinterOfflinePreparation
let online=true,authAllowed=true,failData=false,authHold=null,assetHold=null,duringAssets=null
let authReads=0,dataReads=0,registerCalls=0,prepares=0,activates=0,activeBuild='',concurrent=0,maxConcurrent=0,sessionUpdates=0
const build='a'.repeat(64),active={state:'activated',addEventListener(){},removeEventListener(){}}
const serviceWorker={controller:{postMessage({type,build:requested},ports){void(async()=>{
 let result
 if(type==='PREPARE'){
  prepares++;concurrent++;maxConcurrent=Math.max(maxConcurrent,concurrent)
  if(assetHold)await assetHold.promise
  if(duringAssets){const fn=duringAssets;duringAssets=null;fn()}
  concurrent--;result={build,ready:true}
 }else if(type==='ACTIVATE'){activates++;activeBuild=requested;result={build:requested,ready:true}}
 else result={build:requested,ready:activeBuild===requested}
 ports[0].postMessage(result);ports[0].close()
 })()}},async register(script,options){registerCalls++;assert.equal(script,'/winter/sw.js');assert.equal(options.scope,'/winter');return{scope:'https://winter.test/winter',active}},async getRegistration(){return{scope:'https://winter.test/winter',active}}}
Object.defineProperty(global,'navigator',{configurable:true,value:{get onLine(){return online},serviceWorker}})
const session={email:'synthetic@example.invalid',accessToken:'synthetic-token',refreshToken:'synthetic-refresh',expiresAt:Date.now()+3600000}
global.fetch=async(url,options={})=>{
 assert.equal(options.method??'GET','GET','automatic preparation must never submit requests')
 const u=new URL(url)
 if(u.pathname==='/auth/v1/user'){
  authReads++;if(authHold)await authHold.promise
  return{ok:true,json:async()=>({email:session.email,app_metadata:{role:authAllowed?'admin':'visitor'}})}
 }
 dataReads++;assert.equal(u.searchParams.get('event_id'),'eq.'+fixture.data.eventId)
 if(failData)throw Error('synthetic connection failure')
 const rows={organizations:fixture.data.organizations,riders:fixture.data.riders,horses:fixture.data.horses,competitions:fixture.data.competitions,reception_entries:fixture.data.entries}[u.pathname.split('/').at(-1)]
 assert.ok(rows,'only Winter roster reads are allowed: '+u.pathname)
 return{ok:true,json:async()=>structuredClone(rows)}
}
const el=document.getElementById('root');let root,revision=0
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve:()=>resolve()}}
async function waitFor(test){for(let n=0;n<150&&!test();n++)await act(async()=>{await new Promise(r=>setTimeout(r,10))});assert.ok(test(),el.textContent)}
async function tick(){await act(async()=>{await new Promise(r=>setTimeout(r,25))})}
async function render(){await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Panel,{session:{...session},onSession:()=>sessionUpdates++,revision}))))}
async function mount(){root=createRoot(el);await render()}
async function unmount(){await act(async()=>root.unmount())}
const ready=()=>el.textContent.includes('オフライン受付の準備完了')
const snapshot=()=>offline.readPreparation()
const receipts=async()=>JSON.stringify(await offline.listOfflineReceipts())
;(async()=>{
 await mount();await waitFor(ready)
 assert.equal(prepares,1,'StrictMode and initial revision must coalesce')
 assert.equal(activates,1);assert.ok(authReads>0);assert.ok((await snapshot()).revision===1)
 assert.equal(el.querySelectorAll('button').length,0,'successful setup needs no preparation button')
 const oldCalls=prepares;await render();await tick();assert.equal(prepares,oldCalls,'token/parent render does not restart')
 revision++;await render();await waitFor(()=>ready()&&prepares===oldCalls+1)

 // Existing queued receipt remains byte-identical; an unsubmitted draft blocks
 // refresh but does not block repairing the Worker scope.
 const savedQueue=structuredClone(fixture.queue);savedQueue.items=savedQueue.items.slice(0,1);savedQueue.items[0].input.id='00000000-0000-4000-8000-000000000999'
 const frozen=batch.freezeWinterReception({...savedQueue,localOnly:true},'合成・保存済み')
 await offline.archiveReception(frozen,await snapshot())
 const savedBefore=await receipts(),pBefore=JSON.stringify(await snapshot())
 batch.writeWinterQueue(localStorage,fixture.queue);const raw=localStorage.getItem(batch.WINTER_QUEUE_KEY),regBefore=registerCalls,prepBefore=prepares
 revision++;await render();await waitFor(()=>el.textContent.includes('入力中の受付があるため'))
 assert.equal(registerCalls,regBefore+1);assert.equal(prepares,prepBefore);assert.equal(localStorage.getItem(batch.WINTER_QUEUE_KEY),raw)
 assert.equal(JSON.stringify(await snapshot()),pBefore);assert.equal(await receipts(),savedBefore)
 // Finish the same synthetic draft through the existing archive/reset path.
 const pending=batch.freezeWinterReception({...fixture.queue,localOnly:true},'合成・入力中')
 batch.writeWinterQueue(localStorage,pending);await offline.archiveReception(pending,await snapshot())
 await act(async()=>{await offline.recoverSealedInput()});await waitFor(ready)
 assert.equal((await offline.listOfflineReceipts()).length,2)
 const preserved=await receipts()

 online=false;const reads=authReads;revision++;await render();await waitFor(()=>el.textContent.includes('通信の復旧を待っています'))
 assert.equal(authReads,reads)
 online=true;await act(async()=>window.dispatchEvent(new Event('online')));await waitFor(ready)
 assert.equal(await receipts(),preserved)

 failData=true;const previous=JSON.stringify(await snapshot());revision++;await render();await waitFor(()=>!!el.querySelector('button'))
 assert.match(el.textContent,/synthetic connection failure/);assert.ok(!ready());assert.equal(JSON.stringify(await snapshot()),previous)
 const failures=authReads;await tick();assert.equal(authReads,failures,'failure does not retry in a loop')
 failData=false;await act(async()=>el.querySelector('button').click());await waitFor(ready)
 assert.equal(await receipts(),preserved)

 authAllowed=false;const forbidden=registerCalls;revision++;await render();await waitFor(()=>!!el.querySelector('button'))
 assert.match(el.textContent,/管理者権限/);assert.equal(registerCalls,forbidden,'unverified session never starts preparation')
 authAllowed=true;await act(async()=>el.querySelector('button').click());await waitFor(ready)

 // An input arriving while assets are downloading must preserve the old snapshot.
 const beforeLateInput=JSON.stringify(await snapshot())
 duringAssets=()=>batch.writeWinterQueue(localStorage,fixture.queue)
 revision++;await render();await waitFor(()=>el.textContent.includes('入力中の受付があるため'))
 assert.equal(JSON.stringify(await snapshot()),beforeLateInput);assert.equal(await receipts(),preserved)
 batch.writeWinterQueue(localStorage,batch.emptyWinterQueue())
 await act(async()=>window.dispatchEvent(new StorageEvent('storage',{key:batch.WINTER_QUEUE_KEY})));await waitFor(ready)

 // Changes during an in-flight preparation are coalesced, never concurrent.
 assetHold=deferred();const count=prepares;revision++;await render();await waitFor(()=>prepares===count+1)
 revision++;await render();revision++;await render();assert.equal(prepares,count+1)
 const release=assetHold;assetHold=null;await act(async()=>release.resolve());await waitFor(()=>ready()&&prepares===count+2)
 assert.equal(maxConcurrent,1)

 // Leaving/logging out before auth completes cannot restore an old session.
 await unmount();authHold=deferred();const updates=sessionUpdates,reg=registerCalls,auth=authReads
 await mount();await waitFor(()=>authReads>auth);await unmount()
 const releaseAuth=authHold;authHold=null;await act(async()=>releaseAuth.resolve());await tick()
 assert.equal(sessionUpdates,updates);assert.equal(registerCalls,reg)

 // Leaving during asset preparation stops before committing a new snapshot.
 assetHold=deferred();const beforeLeave=JSON.stringify(await snapshot()),acts=activates,started=prepares
 await mount();await waitFor(()=>prepares>started);await unmount()
 const releaseAssets=assetHold;assetHold=null;await act(async()=>releaseAssets.resolve());await tick()
 assert.equal(JSON.stringify(await snapshot()),beforeLeave);assert.equal(activates,acts)
 assert.equal(await receipts(),preserved)
 assert.ok((await offline.listOfflineReceipts()).every(r=>r.items.every(i=>i.status==='queued'&&i.attempts===0)))
 dom.window.close()
 console.log('PASS: automatic authorized mount, StrictMode coalescing, data-change refresh, pending input wait/resume, network recovery, visible failure/retry, auth rejection, late-input and logout guards, receipt/ID preservation, zero automatic submissions; DOM/transport simulation, not iPad')
})().catch(error=>{console.error(error);process.exitCode=1})
