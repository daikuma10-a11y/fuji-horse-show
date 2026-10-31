import {readDeviceRecord,writeDeviceRecord,listDeviceRecords,type DeviceRecord} from './master/device-reception-store'
import {WINTER_EVENT_ID,WINTER_EVENT_NAME} from './winter-event'
import {loadWinterData,type WinterEntryRow} from './winter-data'
import {emptyWinterQueue,readWinterQueue,writeWinterQueue,validateWinterQueue,stageWinterDraft,winterDraftSummary,winterBatchPayload,type WinterQueue,type WinterDraft} from './winter-batch'
export type WinterData=Awaited<ReturnType<typeof loadWinterData>>
export const preparationId=`${WINTER_EVENT_ID}:preparation`
export type WinterPreparation=DeviceRecord&{kind:'preparation';schema:1;eventName:string;retrievedAt:string;build:string;data:WinterData}
export type OfflineStatus='queued'|'review'|'unknown'|'sent'|'cancelled'
export type OfflineItem={draft:WinterDraft;status:OfflineStatus;message:string;attempts:number;locked?:boolean;context:Record<string,unknown>;history:{at:string;note:string;draft?:WinterDraft}[]}
export type WinterOfflineReceipt=DeviceRecord&{kind:'receipt';schema:1;createdAt:string;snapshotAt:string;sourceDigest:string;items:OfflineItem[]}
export const offlineStatusLabel:Record<OfflineStatus,string>={queued:'未送信',review:'要確認',unknown:'結果確認待ち',sent:'送信済み',cancelled:'端末内で取下げ'}
export const offlineUrgentNotice='端末に預かった受付は、本部・審判には届いていません。出番が迫る申請は、本部・審判へ電話や係員を通じて別途連絡してください。'
export function stableJson(value:unknown):string{if(Array.isArray(value))return '['+value.map(stableJson).join(',')+']';if(value&&typeof value==='object')return '{'+Object.entries(value).filter(([,v])=>v!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>JSON.stringify(k)+':'+stableJson(v)).join(',')+'}';return JSON.stringify(value)}
export async function digest(value:unknown){const hash=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableJson(value)));return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('')}
function pick(row:object,keys:string[]){const r=row as Record<string,unknown>;return Object.fromEntries(keys.map(k=>[k,r[k]??null]))}
const competitionKeys=['id','event_id','competition_no','competition_date','official','fee','op_fee','member_fee','nonmember_fee']
export function entryContext(row:WinterEntryRow){return {...pick(row,['entry_id','event_id','competition_id','rider_id','horse_id','organization_id','status','start_order']),is_op:!!row.is_op}}
/** Fields influencing identity, affiliation, eligibility, participation category and price. */
export function draftContext(draft:WinterDraft,data:WinterData):Record<string,unknown>{
 const target=draft.type==='add'?draft.input:draft.type==='change'?draft.input.target:null
 const original=draft.type==='change'?draft.input.original:draft.type==='withdraw'?draft.entry:null
 const summary=winterDraftSummary(draft)
 const org=data.organizations.find(r=>r.id===summary.organizationId)
 const rider=data.riders.find(r=>r.id===(target?.rider.id??original?.rider_id))
 const horse=data.horses.find(r=>r.id===(target?.horse.id??original?.horse_id))
 const competitionIds=[...new Set([target?.competition.id,original?.competition_id].filter(Boolean))] as string[]
 const competitions=competitionIds.map(id=>{const c=data.competitions.find(c=>c.id===id);if(!c)throw new Error('競技が名簿にありません');return pick(c,competitionKeys)}).sort((a,b)=>String(a.id).localeCompare(String(b.id)))
 if(!org||!rider||!horse)throw new Error('保存済み名簿に該当する団体・人馬がありません。本部で確認してください')
 const entry=original?data.entries.find(e=>e.entry_id===original.entry_id):null
 if(original&&!entry)throw new Error('対象の出番が見つかりません')
 return {organization:pick(org,['id','event_id','name']),rider:pick(rider,['id','event_id','name','organization_id','jef_member_no','is_participant','roster_source']),horse:pick(horse,['id','event_id','name','organization_id','jef_registration_no','is_participant','roster_source']),competitions,entry:entry?entryContext(entry):null}
}
export function assertSnapshot(p:WinterPreparation){
 if(p?.schema!==1||p.kind!=='preparation'||p.eventId!==WINTER_EVENT_ID||p.data?.eventId!==WINTER_EVENT_ID||!p.build||!Number.isFinite(Date.parse(p.retrievedAt)))throw new Error('受付準備の記録を確認できません')
 for(const list of [p.data.organizations,p.data.riders,p.data.horses,p.data.competitions,p.data.entries]){if(!Array.isArray(list)||list.some(r=>r.event_id!==WINTER_EVENT_ID))throw new Error('保存済み名簿の大会を確認できません');const ids=list.map(r=>'entry_id' in r?r.entry_id:r.id);if(new Set(ids).size!==ids.length)throw new Error('保存済み名簿に重複があります')}
 if(!p.data.competitions.length)throw new Error('競技を準備できていません')
 const orgs=new Set(p.data.organizations.map(r=>r.id)),riders=new Set(p.data.riders.map(r=>r.id)),horses=new Set(p.data.horses.map(r=>r.id)),competitions=new Set(p.data.competitions.map(r=>r.id))
 if([...p.data.riders,...p.data.horses].some(r=>!orgs.has(r.organization_id))||p.data.entries.some(e=>!competitions.has(e.competition_id)||!riders.has(e.rider_id)||!horses.has(e.horse_id)))throw new Error('保存済み名簿と出番の対応が不完全です')
}
export function readPreparation(){return readDeviceRecord<WinterPreparation>(preparationId)}
export async function workerMessage(type:'PREPARE'|'CHECK'|'ACTIVATE',build?:string):Promise<{build:string;ready:boolean}>{
 if(!navigator.serviceWorker?.controller)throw new Error('受付画面の準備が終わっていません。通信中に準備してください')
 return new Promise((resolve,reject)=>{const channel=new MessageChannel(),timer=setTimeout(()=>reject(new Error('画面の端末保存を確認できません。通信と容量を確認してください')),120000);channel.port1.onmessage=e=>{clearTimeout(timer);channel.port1.close();e.data.error?reject(new Error(e.data.error)):resolve(e.data)};navigator.serviceWorker.controller!.postMessage({type,build},[channel.port2])})
}
export async function preparedReception(){const p=await readPreparation();if(!p)return null;assertSnapshot(p);const status=await workerMessage('CHECK',p.build);if(!status.ready)throw new Error('画面またはデータの準備が不完全です。管理者が通信中に準備し直してください');return p}
export class WinterPreparationPending extends Error {
 constructor(){super('入力中の受付を保存してから準備し直してください')}
}
export async function prepareReception(options:{signal?:AbortSignal}={}){
 const checkActive=()=>{if(options.signal?.aborted)throw new Error('本部画面を離れたため、準備の更新を中止しました')}
 const checkInput=()=>{checkActive();if(readWinterQueue(localStorage).items.length)throw new WinterPreparationPending()}
 checkActive()
 if(!('serviceWorker' in navigator)||!window.isSecureContext)throw new Error('このブラウザーではオフライン受付を準備できません')
 // The canonical home is /winter (no trailing slash). /winter/ excludes it.
 // Keep existing registrations/caches/receipts: the old scope can coexist safely.
 const registration=await navigator.serviceWorker.register('/winter/sw.js',{scope:'/winter',updateViaCache:'none'})
 const worker=registration.installing??registration.waiting??registration.active
 if(!worker)throw new Error('受付画面の準備を開始できません。通信中にもう一度準備してください')
 // navigator.serviceWorker.ready may resolve to the older /winter/ registration.
 await new Promise<void>((resolve,reject)=>{
  const finish=(error?:Error)=>{clearTimeout(timer);worker.removeEventListener('statechange',changed);error?reject(error):resolve()}
  const changed=()=>{
   if(registration.waiting)finish(new Error('新しい画面が待機中です。Winterの他の画面を閉じ、開き直して準備してください'))
   else if(worker.state==='redundant')finish(new Error('受付画面の準備が中断されました。通信中にもう一度準備してください'))
   else if(registration.active===worker&&worker.state==='activated')finish()
  }
  const timer=setTimeout(()=>finish(new Error('受付画面の準備を確認できません。通信中にもう一度準備してください')),15000)
  worker.addEventListener('statechange',changed);changed()
 })
 const homeRegistration=await navigator.serviceWorker.getRegistration('/winter')
 if(homeRegistration?.scope!==new URL('/winter',window.location.origin).href||homeRegistration.active?.state!=='activated')throw new Error('受付トップのオフライン準備を確認できません')
 if(!navigator.serviceWorker.controller){await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>{navigator.serviceWorker.removeEventListener('controllerchange',changed);reject(new Error('画面を再読み込みし、もう一度準備してください'))},15000);function changed(){clearTimeout(timer);navigator.serviceWorker.removeEventListener('controllerchange',changed);resolve()}navigator.serviceWorker.addEventListener('controllerchange',changed)})}
 // Repair navigation even if an interrupted draft is present, without replacing
 // that draft or its data snapshot. The user can then resume the same input.
 checkInput()
 const data=await loadWinterData(AbortSignal.timeout(60000)),retrievedAt=new Date().toISOString(),old=await readPreparation()
 checkInput()
 const result=await workerMessage('PREPARE')
 if(!result.ready)throw new Error('画面の保存が完了していません')
 const p:WinterPreparation={id:preparationId,revision:(old?.revision??0)+1,kind:'preparation',schema:1,eventId:WINTER_EVENT_ID,eventName:WINTER_EVENT_NAME,retrievedAt,build:result.build,data};assertSnapshot(p)
 // A draft can appear in another tab, or the administrator can leave while the
 // data/assets are loading. Do not replace the snapshot after either event.
 checkInput()
 await writeDeviceRecord(p,old?.revision??null)
 // Once committed, finish activation even if the caller unmounts in this short
 // interval. Never leave the new data pointing at an intentionally old shell.
 const activated=await workerMessage('ACTIVATE',p.build);if(!activated.ready)throw new Error('画面の準備を有効にできません')
 await navigator.storage?.persist?.().catch(()=>false)
 window.dispatchEvent(new Event('winter-offline-changed'))
 return p
}
export async function loadReceptionData(signal?:AbortSignal){
 if(new URLSearchParams(window.location.search).get('meeting')==='1')return loadWinterData(signal)
 const p=await preparedReception();await recoverSealedInput();return p?{...p.data,offlinePreparedAt:p.retrievedAt}:loadWinterData(signal)
}
export function receptionNavigate(path:string,push:(path:string)=>void){if(new URLSearchParams(window.location.search).get('meeting')==='1')push(path);else window.location.assign(path)}
export async function listOfflineReceipts(){const rows=await listDeviceRecords<WinterOfflineReceipt>(WINTER_EVENT_ID,'receipt');for(const r of rows){if(r.schema!==1||!Array.isArray(r.items)||!r.items.length||r.items.some(i=>!i.context||!Object.keys(offlineStatusLabel).includes(i.status)||!Array.isArray(i.history)))throw new Error('保存済み受付の形式を確認できません。消さずに管理者へ確認してください');for(const i of r.items)winterDraftSummary(i.draft)}return rows}
export function receiptId(queue:WinterQueue){return queue.receiptId??winterDraftSummary(queue.items[0]).id}
export async function archiveReception(queue:WinterQueue,p:WinterPreparation){
 validateWinterQueue(queue);if(!queue.attempted||!queue.items.length)throw new Error('受付内容とお名前を確認してください')
 const id=receiptId(queue),sourceDigest=await digest(queue),existing=await readDeviceRecord<WinterOfflineReceipt>(id)
 if(existing){if(existing.sourceDigest!==sourceDigest)throw new Error('同じ受付番号の保存内容が異なります。管理者に確認してください');return existing}
 const receipt:WinterOfflineReceipt={id,revision:1,kind:'receipt',schema:1,eventId:WINTER_EVENT_ID,createdAt:new Date().toISOString(),snapshotAt:queue.snapshotAt??p.retrievedAt,sourceDigest,items:queue.items.map(draft=>({draft,status:queue.localOnly?'queued':'unknown',message:queue.localOnly?'本部への送信待ち':'以前の送信結果を本部で確認してください',attempts:queue.localOnly?0:1,locked:!queue.localOnly,context:queue.contexts?.[winterDraftSummary(draft).id]??draftContext(draft,p.data),history:[]}))}
 return writeDeviceRecord(receipt,null)
}
/** A crash after durable archive but before resetting the input must not expose/re-send the old visitor. */
export async function recoverSealedInput(){
 const queue=readWinterQueue(localStorage);if(!queue.items.length)return
 const existing=await readDeviceRecord<WinterOfflineReceipt>(receiptId(queue));if(!existing)return
 if(existing.sourceDigest!==await digest(queue))throw new Error('保存済み受付と入力内容が異なります。管理者に確認してください')
 writeWinterQueue(localStorage,emptyWinterQueue());if(readWinterQueue(localStorage).items.length)throw new Error('保存済みですが入力欄を戻せません。係員に確認してください')
 window.dispatchEvent(new Event('winter-queue-changed'))
}
export function itemPayload(item:OfflineItem){return winterBatchPayload({version:1,eventId:WINTER_EVENT_ID,attempted:true,items:[item.draft]})}

export function stageReceptionDraft(draft:WinterDraft,scope:'reception'|'meeting',data:WinterData&{offlinePreparedAt?:string}){
 stageWinterDraft(draft,scope,scope==='reception'?{context:draftContext(draft,data),snapshotAt:data.offlinePreparedAt}:undefined)
}
