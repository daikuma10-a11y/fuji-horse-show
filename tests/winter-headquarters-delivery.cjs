// Real dashboard, notice, review/editor and existing request-list integration.
require('./register-ts.cjs')
const assert=require('node:assert/strict'),{JSDOM}=require(process.env.JSDOM_MODULE||'jsdom'),Module=require('node:module')
const dom=new JSDOM('<div id="root"></div>',{url:'https://winter.test/winter/admin',pretendToBeVisual:true})
for(const k of ['window','document','HTMLElement','HTMLInputElement','Event','MouseEvent','localStorage','sessionStorage'])global[k]=dom.window[k]
Object.defineProperty(global,'navigator',{configurable:true,value:dom.window.navigator})
global.indexedDB=require(process.env.FHS_TEST_IDB_PATH||'fake-indexeddb').indexedDB;global.IS_REACT_ACT_ENVIRONMENT=true
const React=require('react'),{act}=React,{createRoot}=require('react-dom/client'),original=Module.prototype.require
const blanks=['app-header','shared-roster-manager','winter-master-registration','winter-meeting-panel','winter-export-panel','winter-settlement-actions','winter-initial-entry-registration','winter-start-list','winter-timetable','winter-settlement-panel','winter-application-import','winter-registration-overview','winter-stable-information','winter-offline-preparation']
Module.prototype.require=function(name){if(name==='next/link')return{__esModule:true,default:({children,...props})=>React.createElement('a',props,children)};if(name==='@/lib/winter-live')return{subscribeWinterUpdates:()=>()=>{}};if(blanks.some(n=>name==='@/components/'+n))return new Proxy({},{get:()=>()=>null});return original.call(this,name)}
const fixture=require('./winter-public-reception.cjs'),batch=require('../lib/winter-batch.ts'),offline=require('../lib/winter-offline.ts'),event=require('../lib/winter-event.ts'),{WinterAdminDashboard}=require('../components/winter-admin-dashboard.tsx')
const session={email:'synthetic@example.invalid',accessToken:'dummy',refreshToken:'dummy-refresh',expiresAt:Date.now()+3600000},data={...fixture.data,timetable:[]}
sessionStorage.setItem(event.winterStorageKey('admin-session'),JSON.stringify(session));window.confirm=()=>true
const draft=batch.freezeWinterReception(fixture.queue,'合成来訪者').items[0],p=offline.itemPayload({draft}),row={request_id:p.p_items[0].args.p_id,receipt_id:'00000000-0000-4000-8000-000000000200',source:{draft,item:p.p_items[0],context:offline.draftContext(draft,data),total:p.p_expected_total},status:'review',message:'料金情報が変更されています',received_at:new Date().toISOString(),revision:1}
let reviews=[row],pending=2,failSummary=false,resolveMode='lostAfter',actions=[],requests=[]
global.fetch=async(url,options={})=>{
 const u=new URL(url)
 if(u.pathname==='/auth/v1/user')return Response.json({email:session.email,app_metadata:{role:'admin'}})
 const rpc=u.pathname.split('/').at(-1)
 if(rpc==='get_winter_reception_inbox_summary'){if(failSummary)throw Error('offline');return Response.json({pending,review:reviews.length})}
 if(rpc==='list_winter_received_reception')return Response.json(reviews)
 if(rpc==='list_winter_reception_requests')return Response.json(requests)
 if(rpc==='resolve_winter_received_item'){
  const b=JSON.parse(options.body);actions.push(b);assert.equal(b.p_request_id,row.request_id);assert.equal(b.p_resolution.source.item.args.p_id,row.request_id)
  if(actions.length>1)assert.deepEqual(b,actions[0],'uncertain resolution retry must be frozen')
  reviews=[];pending=3
  requests=[{id:row.request_id,event_id:data.eventId,request_type:'add',organization_id:fixture.org.id,original_entry_id:null,entry_id:null,target_competition_id:fixture.competition.id,rider_id:fixture.rider.id,horse_id:fixture.horse.id,fee_amount:row.source.total,status:'pending',created_at:row.received_at,payload:{visitorName:'合成来訪者'}}]
  if(resolveMode==='lostAfter')throw Error('synthetic response lost after commit')
  return Response.json({requestId:row.request_id,actionId:b.p_action_id,status:'registered'})
 }
 assert.equal(options.method??'GET','GET','no reflection/payment RPCs');assert.equal(u.searchParams.get('event_id'),'eq.'+data.eventId)
 const rows={organizations:data.organizations,riders:data.riders,horses:data.horses,competitions:data.competitions,reception_entries:data.entries}[rpc];assert.ok(rows,u.pathname);return Response.json(rows)
}
const el=document.getElementById('root'),button=t=>[...el.querySelectorAll('button')].find(b=>b.textContent===t)
async function waitFor(test){for(let i=0;i<200&&!test();i++)await act(async()=>{await new Promise(r=>setTimeout(r,10))});assert.ok(test(),el.textContent)}
async function click(t){const b=button(t);assert.ok(b,t);assert.equal(b.disabled,false,t);await act(async()=>b.click())}
;(async()=>{
 const root=createRoot(el);await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(WinterAdminDashboard))))
 await waitFor(()=>el.textContent.includes('未反映の申請 2件 ／ 要確認 1件')&&!!button('確認した内容を申請一覧に登録'))
 await click('精算');assert.ok(el.textContent.includes('未反映の申請 2件 ／ 要確認 1件'),'notice available outside requests')
 failSummary=true;await act(async()=>window.dispatchEvent(new Event('online')));await waitFor(()=>el.textContent.includes('前回確認時'));assert.ok(el.textContent.includes('未反映の申請 2件'))
 failSummary=false;await click('申請一覧で確認する');await waitFor(()=>button('確認した内容を申請一覧に登録'))
 const reason=[...el.querySelectorAll('label')].find(l=>l.textContent.startsWith('訂正・確認・取下げの理由')).querySelector('input')
 await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(reason,'料金を確認した合成試験');reason.dispatchEvent(new Event('input',{bubbles:true}))})
 const accept=[...el.querySelectorAll('label')].find(l=>l.textContent.includes('受付者と確認し')).querySelector('input');await act(async()=>accept.click())
 await click('確認した内容を申請一覧に登録');await waitFor(()=>el.textContent.includes('synthetic response lost after commit'))
 assert.equal(actions.length,1);assert.ok(button('同じ内容で確認結果を再確認'));assert.equal(button('確認した内容を申請一覧に登録').disabled,true)
 // Refreshes cannot erase the uncertain operation or replace its frozen payload.
 await act(async()=>document.dispatchEvent(new Event('visibilitychange')));await waitFor(()=>!!button('同じ内容で確認結果を再確認'))
 assert.ok(el.textContent.includes('synthetic response lost after commit'))
 resolveMode='ok';await click('同じ内容で確認結果を再確認');await waitFor(()=>!button('同じ内容で確認結果を再確認')&&el.textContent.includes('未反映の申請 3件 ／ 要確認 0件'))
 assert.equal(actions.length,2);assert.deepEqual(actions[0],actions[1]);assert.ok(el.textContent.includes('本部：申請一覧・出番表への反映'))
 await act(async()=>root.unmount());dom.window.close()
 console.log('PASS: actual HQ dashboard global notice, prior-count retention on failure, review list/shared editor, immutable uncertain resolution retry, immediate pending list refresh, zero reflection/payment; simulated DOM/HTTP')
})().catch(e=>{console.error(e);process.exitCode=1})
