import {assertWinterEvent} from './winter-event'
import {winterRpc,type WinterRequestRow} from './winter-reception'
import type {loadWinterData} from './winter-data'
type Data=Awaited<ReturnType<typeof loadWinterData>>
export function winterRequestPositionTarget(row:WinterRequestRow,data:Data){
 assertWinterEvent(row.event_id);assertWinterEvent(data.eventId)
 if(row.request_type!=='add'&&(row.request_type!=='change'||!row.payload.treatedAsWithdrawAdd))return null
 const competition=data.competitions.find(c=>c.id===row.target_competition_id);if(!competition)throw new Error('Winterの競技を確認できません');assertWinterEvent(competition.event_id)
 const original=row.payload.inputs?.entryId??row.original_entry_id
 const count=data.entries.filter(e=>e.competition_id===competition.id&&!['wd','withdrawn'].includes(e.status.toLowerCase())&&(row.request_type!=='change'||e.entry_id!==original)).length
 return {official:competition.official,maxPosition:count+1}
}
export async function reflectWinterMasterRequest(id:string,position:number|null,token:string){
 const result=await winterRpc('reflect_winter_request_at_position',{p_request_id:id,p_position:position},token,AbortSignal.timeout(30000))
 if(typeof result!=='string'||!/^[0-9a-f-]{36}$/i.test(result))throw new Error('反映結果を確認できません。同じ申請・位置で再確認してください')
 return result
}
export async function cancelWinterMasterRequest(id:string,reason:string,token:string){
 if(!reason.trim()||reason.trim().length>300)throw new Error('取消理由は1〜300文字で入力してください')
 const result=await winterRpc('cancel_winter_request',{p_request_id:id,p_reason:reason.trim()},token,AbortSignal.timeout(30000)) as {requestId?:string;cancelledAt?:string;entryId?:string|null}
 if(result?.requestId!==id||!result.cancelledAt||!Number.isFinite(new Date(result.cancelledAt).getTime()))throw new Error('取消結果を確認できません。同じ申請・理由で再確認してください')
 return result
}
export class WinterGroupReflectError extends Error{constructor(message:string,public completedIds:string[],public failedId:string){super(message)}}
/** Matches Autumn: ordered, per-request commits; stop at the first failure and retain completed IDs. */
export async function reflectWinterGroup(rows:WinterRequestRow[],organizationId:string,positions:Record<string,string>,token:string,onProgress?:(id:string,index:number)=>void){
 if(rows.some(row=>row.organization_id!==organizationId)||new Set(rows.map(row=>row.id)).size!==rows.length)throw new Error('同じ団体の重複しない申請を選択してください')
 for(const row of rows)assertWinterEvent(row.event_id)
 const completed:string[]=[]
 for(const [index,row] of rows.filter(r=>r.status==='pending').entries()){
  assertWinterEvent(row.event_id);onProgress?.(row.id,index+1)
  const value=positions[row.id],position=value?Number(value):null
  try{if(position!==null&&(!Number.isSafeInteger(position)||position<1))throw new Error('反映位置を確認してください');await reflectWinterMasterRequest(row.id,position,token);completed.push(row.id)}
  catch(error){throw new WinterGroupReflectError(`${completed.length}件を反映しました。次の申請で停止しました：${error instanceof Error?error.message:'反映に失敗しました'}`,completed,row.id)}
 }
 return completed
}
