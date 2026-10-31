import {winterRpc} from './winter-reception'
import {winterDraftSummary,type WinterDraft} from './winter-batch'
import {itemPayload,stableJson,draftContext,type WinterData,type OfflineItem} from './winter-offline'
export type ReceivedSource={draft:WinterDraft;item:ReturnType<typeof itemPayload>['p_items'][number];context:Record<string,unknown>;total:number}
export type ReceivedReception={request_id:string;receipt_id:string;source:ReceivedSource;status:'review';message:string;received_at:string;revision:number}
export type InboxSummary={pending:number;review:number}
export async function loadWinterInboxSummary(token:string):Promise<InboxSummary>{
 const r=await winterRpc('get_winter_reception_inbox_summary',{},token,AbortSignal.timeout(30000)) as InboxSummary
 if(!r||![r.pending,r.review].every(n=>Number.isSafeInteger(n)&&n>=0))throw Error('受付件数を確認できません')
 return r
}
export async function loadWinterInbox(token:string){
 const rows:ReceivedReception[]=[]
 for(let offset=0;;offset+=100){
  const page=await winterRpc('list_winter_received_reception',{p_offset:offset},token,AbortSignal.timeout(30000))
  if(!Array.isArray(page))throw Error('受信一覧を確認できません')
  for(const r of page){
   if(!r||r.status!=='review'||!Number.isSafeInteger(r.revision)||r.revision<1||!r.source||winterDraftSummary(r.source.draft).id!==r.request_id)throw Error('受信内容の番号を確認できません。本部の保存記録は保持しています')
   const payload=itemPayload({draft:r.source.draft} as OfflineItem)
   if(stableJson(payload.p_items[0])!==stableJson(r.source.item)||payload.p_expected_total!==r.source.total)throw Error('受信内容と申請情報が一致しません。本部の保存記録は保持しています')
   rows.push(r)
  }
  if(page.length<100)return rows
 }
}
export type InboxAction={id:string;requestId:string;revision:number;resolution:{mode:'register'|'cancel';reason:string;source?:ReceivedSource}}
export function inboxAction(row:ReceivedReception,draft:WinterDraft|null,reason:string,data:WinterData):InboxAction{
 const p=draft?itemPayload({draft} as OfflineItem):null
 if(draft&&winterDraftSummary(draft).id!==row.request_id)throw Error('元の申請IDを保持してください')
 return{id:crypto.randomUUID(),requestId:row.request_id,revision:row.revision,resolution:{mode:draft?'register':'cancel',reason,source:draft&&p?{draft,item:p.p_items[0],context:draftContext(draft,data),total:p.p_expected_total}:undefined}}
}
export async function resolveWinterInbox(action:InboxAction,token:string){
 const r=await winterRpc('resolve_winter_received_item',{p_request_id:action.requestId,p_action_id:action.id,p_expected_revision:action.revision,p_resolution:action.resolution},token,AbortSignal.timeout(30000)) as {requestId?:string;actionId?:string;status?:string}
 if(r?.requestId!==action.requestId||r.actionId!==action.id||r.status!==(action.resolution.mode==='register'?'registered':'cancelled'))throw Error('確認結果を照合できません。同じ操作で再確認してください')
 return r
}
