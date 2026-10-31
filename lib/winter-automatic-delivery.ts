import {listOfflineReceipts,itemPayload,type OfflineItem} from './winter-offline'
import {readDeviceRecord} from './master/device-reception-store'
import {updateOfflineItem} from './winter-offline-sync'
import {winterDraftSummary} from './winter-batch'
import type {WinterOfflineReceipt} from './winter-offline'
export const needsWinterDelivery=(item:OfflineItem)=>!item.handoff&&!['sent','cancelled'].includes(item.status)
let running:Promise<void>|null=null
/** Only sealed receipt records are sent. The editable visitor queue is never read. */
export function deliverWinterReceipts(){
 if(running)return running
 const task=deliver();running=task
 void task.finally(()=>{if(running===task)running=null}).catch(()=>{})
 return task
}
async function deliver(){
 const initial=await listOfflineReceipts()
 if(!initial.some(r=>r.items.some(needsWinterDelivery)))return
 const ready=await fetch('/api/winter-reception',{cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(30000)})
 if(!ready.ok)throw Error('通信が戻ると本部への送信を再開します')
 let failed=false
 for(const r of initial)for(let index=0;index<r.items.length;index++){
  if(navigator.onLine===false)throw Error('通信が戻ると本部へ自動送信します')
  let receipt=await readDeviceRecord<WinterOfflineReceipt>(r.id),item=receipt?.items[index]
  if(!receipt||!item||!needsWinterDelivery(item))continue
  try{
   item={...item,status:'unknown',locked:true,attempts:item.attempts+1,message:'本部へ自動送信・結果確認中です。同じ受付番号で再確認します'}
   receipt=await updateOfflineItem(receipt,index,item)
   const p=itemPayload(item),source={draft:item.draft,item:p.p_items[0],context:item.context,total:p.p_expected_total}
   const response=await fetch('/api/winter-reception/offline',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify({receiptId:r.id,source}),signal:AbortSignal.timeout(30000)})
   const result=await response.json()
   if(!response.ok||result.receiptId!==r.id||result.requestId!==winterDraftSummary(item.draft).id||result.total!==p.p_expected_total||!['registered','review','cancelled'].includes(result.status)||!Number.isFinite(Date.parse(result.receivedAt)))throw Error('本部の受信結果を確認できません')
   await updateOfflineItem(receipt,index,{...item,status:result.status==='registered'?'sent':result.status==='cancelled'?'cancelled':'review',handoff:{receivedAt:result.receivedAt,status:result.status},message:result.status==='registered'?'本部の申請一覧に届きました。出番表への反映は本部が行います':'本部に届きました。本部PCで内容を確認します'})
  }catch{failed=true}
 }
 window.dispatchEvent(new Event('winter-delivery-changed'))
 if(failed)throw Error('まだ本部に届いたか確認できない受付があります。通信中に同じ番号で自動再確認します')
}
