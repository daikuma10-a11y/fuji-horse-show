import {reviewWinterChange,type WinterChangeInput} from './winter-change'
import type {WinterEntryRow} from './winter-data'
import {WINTER_EVENT_ID,assertWinterEvent} from './winter-event'
import {callWinterSettlementOnly, type WinterSettlementOnlyRow} from './winter-settlement-only'
import {WinterInitialBatchFailure} from './winter-initial-entry'
export type WinterSettlementAction={id:string;action:'change'|'withdraw';inputs:WinterSettlementOnlyRow['inputs'];note:string;billingOrg:string}
export const entrySnapshot=(e:WinterEntryRow)=>({competitionId:e.competition_id,riderId:e.rider_id,horseId:e.horse_id,isOp:!!e.is_op})
export function reviewSettlementChange(input:WinterChangeInput,note:string):WinterSettlementAction{
 const review=reviewWinterChange(input,{allowCrossClub:true}),{original,fromSelection,target}=input
 if(!note.trim()||note.trim().length>500)throw new Error('受付内容・理由を1〜500文字で入力してください')
 return{id:target.id,action:'change',billingOrg:target.rider.organization_id, note:note.trim(),inputs:{entryId:original.entry_id,before:entrySnapshot(original),organizationId:target.horse.organization_id,competitionId:target.competition.id,riderId:target.rider.id,horseId:target.horse.id,fromMembership:fromSelection.membership??null,fromInstructor:!!fromSelection.instructorConfirmed,membership:target.selection.membership??null,isOp:!!target.selection.isOp,instructorConfirmed:!!target.selection.instructorConfirmed,expectedTotal:review.fee.total,visitorName:target.visitorName.trim()}}
}
export function reviewSettlementWithdraw(id:string,entry:WinterEntryRow,horseOrg:string,billingOrg:string,visitorName:string,note:string):WinterSettlementAction{
 assertWinterEvent(entry.event_id);if(['wd','withdrawn'].includes(entry.status.toLowerCase()))throw new Error('棄権済みの出番は選択できません')
 if(!horseOrg||!billingOrg||!visitorName.trim()||visitorName.trim().length>100||!note.trim()||note.trim().length>500)throw new Error('所属・受付担当者・棄権理由を確認してください')
 return{id,action:'withdraw',billingOrg,note:note.trim(),inputs:{entryId:entry.entry_id,before:entrySnapshot(entry),organizationId:horseOrg,competitionId:entry.competition_id,riderId:entry.rider_id,horseId:entry.horse_id,fromMembership:null,fromInstructor:false,membership:null,isOp:!!entry.is_op,instructorConfirmed:false,expectedTotal:0,visitorName:visitorName.trim()}}
}
export async function saveWinterSettlementActions(rows:WinterSettlementAction[],token:string){
 if(!token)throw new Error('本部ログインが必要です');if(!rows.length||rows.length>100)throw new Error('1〜100件の一覧を入力してください')
 const ids=new Set<string>(),entries=new Set<string>();for(const x of rows){if(!(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i).test(x.id)||ids.has(x.id)||!x.inputs.entryId||entries.has(x.inputs.entryId)||!Number.isSafeInteger(x.inputs.expectedTotal)||Number(x.inputs.expectedTotal)<0)throw new Error('同じ出番の重複・登録番号・金額を確認してください');ids.add(x.id);entries.add(x.inputs.entryId)}
 try{const saved=await callWinterSettlementOnly('save_winter_settlement_actions_batch',{p_rows:rows.map(({id,action,inputs,note})=>({id,action,inputs,note}))},rows.map(x=>x.id),token)
 for(const x of rows){const row=saved.find(r=>r.id===x.id);if(!row||!row.inputs||row.event_id!==WINTER_EVENT_ID||row.action_type!==x.action||row.organization_key!==x.billingOrg||row.note!==x.note||row.reverses_id!==null||row.fee_amount!==x.inputs.expectedTotal||JSON.stringify(row.inputs.before)!==JSON.stringify(x.inputs.before)&&Object.entries(x.inputs.before??{}).some(([k,v])=>row.inputs.before?.[k as keyof NonNullable<typeof row.inputs.before>]!==v)||Object.entries(x.inputs).filter(([k])=>k!=='before').some(([k,v])=>row.inputs[k as keyof typeof row.inputs]!==v))throw new WinterInitialBatchFailure('保存した現場変更・棄権を確認できません',[],true)}return saved
 }catch(e){if(e instanceof WinterInitialBatchFailure)throw e;throw new WinterInitialBatchFailure(e instanceof Error?e.message:'保存結果を確認できません',[],e instanceof Error&&e.name==='UnknownSave')}
}
