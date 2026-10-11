import {verifyAdminSession,type AdminSession} from './supabase-rest'
import {WINTER_EVENT_ID,assertWinterEvent} from './winter-event'
import type {WinterChargeAdjustment} from './winter-settlement'
const endpoint='https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1'
const key='sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95'
export type WinterChargeAdjustmentInput={id:string;orgId:string;delta:number;reason:string;expectedTotal:number;previousId:string|null}
export class UncertainWinterAdjustment extends Error{}
export async function saveWinterChargeAdjustment(session:AdminSession,input:WinterChargeAdjustmentInput){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
 if(!uuid.test(input.id)||!uuid.test(input.orgId)||(input.previousId!==null&&!uuid.test(input.previousId))||!Number.isSafeInteger(input.delta)||input.delta===0||Math.abs(input.delta)>2147483647||!Number.isSafeInteger(input.expectedTotal)||input.expectedTotal+input.delta<0||!input.reason.trim()||input.reason.trim().length>500)throw new Error('訂正金額・理由を入力してください')
 const verified=await verifyAdminSession(session)
 const headers={apikey:key,Authorization:`Bearer ${verified.accessToken}`,'Content-Type':'application/json'}
 let response:Response
 try{response=await fetch(`${endpoint}/rpc/save_winter_charge_adjustment`,{method:'POST',headers,signal:AbortSignal.timeout(20000),body:JSON.stringify({p_id:input.id,p_organization_id:input.orgId,p_delta:input.delta,p_reason:input.reason.trim(),p_expected_total:input.expectedTotal,p_previous_id:input.previousId})})}catch{throw new UncertainWinterAdjustment('保存結果を確認できません。同じ登録番号で再確認してください。')}
 if(!response.ok){if(response.status>=500)throw new UncertainWinterAdjustment('保存結果を確認できません。同じ登録番号で再確認してください。');const body=await response.json().catch(()=>null);throw new Error(body?.message??'訂正を保存できません。内容・本部ログインを確認してください。')}
 try{
  if(await response.json()!==input.id)throw new Error()
  const query=new URLSearchParams({id:`eq.${input.id}`,event_id:`eq.${WINTER_EVENT_ID}`,select:'*'})
  const check=await fetch(`${endpoint}/fhs_winter_charge_adjustments?${query}`,{headers,cache:'no-store',signal:AbortSignal.timeout(15000)})
  if(!check.ok)throw new Error()
  const rows:WinterChargeAdjustment[]=await check.json(),row=rows[0]
  if(rows.length!==1||!row)throw new Error();assertWinterEvent(row.event_id)
  if(row.id!==input.id||row.organization_key!==input.orgId||row.delta!==input.delta||row.reason!==input.reason.trim()||row.before_total!==input.expectedTotal||row.after_total!==input.expectedTotal+input.delta||row.previous_id!==input.previousId)throw new Error()
  return {session:verified,saved:row}
 }catch{throw new UncertainWinterAdjustment('保存後の訂正内容を確認できません。同じ登録番号で再確認してください。')}
}
