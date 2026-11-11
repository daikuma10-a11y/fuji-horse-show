import {winterRpc} from './winter-reception'

export type CorrectionTarget={competition:string;rider:string;horse:string;op:boolean;membership:string|null;instructor:boolean}
export type GroupCorrectionQuote={
  group:string;entry:string;target:CorrectionTarget;fee:number
  original:{entryId:string;competitionId:string;riderId:string;horseId:string;op:boolean;fee:number;position:number}
  accounts:{id:string;before:number;delta:number;remaining:number}[]
}
export async function correctWinterGroupEntry(group:string,entry:string,target:CorrectionTarget,operation:string|null,expected:GroupCorrectionQuote|null,token:string){
  const result=await winterRpc('winter_correct_group_entry',{p_group:group,p_entry:entry,p_target:target,p_operation:operation,p_expected:expected},token,AbortSignal.timeout(25000)) as GroupCorrectionQuote|null
  if(!result||result.group!==group||result.entry!==entry||result.original?.entryId!==entry||
    !result.target||Object.entries(target).some(([key,value])=>result.target[key as keyof CorrectionTarget]!==value)||
    !Number.isSafeInteger(result.fee)||!Number.isSafeInteger(result.original.fee)||!result.accounts?.length||
    result.accounts.some(a=>!a.id||![a.before,a.delta,a.remaining].every(Number.isSafeInteger)))throw Error('訂正の確認結果を照合できません。同じ内容で再確認してください。')
  return result
}
