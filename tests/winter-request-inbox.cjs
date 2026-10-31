// Real dashboard, inbox, request list, auth, storage and sync; synthetic HTTP only.
require('./register-ts.cjs')
const assert=require('node:assert/strict'),{JSDOM}=require(process.env.JSDOM_MODULE||'jsdom'),Module=require('node:module')
const dom=new JSDOM('<div id="root"></div>',{url:'https://winter.test/winter/admin#winter-offline-reception',pretendToBeVisual:true})
for(const key of ['window','document','HTMLElement','HTMLInputElement','Event','MouseEvent','localStorage','sessionStorage'])global[key]=key==='window'?dom.window:dom.window[key]
global.indexedDB=require(process.env.FHS_TEST_IDB_PATH||'fake-indexeddb').indexedDB
global.IS_REACT_ACT_ENVIRONMENT=true
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),original=Module.prototype.require
const blanks=['app-header','shared-roster-manager','winter-master-registration','winter-meeting-panel','winter-export-panel','winter-settlement-actions','winter-initial-entry-registration','winter-start-list','winter-timetable','winter-settlement-panel','winter-application-import','winter-registration-overview','winter-stable-information','winter-offline-preparation']
Module.prototype.require=function(name){
 if(name==='next/link')return{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)}
 if(name==='@/lib/winter-live')return{subscribeWinterUpdates:()=>()=>{}}
 if(blanks.some(n=>name==='@/components/'+n))return new Proxy({},{get:()=>()=>null})
 return original.call(this,name)
}
const fixture=require('./winter-public-reception.cjs'),batch=require('../lib/winter-batch.ts'),offline=require('../lib/winter-offline.ts'),sync=require('../lib/winter-offline-sync.ts'),store=require('../lib/master/device-reception-store.ts'),event=require('../lib/winter-event.ts')
const Dashboard=require('../components/winter-admin-dashboard.tsx').WinterAdminDashboard
const session={email:'synthetic@example.invalid',accessToken:'synthetic-token',refreshToken:'synthetic-refresh',expiresAt:Date.now()+3600000}
sessionStorage.setItem(event.winterStorageKey('admin-session'),JSON.stringify(session))
let server=[],submissions=[],allowSubmit=false,failData=true,authAllowed=true,authHold=null,authReads=0,listReads=0,hidden=false,loseId=fixture.queue.items[0].input.id
Object.defineProperty(document,'hidden',{configurable:true,get:()=>hidden})
const data={...fixture.data,timetable:[]},prep={id:offline.preparationId,revision:1,kind:'preparation',schema:1,eventId:data.eventId,eventName:'合成大会',retrievedAt:new Date().toISOString(),build:'a'.repeat(64),data}
function rowFor(receipt,item){
 const d=item.draft,s=batch.winterDraftSummary(d),target=d.type==='add'?d.input:d.type==='change'?d.input.target:null,entry=d.type==='change'?d.input.original:d.type==='withdraw'?d.entry:null
 return {id:s.id,event_id:data.eventId,request_type:d.type,organization_id:s.organizationId,original_entry_id:s.originalId,entry_id:null,target_competition_id:target?.competition.id??entry.competition_id,rider_id:target?.rider.id??entry.rider_id,horse_id:target?.horse.id??entry.horse_id,fee_amount:s.total,status:'pending',created_at:receipt.createdAt,payload:{visitorName:s.visitorName,offlineReception:sync.offlineStamp(receipt.id,item)}}
}
global.fetch=async(url,options={})=>{
 const u=new URL(url)
 if(u.pathname==='/auth/v1/user'){authReads++;if(authHold)await authHold.promise;return{ok:true,json:async()=>({email:session.email,app_metadata:{role:authAllowed?'admin':'visitor'}})}}
 if(u.pathname.endsWith('/rpc/list_winter_reception_requests')){listReads++;return{ok:true,json:async()=>structuredClone(server)}}
 if(u.pathname.endsWith('/rpc/submit_winter_offline_item')){
  assert.ok(allowSubmit,'only explicit import/retry can submit');const body=JSON.parse(options.body);submissions.push(body)
  const r=await store.readDeviceRecord(body.p_receipt_id),item=r.items.find(i=>batch.winterDraftSummary(i.draft).id===body.p_item.args.p_id)
  assert.equal(item.status,'unknown');assert.equal(item.locked,true)
  if(!server.some(s=>s.id===body.p_item.args.p_id))server.push(rowFor(r,item))
  if(body.p_item.args.p_id===loseId)throw Error('synthetic response lost after save')
  return{ok:true,json:async()=>({receiptId:r.id,ids:[body.p_item.args.p_id],total:body.p_expected_total})}
 }
 assert.equal(options.method??'GET','GET','no reflection/payment/other mutation')
 assert.equal(u.searchParams.get('event_id'),'eq.'+data.eventId)
 if(failData)throw Error('synthetic roster unavailable')
 const rows={organizations:data.organizations,riders:data.riders,horses:data.horses,competitions:data.competitions,reception_entries:data.entries}[u.pathname.split('/').at(-1)]
 assert.ok(rows,u.pathname);return{ok:true,json:async()=>structuredClone(rows)}
}
const el=document.getElementById('root');let root
const btn=(label)=>[...el.querySelectorAll('button')].find(b=>b.textContent===label)
const inbox=()=>el.querySelector('#winter-offline-reception')
async function waitFor(test){for(let n=0;n<200&&!test();n++)await act(async()=>{await new Promise(r=>setTimeout(r,10))});assert.ok(test(),el.textContent)}
async function click(label){const b=btn(label);assert.ok(b,label);assert.equal(b.disabled,false,label);await act(async()=>b.click())}
const deferred=()=>{let resolve;return{promise:new Promise(r=>resolve=r),resolve}}
async function archive(queue,name){const frozen=batch.freezeWinterReception({...queue,localOnly:true},name);batch.writeWinterQueue(localStorage,frozen);const r=await offline.archiveReception(frozen,prep);await offline.recoverSealedInput();return r}
;(async()=>{
 await store.writeDeviceRecord(prep,null)
 const saved=await archive(fixture.queue,'合成来訪者'),raw=JSON.stringify(await offline.listOfflineReceipts())
 root=createRoot(el);await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Dashboard))))
 await waitFor(()=>inbox()?.textContent.includes('追加1件 ／ 変更1件 ／ 棄権1件'))
 assert.equal(el.querySelector('#winter-tab-requests').getAttribute('aria-selected'),'true','old offline link opens requests')
 assert.equal(el.querySelector('#winter-tab-offline'),null,'no separate offline tab')
 assert.ok(!inbox().textContent.includes('合成来訪者'));assert.equal(submissions.length,0)
 assert.equal(JSON.stringify(await offline.listOfflineReceipts()),raw,'summary is read-only and works without roster data')
 await click('内容を確認する');await waitFor(()=>inbox().textContent.includes('synthetic roster unavailable'))
 assert.ok(inbox().textContent.includes('合成来訪者'));assert.equal(btn('確認した未送信分を申請一覧へ取り込む').disabled,true)
 assert.equal(JSON.stringify(await offline.listOfflineReceipts()),raw)
 failData=false;await click('本部の受付状況を確認する');await waitFor(()=>btn('確認した未送信分を申請一覧へ取り込む')?.disabled===false)
 assert.equal(submissions.length,0,'opening and checking never submit')
 allowSubmit=true;await click('確認した未送信分を申請一覧へ取り込む')
 await waitFor(()=>inbox().textContent.includes('結果確認待ち 1件')&&inbox().textContent.includes('申請一覧に登録済み 2件')&&!btn('内容を閉じる').disabled)
 allowSubmit=false;assert.equal(submissions.length,3);assert.equal(server.length,3);assert.ok(server.every(r=>r.status==='pending'),'import never reflects start list')
 await waitFor(()=>el.querySelector('[data-master-request-groups]')||[...el.querySelectorAll('button')].some(b=>b.textContent.includes(fixture.org.name)))
 const group=[...el.querySelectorAll('button')].find(b=>b.textContent.includes(fixture.org.name));await act(async()=>group.click())
 await waitFor(()=>[...el.querySelectorAll('p')].filter(p=>p.textContent.startsWith('受付日時：')).length===3)
 assert.ok(el.textContent.includes('本部：申請一覧・出番表への反映'))
 // A lost response is reconciled with the exact stored ID, without another send.
 const before=submissions.length;await click('結果を確認する');await waitFor(()=>inbox().textContent.includes('申請一覧に登録済み 3件')&&!btn('内容を閉じる').disabled)
 assert.equal(submissions.length,before);assert.equal(btn('確認した未送信分を申請一覧へ取り込む').disabled,true)
 const after=await offline.listOfflineReceipts();assert.equal(after[0].id,saved.id);assert.deepEqual(after[0].items.map(i=>i.draft),saved.items.map(i=>i.draft));assert.deepEqual(after[0].items.map(i=>i.context),saved.items.map(i=>i.context))
 // Backgrounding or changing tabs hides details and invalidates old async opens.
 hidden=true;await act(async()=>document.dispatchEvent(new Event('visibilitychange')));assert.ok(!el.textContent.includes('受付に来た方：合成来訪者'))
 hidden=false;await act(async()=>document.dispatchEvent(new Event('visibilitychange')));await waitFor(()=>!!btn('内容を確認する'))
 authAllowed=false;await click('内容を確認する');await waitFor(()=>inbox().textContent.includes('管理者権限'))
 assert.ok(!inbox().textContent.includes('受付に来た方'));authAllowed=true
 authHold=deferred();const authBefore=authReads;await click('内容を確認する');await waitFor(()=>authReads>authBefore)
 await click('精算');await click('申請一覧');await waitFor(()=>!!btn('管理者権限を確認中…'))
 const hold=authHold;authHold=null;await act(async()=>hold.resolve());await waitFor(()=>!!btn('内容を確認する'))
 assert.equal(inbox().querySelector('#winter-device-receipts'),null,'stale authorization must not reopen details')
 // Existing same-ID disagreement is visible and cannot be imported as a new item.
 const extra=structuredClone(fixture.queue);extra.items=[extra.items[0]];extra.items[0].input.id='00000000-0000-4000-8000-000000000099'
 const extraReceipt=await archive(extra,'合成要確認');server.push({...rowFor(extraReceipt,extraReceipt.items[0]),payload:{offlineReception:{wrong:true}}})
 await click('精算');await click('申請一覧');await waitFor(()=>inbox()?.textContent.includes('追加1件'))
 await click('内容を確認する');await waitFor(()=>inbox().textContent.includes('同じ申請IDの本部記録を確認しましたが内容の一致を確認できません')&&!btn('内容を閉じる').disabled)
 assert.match(inbox().textContent,/要確認 1件/);assert.equal(btn('確認した未送信分を申請一覧へ取り込む').disabled,true);assert.equal(submissions.length,before)
 await act(async()=>root.unmount());dom.window.close()
 console.log('PASS: actual dashboard integration/legacy link, no offline tab, read-only counts without roster, privacy/auth guards, local preservation on read failure, explicit three-type import, immediate existing-list update, unknown-result reconciliation without resend, exact IDs/content, conflict display, zero reflection/payment writes; simulated DOM/HTTP, not iPad')
})().catch(e=>{console.error(e);process.exitCode=1})
