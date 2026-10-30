require('./register-ts.cjs')
const assert=require('node:assert/strict'),{JSDOM}=require(process.env.JSDOM_MODULE||'jsdom'),Module=require('node:module')
const dom=new JSDOM('<div id="root"></div>',{url:'https://winter.test/winter/confirm'})
for(const key of ['window','document','HTMLElement','HTMLInputElement','Event','MouseEvent','localStorage'])global[key]=key==='window'?dom.window:dom.window[key]
global.indexedDB=require(process.env.FHS_TEST_IDB_PATH||'fake-indexeddb').indexedDB
global.IS_REACT_ACT_ENVIRONMENT=true
Object.defineProperty(global,'navigator',{configurable:true,value:{userAgent:'test',serviceWorker:{controller:{postMessage({build},ports){ports[0].postMessage({ready:true,build});ports[0].close()}}}}})
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),original=Module.prototype.require
Module.prototype.require=function(name){return name==='next/link'?{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)}:original.call(this,name)}
const fixture=require('./winter-public-reception.cjs'),batch=require('../lib/winter-batch.ts'),offline=require('../lib/winter-offline.ts'),store=require('../lib/master/device-reception-store.ts'),Page=require('../app/winter/confirm/page.tsx').default
let fetches=0;global.fetch=async()=>{fetches++;throw Error('offline')}
const el=document.getElementById('root');let root
async function waitFor(test){for(let n=0;n<100&&!test();n++)await act(async()=>{await new Promise(r=>setTimeout(r,10))});assert.ok(test(),el.textContent)}
async function mount(){root=createRoot(el);await act(async()=>root.render(React.createElement(Page)));await waitFor(()=>el.textContent.includes('このiPadに受付内容を預かります'))}
;(async()=>{
 const p={id:offline.preparationId,revision:1,kind:'preparation',schema:1,eventId:fixture.data.eventId,eventName:'合成大会',retrievedAt:new Date().toISOString(),build:'a'.repeat(64),data:{...fixture.data,timetable:[]}}
 await store.writeDeviceRecord(p,null);batch.writeWinterQueue(localStorage,fixture.queue);await mount();assert.equal(el.querySelectorAll('input').length,1)
 await act(async()=>{const input=el.querySelector('input');Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(input,'合成来訪者');input.dispatchEvent(new Event('input',{bubbles:true}))})
 await act(async()=>el.querySelector('form').dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})))
 await waitFor(()=>el.textContent.includes('このiPadに受付内容を保存しました。'))
 assert.equal(el.querySelectorAll('input').length,0,'prior visitor removed');assert.equal(batch.readWinterQueue(localStorage).items.length,0);assert.equal(fetches,0)
 assert.match(el.textContent,/本部への送信待ち/);assert.match(el.textContent,/出番表への反映は本部確認後/)
 await act(async()=>root.unmount());await mount();assert.match(el.textContent,/未確定の申請はありません/);assert.ok(!el.textContent.includes('合成来訪者'));assert.equal((await offline.listOfflineReceipts()).length,1)
 // New independent receipt can be staged after reopen; old receipts stay in the admin-only store.
 await act(async()=>root.unmount());const q=structuredClone(fixture.queue);q.items=q.items.slice(0,1);q.items[0].input.id=crypto.randomUUID();batch.writeWinterQueue(localStorage,q);await mount();assert.equal(el.querySelector('input').value,'');assert.equal(fetches,0)
 await act(async()=>root.unmount());dom.window.close();console.log('PASS: prepared final screen accepts one visitor, saves offline, readback resets fields, remount hides old visitor and allows next receipt without network; DOM simulation, not iPad')
})().catch(e=>{console.error(e);process.exitCode=1})
