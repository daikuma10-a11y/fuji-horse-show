import {winterHorseRegistration} from './winter-horse-registration'
import {WINTER_EVENT_ID,assertWinterEvent} from './winter-event'
import {loadWinterRequests,type WinterRequestRow} from './winter-reception'
import type {loadWinterData} from './winter-data'
import {compareWinterCompetitions,winterCompetitionLabel} from './winter-display-order'
import {verifyAdminSession,type AdminSession} from './supabase-rest'
const endpoint='https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1'
const key='sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95'
type Data=Awaited<ReturnType<typeof loadWinterData>>
export type WinterInitialCharge={id:string;event_id:string;entry_fee:number;inputs:{organizationId:string;billingOrganizationId?:string;competitionId:string;riderId:string;horseId:string}}
export type WinterAdvance={event_id:string;organization_key:string;paid_amount:number;note:string;updated_at:string;updated_by:string}
export type WinterPaymentInstruction={event_id:string;organization_key:string;payment_method:'bank_transfer'|'cash_at_venue';bank_details:string;updated_at:string;updated_by:string}
export type WinterSettlementData={initial:WinterInitialCharge[];requests:WinterRequestRow[];advances:WinterAdvance[];instructions?:WinterPaymentInstruction[];payments?:WinterExtraPayment[]}
export type WinterExtraPayment={id:string;event_id:string;organization_key:string;amount:number;payment_method:'bank_transfer'|'cash_at_venue';note:string;reverses_id:string|null;created_at:string;created_by:string}
const amount=(value:number)=>{if(!Number.isSafeInteger(value)||value<0)throw new Error('精算金額の形式を確認してください');return value}
async function read<T extends {event_id:string}>(table:string,select:string,token:string):Promise<T[]>{
 const all:T[]=[]
 for(let offset=0;;offset+=500){
  const query=new URLSearchParams({event_id:`eq.${WINTER_EVENT_ID}`,select,order:['fhs_winter_initial_entries','fhs_winter_extra_payments'].includes(table)?'id.asc':'organization_key.asc',limit:'500',offset:String(offset)})
  const response=await fetch(`${endpoint}/${table}?${query}`,{headers:{apikey:key,Authorization:`Bearer ${token}`},cache:'no-store',signal:AbortSignal.timeout(15000)})
  if(!response.ok)throw new Error(`Winter精算の読み込みに失敗しました (${response.status})`)
  const page:unknown=await response.json();if(!Array.isArray(page))throw new Error('精算データの形式を確認できません')
  for(const row of page)assertWinterEvent(row?.event_id)
  all.push(...page as T[]);if(page.length<500)return all
 }
}
export async function loadWinterSettlement(token:string):Promise<WinterSettlementData>{
 if(!token)throw new Error('本部ログインが必要です')
 const [initial,requests,advances,instructions,payments]=await Promise.all([read<WinterInitialCharge>('fhs_winter_initial_entries','id,event_id,inputs,entry_fee',token),loadWinterRequests(token),read<WinterAdvance>('settlement_prepayments','event_id,organization_key,paid_amount,note,updated_at,updated_by',token),read<WinterPaymentInstruction>('settlement_payment_instructions','event_id,organization_key,payment_method,bank_details,updated_at,updated_by',token),read<WinterExtraPayment>('fhs_winter_extra_payments','id,event_id,organization_key,amount,payment_method,note,reverses_id,created_at,created_by',token)])
 return {initial,requests,advances,instructions,payments}
}
/** Use saved fee snapshots, never the current competition price or Autumn seed data. */
export function winterSettlementAccount(data:Data,ledger:WinterSettlementData,orgId:string){
 assertWinterEvent(data.eventId)
 const org=data.organizations.find(x=>x.id===orgId);if(!org)throw new Error('Winterの団体を選択してください');assertWinterEvent(org.event_id)
 for(const row of [...ledger.initial,...ledger.requests,...ledger.advances,...(ledger.instructions??[]),...(ledger.payments??[])])assertWinterEvent(row.event_id)
 for(const row of ledger.initial){
  if(!row.inputs||!data.organizations.some(x=>x.id===row.inputs.organizationId)||(row.inputs.billingOrganizationId!==undefined&&!data.organizations.some(x=>x.id===row.inputs.billingOrganizationId))||!data.competitions.some(x=>x.id===row.inputs.competitionId)||!data.riders.some(x=>x.id===row.inputs.riderId)||!data.horses.some(x=>x.id===row.inputs.horseId))throw new Error('事前エントリーの団体・競技・人馬を確認できません')
  amount(row.entry_fee)
 }
 const horseRegistration=winterHorseRegistration(data.horses,orgId)
 const initial=ledger.initial.filter(x=>(x.inputs.billingOrganizationId??x.inputs.organizationId)===orgId)
 const requests=ledger.requests.filter(x=>x.organization_id===orgId)
 const reflected=requests.filter(x=>x.status==='reflected')
 const advance=ledger.advances.find(x=>x.organization_key===orgId)
 const instruction=(ledger.instructions??[]).find(x=>x.organization_key===orgId)
 if(instruction&&!['bank_transfer','cash_at_venue'].includes(instruction.payment_method))throw new Error('支払方法を確認できません')
 if(instruction?.payment_method==='bank_transfer'&&!instruction.bank_details.trim())throw new Error('振込先を確認できません')
 const normalTotal=initial.reduce((sum,x)=>sum+amount(x.entry_fee),0)
 const lines=reflected.map(x=>{
  const comp=data.competitions.find(c=>c.id===x.target_competition_id)
  const rider=data.riders.find(r=>r.id===x.rider_id),horse=data.horses.find(h=>h.id===x.horse_id)
  if(!comp||!rider||!horse)throw new Error('明細の競技・人馬を確認できません')
  const fee=amount(x.fee_amount);if(x.request_type==='withdraw'&&fee!==0)throw new Error('棄権料金が0円ではありません')
  const before=x.payload?.before
  const oldComp=before&&data.competitions.find(c=>c.id===before.competitionId)
  const oldRider=before&&data.riders.find(r=>r.id===before.riderId),oldHorse=before&&data.horses.find(h=>h.id===before.horseId)
  if(before&&(!oldComp||!oldRider||!oldHorse))throw new Error('変更前の人馬・競技を確認できません')
  const changed=(a:string|undefined,b:string)=>a&&a!==b?`${a} → ${b}`:b
  return {id:x.id,competition:comp,competitionLabel:changed(oldComp&&winterCompetitionLabel(oldComp),winterCompetitionLabel(comp)),rider:changed(oldRider?.name,rider.name),horse:changed(oldHorse?.name,horse.name),action:x.request_type==='add'?'追加':x.request_type==='change'?'変更':'棄権',amount:fee}
 }).sort((a,b)=>compareWinterCompetitions(a.competition,b.competition)||a.id.localeCompare(b.id))
 const extraTotal=lines.reduce((sum,x)=>sum+x.amount,0),advancePaid=amount(advance?.paid_amount??0)
 if(!Number.isSafeInteger(normalTotal+extraTotal))throw new Error('精算合計が大きすぎます')
 const payments=(ledger.payments??[]).filter(x=>x.organization_key===orgId)
 const reversed=new Set<string>()
 for(const row of payments){
  if(amount(row.amount)===0||!['bank_transfer','cash_at_venue'].includes(row.payment_method)||!row.note.trim())throw new Error('追加分入金の履歴を確認できません')
  if(row.reverses_id){const original=payments.find(x=>x.id===row.reverses_id);if(!original||original.reverses_id||original.amount!==row.amount||original.payment_method!==row.payment_method||reversed.has(original.id))throw new Error('追加分入金の取消履歴を確認できません');reversed.add(original.id)}
 }
 const extraPaid=payments.reduce((sum,x)=>sum+(x.reverses_id?-x.amount:x.amount),0)
 const initialTotal=normalTotal+horseRegistration.total
 const total=initialTotal+extraTotal
 const remaining=total-advancePaid-extraPaid
 if(!Number.isSafeInteger(extraPaid)||extraPaid<0||!Number.isSafeInteger(total)||!Number.isSafeInteger(remaining))throw new Error('追加分入金の合計を確認できません')
 const warnings:string[]=[]
 if(remaining<0)warnings.push('入金が登録済み料金合計を超えています。返金・充当を本部で確認してください。')
 if(requests.some(x=>x.status==='pending'))warnings.push('未反映の申請があります。反映後に再確認してください。')
 if(!advance&&initialTotal>0)warnings.push('事前入金は未確認です。')
 if(advancePaid>initialTotal)warnings.push('事前料金合計（競技料・馬匹登録料）を超える入金があります。返金・充当を確認してください。')
 const covered=new Set([...ledger.initial.map(x=>x.id),...ledger.requests.filter(x=>x.status==='reflected').map(x=>x.entry_id).filter(Boolean)])
 if(data.entries.some(x=>data.riders.find(r=>r.id===x.rider_id)?.organization_id===orgId&&!covered.has(x.entry_id)))warnings.push('料金履歴を確認できない出番があります。請求総額として使用しないでください。')
 return {organization:org,instruction,horseRegistration,initialTotal,total,normalTotal,extraTotal,advancePaid,advance,remaining,extraPaid,payments,reversed,lines,warnings,pending:requests.filter(x=>x.status==='pending').length}
}
/** Absolute advance amount, with optimistic locking and read-back. This is not a receipt. */
export async function saveWinterAdvance(session:AdminSession,orgId:string,paid:number,note:string,expected:WinterAdvance|null){
 if(!/^[0-9a-f-]{36}$/i.test(orgId)||!Number.isSafeInteger(paid)||paid<0||paid>2147483647||note.trim().length>500)throw new Error('団体・入金額・備考を確認してください')
 if(expected){assertWinterEvent(expected.event_id);if(expected.organization_key!==orgId)throw new Error('入金の団体が一致しません')}
 const verified=await verifyAdminSession(session)
 const headers={apikey:key,Authorization:`Bearer ${verified.accessToken}`,'Content-Type':'application/json'}
 const orgResponse=await fetch(`${endpoint}/organizations?${new URLSearchParams({event_id:`eq.${WINTER_EVENT_ID}`,id:`eq.${orgId}`,select:'id'})}`,{headers,cache:'no-store',signal:AbortSignal.timeout(15000)})
 if(!orgResponse.ok)throw new Error('団体を確認できません');const orgs=await orgResponse.json();if(!Array.isArray(orgs)||orgs.length!==1)throw new Error('Winterの団体を選択してください')
 const userResponse=await fetch('https://mhgyhyxagkkwdiepifdp.supabase.co/auth/v1/user',{headers,cache:'no-store',signal:AbortSignal.timeout(15000)})
 if(!userResponse.ok)throw new Error('本部ログインを確認できません');const user=await userResponse.json();if(!user.id||user.app_metadata?.role!=='admin')throw new Error('管理者権限が必要です')
 const body={event_id:WINTER_EVENT_ID,organization_key:orgId,paid_amount:paid,note:note.trim(),updated_by:user.id,updated_at:new Date().toISOString()}
 const query=expected?`?${new URLSearchParams({event_id:`eq.${WINTER_EVENT_ID}`,organization_key:`eq.${orgId}`,updated_at:`eq.${expected.updated_at}`})}`:''
 const response=await fetch(`${endpoint}/settlement_prepayments${query}`,{method:expected?'PATCH':'POST',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(body)})
 if(!response.ok)throw new Error(response.status===409?'別の操作で入金が登録されています。再読み込みして確認してください。':'保存を確認できません。再読み込みして入金額を確認してください。')
 const saved:unknown=await response.json();if(!Array.isArray(saved)||saved.length!==1)throw new Error('入金情報が変更されました。再読み込みして確認してください。')
 const row=saved[0] as WinterAdvance;assertWinterEvent(row.event_id)
 if(row.organization_key!==orgId||row.paid_amount!==paid||row.note!==note.trim())throw new Error('保存した入金内容を確認できません')
 const reloaded=await read<WinterAdvance>('settlement_prepayments','event_id,organization_key,paid_amount,note,updated_at,updated_by',verified.accessToken)
 const found=reloaded.find(x=>x.organization_key===orgId)
 if(!found||found.updated_at!==row.updated_at||found.paid_amount!==paid||found.note!==note.trim())throw new Error('保存後の入金内容が変わりました。再読み込みして確認してください。')
 return {session:verified,saved:found}
}

/** Payment plan only. Does not receive cash, change balances or finalize an invoice. */
export async function saveWinterPaymentInstruction(session:AdminSession,orgId:string,method:WinterPaymentInstruction['payment_method'],bankDetails:string,expected:WinterPaymentInstruction|null){
 const details=method==='bank_transfer'?bankDetails.trim():''
 if(!/^[0-9a-f-]{36}$/i.test(orgId)||!['bank_transfer','cash_at_venue'].includes(method)||details.length>2000||(method==='bank_transfer'&&!details))throw new Error('団体・支払方法・振込先を確認してください')
 if(expected){assertWinterEvent(expected.event_id);if(expected.organization_key!==orgId)throw new Error('支払方法の団体が一致しません')}
 const verified=await verifyAdminSession(session)
 const headers={apikey:key,Authorization:`Bearer ${verified.accessToken}`,'Content-Type':'application/json'}
 const orgResponse=await fetch(`${endpoint}/organizations?${new URLSearchParams({event_id:`eq.${WINTER_EVENT_ID}`,id:`eq.${orgId}`,select:'id'})}`,{headers,cache:'no-store',signal:AbortSignal.timeout(15000)})
 if(!orgResponse.ok)throw new Error('団体を確認できません');const orgs=await orgResponse.json();if(!Array.isArray(orgs)||orgs.length!==1)throw new Error('Winterの団体を選択してください')
 const userResponse=await fetch('https://mhgyhyxagkkwdiepifdp.supabase.co/auth/v1/user',{headers,cache:'no-store',signal:AbortSignal.timeout(15000)})
 if(!userResponse.ok)throw new Error('本部ログインを確認できません');const user=await userResponse.json();if(!user.id||user.app_metadata?.role!=='admin')throw new Error('管理者権限が必要です')
 const updatedAt=new Date(Math.max(Date.now(),expected?new Date(expected.updated_at).getTime()+1:0)).toISOString()
 const body={event_id:WINTER_EVENT_ID,organization_key:orgId,payment_method:method,bank_details:details,updated_by:user.id,updated_at:updatedAt}
 const query=expected?`?${new URLSearchParams({event_id:`eq.${WINTER_EVENT_ID}`,organization_key:`eq.${orgId}`,updated_at:`eq.${expected.updated_at}`})}`:''
 const response=await fetch(`${endpoint}/settlement_payment_instructions${query}`,{method:expected?'PATCH':'POST',headers:{...headers,Prefer:'return=representation'},body:JSON.stringify(body)})
 if(!response.ok)throw new Error(response.status===409?'別の操作で支払方法が登録されています。再読み込みして確認してください。':'保存を確認できません。再読み込みして支払方法を確認してください。')
 const saved:unknown=await response.json();if(!Array.isArray(saved)||saved.length!==1)throw new Error('支払方法が変更されました。再読み込みして確認してください。')
 const row=saved[0] as WinterPaymentInstruction;assertWinterEvent(row.event_id)
 if(row.organization_key!==orgId||row.payment_method!==method||row.bank_details!==details||row.updated_by!==user.id||new Date(row.updated_at).getTime()!==new Date(updatedAt).getTime())throw new Error('保存した支払方法を確認できません')
 const reloaded=await read<WinterPaymentInstruction>('settlement_payment_instructions','event_id,organization_key,payment_method,bank_details,updated_at,updated_by',verified.accessToken)
 const found=reloaded.find(x=>x.organization_key===orgId)
 if(!found||found.updated_at!==row.updated_at||found.payment_method!==method||found.bank_details!==details)throw new Error('保存後の支払方法が変わりました。再読み込みして確認してください。')
 return {session:verified,saved:found}
}
