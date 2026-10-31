import {writeDeviceRecord,readDeviceRecord} from './master/device-reception-store'
import {loadWinterData} from './winter-data'
import {winterRpc,loadWinterRequests,type WinterRequestRow} from './winter-reception'
import {winterDraftSummary} from './winter-batch'
import {draftContext,itemPayload,listOfflineReceipts,stableJson,type OfflineItem,type WinterOfflineReceipt,type WinterData} from './winter-offline'
export function offlineStamp(receiptId:string,item:OfflineItem){const p=itemPayload(item);return {version:1,receiptId,item:p.p_items[0],context:item.context,expectedTotal:p.p_expected_total}}
export function inspectOfflineItem(receiptId:string,item:OfflineItem,data:WinterData,requests:WinterRequestRow[],receipts:WinterOfflineReceipt[]):OfflineItem{
 if(item.handoff||item.status==='cancelled')return item
 const summary=winterDraftSummary(item.draft),saved=requests.find(r=>r.id===summary.id)
 if(saved){const stamp=(saved.payload as Record<string,unknown>).offlineReception;if(stableJson(stamp)===stableJson(offlineStamp(receiptId,item))&&saved.fee_amount===summary.total)return {...item,status:'sent',message:'本部で申請の保存を確認しました。出番表への反映は本部操作です',locked:true};return {...item,status:'review',locked:true,message:'同じ申請IDの本部記録を確認しましたが内容の一致を確認できません。新しい受付として送らず、本部で確認してください'}}
 if(item.status==='sent')return {...item,status:'review',locked:true,message:'以前確認した本部記録を取得できません。再送せず本部で確認してください'}
 try{
  if(stableJson(item.context)!==stableJson(draftContext(item.draft,data)))throw new Error('受付時から出番・所属・参加情報・競技料金のいずれかが変わっています。内容を確認・訂正してください')
  if(summary.originalId&&receipts.some(r=>r.items.some(other=>!['sent','cancelled'].includes(other.status)&&winterDraftSummary(other.draft).id!==summary.id&&winterDraftSummary(other.draft).originalId===summary.originalId)))throw new Error('同じ出番への変更・棄権が端末内に複数あります。どの申請を採用するか確認してください')
  if(summary.originalId&&requests.some(r=>r.original_entry_id===summary.originalId&&r.status==='pending'))throw new Error('同じ出番への未反映申請が本部にあります')
  return {...item,status:item.locked?'unknown':'queued',message:item.locked?'同じ申請IDで結果確認・再送できます':'最新情報との照合済み。管理者の送信待ち'}
 }catch(e){return {...item,status:'review',message:e instanceof Error?e.message:'要確認です'}}
}
export async function updateOfflineItem(receipt:WinterOfflineReceipt,index:number,item:OfflineItem){
 const next={...receipt,revision:receipt.revision+1,items:receipt.items.map((old,i)=>i===index?item:old)}
 return writeDeviceRecord(next,receipt.revision)
}
export async function reviewOfflineReceipts(token:string){
 const [data,requests,receipts]=await Promise.all([loadWinterData(AbortSignal.timeout(30000)),loadWinterRequests(token),listOfflineReceipts()])
 const updated:WinterOfflineReceipt[]=[]
 for(const receipt of receipts){const items=receipt.items.map(item=>inspectOfflineItem(receipt.id,item,data,requests,receipts));updated.push(await writeDeviceRecord({...receipt,revision:receipt.revision+1,items},receipt.revision))}
 return {data,receipts:updated}
}
/** Explicit admin action only; persist uncertain state BEFORE any network mutation. */
export async function sendOfflineItem(receiptId:string,index:number,token:string){
 let receipt=await readDeviceRecord<WinterOfflineReceipt>(receiptId);if(!receipt)throw new Error('受付を読み戻せません')
 let item=receipt.items[index];if(!item||item.handoff||['sent','cancelled'].includes(item.status))return receipt
 const [data,requests,receipts]=await Promise.all([loadWinterData(AbortSignal.timeout(30000)),loadWinterRequests(token),listOfflineReceipts()])
 const reviewed=inspectOfflineItem(receipt.id,item,data,requests,receipts)
 if(reviewed.status==='sent'||(reviewed.status==='review'&&!item.locked))return updateOfflineItem(receipt,index,reviewed)
 // An uncertain item is replayed unchanged. The transactional server lock either acknowledges it
 // or definitively rejects the original version; client-side absence alone never unlocks editing.
 if(reviewed.status==='review'&&reviewed.message.includes('同じ申請IDの本部記録'))return updateOfflineItem(receipt,index,reviewed)
 item={...item,status:'unknown',locked:true,attempts:item.attempts+1,message:'送信中・結果確認待ち。画面を閉じても同じ番号から確認します'}
 receipt=await updateOfflineItem(receipt,index,item)
 const p=itemPayload(item)
 try{
  const result=await winterRpc('submit_winter_offline_item',{p_receipt_id:receipt.id,p_item:p.p_items[0],p_context:item.context,p_expected_total:p.p_expected_total},token,AbortSignal.timeout(30000)) as {receiptId?:string;ids?:string[];total?:number}
  if(result?.receiptId!==receipt.id||stableJson(result.ids)!==stableJson([winterDraftSummary(item.draft).id])||result.total!==p.p_expected_total)throw new Error('本部の保存結果が一致しません')
  return await updateOfflineItem(receipt,index,{...item,status:'sent',message:'本部で申請の保存を確認しました。出番表への反映は本部操作です'})
 }catch(e){
  const status=(e as {status?:number})?.status
  // Only an explicit database/user rejection establishes rollback. Proxies/timeouts/5xx remain uncertain.
  const definite=status===400||status===401||status===403||status===422
  return updateOfflineItem(receipt,index,{...item,status:definite?'review':'unknown',locked:!definite,message:definite?`送信されませんでした：${e instanceof Error?e.message:'要確認'}`:'届いたか分かりません。同じ受付番号・申請IDで結果を確認してください。新規受付として作り直さないでください'})
 }
}
