import {verifyAdminSession,type AdminSession} from './supabase-rest'
import {WINTER_EVENT_ID,assertWinterEvent} from './winter-event'
import type {WinterExtraPayment} from './winter-settlement'
const endpoint='https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1'
const key='sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95'
export type WinterExtraPaymentInput={id:string;orgId:string;amount:number;method:'bank_transfer'|'cash_at_venue';note:string;reversesId:string|null}
export class UncertainWinterPayment extends Error{}
export async function saveWinterExtraPayment(session:AdminSession,input:WinterExtraPaymentInput){
 const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
 if(!uuid.test(input.id)||!uuid.test(input.orgId)||(input.reversesId!==null&&!uuid.test(input.reversesId))||!Number.isSafeInteger(input.amount)||input.amount<1||input.amount>2147483647||!['bank_transfer','cash_at_venue'].includes(input.method)||!input.note.trim()||input.note.trim().length>500)throw new Error('入金額・方法・確認内容を入力してください')
 const verified=await verifyAdminSession(session)
 const headers={apikey:key,Authorization:`Bearer ${verified.accessToken}`,'Content-Type':'application/json'}
 let response:Response
 try{response=await fetch(`${endpoint}/rpc/save_winter_extra_payment`,{method:'POST',headers,signal:AbortSignal.timeout(20000),body:JSON.stringify({p_id:input.id,p_organization_id:input.orgId,p_amount:input.amount,p_payment_method:input.method,p_note:input.note.trim(),p_reverses_id:input.reversesId})})}catch{throw new UncertainWinterPayment('保存結果を確認できません。同じ登録番号で再確認してください。')}
 if(!response.ok){if(response.status>=500)throw new UncertainWinterPayment('保存結果を確認できません。同じ登録番号で再確認してください。');const body=await response.json().catch(()=>null);throw new Error(body?.message??'入金を保存できません。内容・本部ログインを確認してください。')}
 try{
  if(await response.json()!==input.id)throw new Error()
  const query=new URLSearchParams({id:`eq.${input.id}`,event_id:`eq.${WINTER_EVENT_ID}`,select:'*'})
  const check=await fetch(`${endpoint}/fhs_winter_extra_payments?${query}`,{headers,cache:'no-store',signal:AbortSignal.timeout(15000)})
  if(!check.ok)throw new Error()
  const rows:WinterExtraPayment[]=await check.json(),row=rows[0]
  if(rows.length!==1||!row)throw new Error();assertWinterEvent(row.event_id)
  if(row.id!==input.id||row.organization_key!==input.orgId||row.amount!==input.amount||row.payment_method!==input.method||row.note!==input.note.trim()||row.reverses_id!==input.reversesId)throw new Error()
  return {session:verified,saved:row}
 }catch{throw new UncertainWinterPayment('保存後の入金内容を確認できません。同じ登録番号で再確認してください。')}
}
