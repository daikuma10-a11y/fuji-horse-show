import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,verifyAdminSession,type AdminSession} from './supabase-rest'

import {UncertainSubstitution,type HorseOptions,type HorseQuote,type SwapInput} from './master/horse-substitution'

async function call(session:AdminSession,onSession:(s:AdminSession)=>void,args:object,committing=false){
  let verified:AdminSession
  try { verified=await verifyAdminSession(session) } catch (err) {
    if(committing)throw new UncertainSubstitution('本部ログインを確認してから、同じ内容で再確認してください。')
    throw err
  }
  onSession(verified)
  let response:Response
  try {
    response=await fetch(SUPABASE_URL+'/rest/v1/rpc/winter_horse_substitution',{method:'POST',cache:'no-store',signal:AbortSignal.timeout(25000),
      headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+verified.accessToken,'Content-Type':'application/json'},body:JSON.stringify(args)})
  } catch {
    if(committing) throw new UncertainSubstitution('確定結果を読み取れません。同じ内容で再確認してください。')
    throw new Error('通信できません。回線を確認して再度お試しください。')
  }
  const value=await response.json().catch(()=>null)
  if(!response.ok || !value){
    if(committing && (response.status>=500 || !value)) throw new UncertainSubstitution('確定結果を読み取れません。同じ内容で再確認してください。')
    throw new Error(value?.message||'馬の差し替えを確認できません')
  }
  return value
}
export const loadHorseOptions=(session:AdminSession,onSession:(s:AdminSession)=>void,old:string):Promise<HorseOptions>=>
  call(session,onSession,{p_old:old,p_target:null,p_kind:null,p_rows:[],p_id:null,p_expected:null})
export const quoteHorseSwap=(session:AdminSession,onSession:(s:AdminSession)=>void,input:SwapInput,id:string|null=null,expected:HorseQuote|null=null):Promise<HorseQuote>=>
  call(session,onSession,{p_old:input.old,p_target:input.target.id,p_kind:input.target.kind,p_rows:input.rows,p_id:id,p_expected:expected},!!id)
