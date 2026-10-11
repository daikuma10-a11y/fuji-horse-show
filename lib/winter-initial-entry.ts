import { reviewWinterAdd, type WinterAddInput } from './winter-reception'
import { isWinterReceptionParticipant } from './winter-data'
export type WinterInitialEntryInput = Omit<WinterAddInput,'visitorName'>
export function reviewWinterInitialEntry(input:WinterInitialEntryInput) {
 if(!isWinterReceptionParticipant(input.rider)||!isWinterReceptionParticipant(input.horse))throw new Error('参加チェックを保存した人馬を選択してください')
 const review=reviewWinterAdd({...input,visitorName:'事前エントリー登録'})
 return {eventId:review.eventId,entryFee:review.entryFee,total:review.entryFee,addFee:0}
}
export class UncertainInitialEntrySave extends Error {}
export async function saveWinterInitialEntry(input:WinterInitialEntryInput,token:string):Promise<string>{
 const review=reviewWinterInitialEntry(input)
 if(!token)throw new Error('本部ログインが必要です')
 let response:Response
 try{response=await fetch('https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/rpc/register_winter_initial_entry',{
  method:'POST',cache:'no-store',headers:{apikey:'sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95',Authorization:`Bearer ${token}`,'Content-Type':'application/json'},
  body:JSON.stringify({p_id:input.id,p_organization_id:input.organization.id,p_competition_id:input.competition.id,p_rider_id:input.rider.id,p_horse_id:input.horse.id,p_membership:input.selection.membership??null,p_is_op:!!input.selection.isOp,p_instructor_confirmed:!!input.selection.instructorConfirmed,p_expected_fee:review.entryFee}),
 })}catch{throw new UncertainInitialEntrySave('保存結果を確認できません。同じ内容で再確認してください')}
 const result=await response.json().catch(()=>null)
 if(!response.ok){if(response.status>=500)throw new UncertainInitialEntrySave('保存結果を確認できません。同じ内容で再確認してください');throw new Error(result?.message||'事前エントリーを登録できません')}
 if(result!==input.id)throw new UncertainInitialEntrySave('登録番号を確認できません。同じ内容で再確認してください')
 return input.id
}
