import {reviewWinterInitialEntry,WinterInitialBatchFailure,type WinterInitialEntryInput} from './winter-initial-entry'
import {assertWinterEvent,WINTER_EVENT_ID} from './winter-event'
export type WinterSettlementOnlyRow={id:string;event_id:string;organization_key:string;inputs:{organizationId:string;competitionId:string;riderId:string;horseId:string;membership:string|null;isOp:boolean;instructorConfirmed:boolean;entryFee:number};entry_fee:number;fee_amount:number;note:string;reverses_id:string|null;created_at:string;created_by:string}
const endpoint='https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1',key='sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95'
export function reviewWinterSettlementOnly(inputs:WinterInitialEntryInput[]){
 if(!inputs.length||inputs.length>100)throw new Error('一度に1〜100件を登録してください')
 const ids=new Set<string>();let total=0
 for(const input of inputs){if(!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).test(input.id)||ids.has(input.id))throw new Error('登録番号が不正または重複しています');if(input.organization.id!==inputs[0].organization.id)throw new Error('同じ馬の所属団体でまとめて登録してください');ids.add(input.id);total+=reviewWinterInitialEntry(input).entryFee+3000}
 return {count:inputs.length,total}
}
export function settlementOnlyInput(input:WinterInitialEntryInput){return {organizationId:input.organization.id,competitionId:input.competition.id,riderId:input.rider.id,horseId:input.horse.id,membership:input.selection.membership??null,isOp:!!input.selection.isOp,instructorConfirmed:!!input.selection.instructorConfirmed,entryFee:reviewWinterInitialEntry(input).entryFee}}
class UnknownSave extends Error{}
async function call(rpc:string,body:unknown,ids:string[],token:string){
 let r:Response
 try{r=await fetch(`${endpoint}/rpc/${rpc}`,{method:'POST',headers:{apikey:key,Authorization:`Bearer ${token}`,'Content-Type':'application/json'},signal:AbortSignal.timeout(25000),body:JSON.stringify(body)})}catch{throw new UnknownSave('保存結果を確認できません。同じ一覧・登録番号で再確認してください')}
 const v=await r.json().catch(()=>null);if(!r.ok){if(r.status>=500)throw new UnknownSave('保存結果を確認できません。同じ番号で再確認してください');throw new Error(v?.message??'現場登録を保存できません')}
 const result=Array.isArray(v)?v:[v];if(JSON.stringify(result)!==JSON.stringify(ids))throw new UnknownSave('保存した登録番号を確認できません')
 const q=new URLSearchParams({event_id:`eq.${WINTER_EVENT_ID}`,id:`in.(${ids.join(',')})`,select:'*'})
 try{const check=await fetch(`${endpoint}/fhs_winter_settlement_only?${q}`,{headers:{apikey:key,Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(15000)});if(!check.ok)throw Error();const rows:WinterSettlementOnlyRow[]=await check.json();if(!Array.isArray(rows)||rows.length!==ids.length)throw Error();for(const row of rows)assertWinterEvent(row.event_id);return rows}catch{throw new UnknownSave('保存後の履歴を確認できません。同じ登録番号で再確認してください')}
}
export async function saveWinterSettlementOnlyBatch(inputs:WinterInitialEntryInput[],token:string,completedIds:string[]=[],onSaved?:(ids:string[])=>void){
 reviewWinterSettlementOnly(inputs);if(!token)throw new Error('本部ログインが必要です')
 if(completedIds.length)throw new Error('現場一覧は全件を同時保存します。保存済みの一覧を再登録しないでください')
 const rows=inputs.map(x=>({id:x.id,inputs:settlementOnlyInput(x),note:'現場追加・再走行'}))
 try{const saved=await call('save_winter_settlement_only_batch',{p_rows:rows},rows.map(x=>x.id),token)
 for(const input of rows){const row=saved.find(x=>x.id===input.id);if(!row||row.organization_key!==inputs.find(x=>x.id===input.id)?.rider.organization_id||Object.entries(input.inputs).some(([k,v])=>row.inputs[k as keyof typeof row.inputs]!==v)||row.note!==input.note||row.reverses_id!==null||row.entry_fee!==input.inputs.entryFee||row.fee_amount!==input.inputs.entryFee+3000)throw new UnknownSave('保存内容を確認できません')}
 const ids=rows.map(x=>x.id);onSaved?.(ids);return ids
 }catch(e){throw new WinterInitialBatchFailure(e instanceof Error?e.message:'現場登録を保存できません',[],e instanceof UnknownSave)}
}
export async function cancelWinterSettlementOnly(row:WinterSettlementOnlyRow,id:string,note:string,token:string){
 assertWinterEvent(row.event_id);if(!token||!note.trim()||note.trim().length>500||row.reverses_id||!/^[0-9a-f-]{36}$/i.test(id))throw new Error('取消理由と登録を確認してください')
 try{const rows=await call('save_winter_settlement_only',{p_id:id,p_inputs:row.inputs,p_note:note.trim(),p_reverses_id:row.id},[id],token),saved=rows[0]
 if(saved.id!==id||saved.reverses_id!==row.id||saved.organization_key!==row.organization_key||saved.fee_amount!==row.fee_amount||saved.note!==note.trim())throw new UnknownSave('取消内容を確認できません');return saved
 }catch(e){throw new WinterInitialBatchFailure(e instanceof Error?e.message:'取消を確認できません',[],e instanceof UnknownSave)}
}
