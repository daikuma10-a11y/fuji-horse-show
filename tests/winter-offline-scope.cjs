// Regression for the iPad's offline confirm -> canonical /winter navigation.
require('./register-ts.cjs')
const assert=require('node:assert/strict')
const offline=require('../lib/winter-offline.ts'),batch=require('../lib/winter-batch.ts')
const fixture=require('./winter-public-reception.cjs')
const origin='https://winter.test',memory=new Map(),registrations=new Map()
let mode='active',registration,registerCalls=0,fetches=0
global.localStorage={getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,value)}
global.window={isSecureContext:true,localStorage,location:{origin},dispatchEvent(){}}
global.location=window.location
const container=new EventTarget()
container.controller={scriptURL:origin+'/winter/sw.js'} // Existing /winter/ controller.
container.ready=Promise.resolve({scope:origin+'/winter/',active:{state:'activated'}})
container.register=async(script,options)=>{
 assert.equal(script,'/winter/sw.js');assert.equal(options.updateViaCache,'none');registerCalls++
 const worker=new EventTarget();worker.state=mode==='active'?'activated':mode==='waiting'?'installed':'installing'
 worker.scriptURL=origin+script
 registration={scope:origin+options.scope,active:mode==='active'?worker:null,installing:mode==='delayed'?worker:null,waiting:mode==='waiting'?worker:null}
 registrations.set(registration.scope,registration)
 if(mode==='delayed')setImmediate(()=>{registration.installing=null;registration.active=worker;worker.state='activated';worker.dispatchEvent(new Event('statechange'))})
 return registration
}
container.getRegistration=async url=>[...registrations.values()].filter(r=>new URL(url,origin).href.startsWith(r.scope)).sort((a,b)=>b.scope.length-a.scope.length)[0]
Object.defineProperty(global,'navigator',{configurable:true,value:{serviceWorker:container}})
global.fetch=async()=>{fetches++;assert.equal(registration.active?.state,'activated','must wait for the new scope, not the old ready promise');throw Error('fixture stops before loading any live data')}
;(async()=>{
 await assert.rejects(()=>offline.prepareReception(),/fixture stops/)
 for(const path of ['/winter','/winter/add','/winter/change','/winter/withdraw','/winter/confirm']){
  assert.ok((origin+path).startsWith(registration.scope),`offline scope misses ${path}`)
 }
 assert.ok(!(origin+'/').startsWith(registration.scope),'Autumn root stays out of scope')
 const config=(await import('../next.config.mjs')).default
 const headers=(await config.headers()).find(row=>row.source==='/winter/sw.js')?.headers
 assert.equal(headers?.find(row=>row.key==='Service-Worker-Allowed')?.value,'/winter')
 // An existing draft must not prevent the scope repair, nor be changed by it.
 batch.writeWinterQueue(localStorage,fixture.queue)
 memory.set('unrelated-saved-receipt-marker','keep')
 const before=[...memory],calls=registerCalls,network=fetches
 await assert.rejects(()=>offline.prepareReception(),/入力中の受付/)
 assert.equal(registerCalls,calls+1);assert.deepEqual([...memory],before);assert.equal(fetches,network)
 batch.writeWinterQueue(localStorage,batch.emptyWinterQueue())
 mode='delayed';await assert.rejects(()=>offline.prepareReception(),/fixture stops/)
 mode='waiting';await assert.rejects(()=>offline.prepareReception(),/待機中/)
 console.log('PASS: canonical Winter home and all reception routes in scope, limited allowed header, activation wait despite legacy ready, existing draft preserved during repair, waiting update rejected; registration simulation, not iPad')
})().catch(error=>{console.error(error);process.exitCode=1})
