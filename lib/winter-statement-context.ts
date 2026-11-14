import {WINTER_DATES,WINTER_EVENT_NAME,assertWinterEvent} from './winter-event'
import {validateWinterCheckoutAccount,type WinterCheckoutAccount,type WinterSettlementRecord} from './winter-checkout'
import {winterSettlementDraft} from './winter-settlement-print'
import {masterScopedStatement,statementTime,type StatementScope,type StatementCharge,type StatementPayment} from './master/settlement-scope'
export type WinterStatementContext={
 eventId:string;orgId:string;dates:string[]
 sources:{id:string;date:string;at:string}[]
 adjustments:{id:string;at:string}[]
 payments:{id:string;at:string;amount:number;method:'bank_transfer'|'cash_at_venue';reversesId:string|null}[]
}
export function validateWinterStatementContext(value:unknown,account:WinterCheckoutAccount):WinterStatementContext{
 if(!value||typeof value!=='object')throw new Error('日付・入金後の明細を確認できません')
 const v=value as WinterStatementContext
 assertWinterEvent(v.eventId)
 if(v.orgId!==account.organization.id||!Array.isArray(v.dates)||!v.dates.length||v.dates.some(date=>!WINTER_DATES.some(d=>d===date))||new Set(v.dates).size!==v.dates.length)throw new Error('明細の団体・競技日が一致しません')
 for(const [rows,expected] of [[v.sources,account.lines],[v.adjustments,account.adjustments]] as const){
  if(!Array.isArray(rows)||rows.length!==expected.length||new Set(rows.map(row=>row.id)).size!==rows.length||rows.some(row=>!expected.some(item=>item.id===row.id)))throw new Error('明細の履歴が変わりました。精算内容を読み直してください。')
  rows.forEach(row=>statementTime(row.at))
 }
 if(v.sources.some(row=>!v.dates.includes(row.date)))throw new Error('明細の競技日を確認できません')
 if(!Array.isArray(v.payments)||new Set(v.payments.map(row=>row.id)).size!==v.payments.length)throw new Error('入金履歴を確認できません')
 const reversed=new Set<string>()
 for(const row of v.payments){
  statementTime(row.at)
  if(!row.id||!Number.isSafeInteger(row.amount)||row.amount===0||!['bank_transfer','cash_at_venue'].includes(row.method))throw new Error('入金履歴を確認できません')
  if(row.reversesId){const original=v.payments.find(p=>p.id===row.reversesId);if(!original||original.reversesId||original.amount!==row.amount||original.method!==row.method||reversed.has(original.id))throw new Error('入金の取消履歴を確認できません');reversed.add(original.id)}
 }
 if(v.payments.reduce((sum,row)=>sum+(row.reversesId?-row.amount:row.amount),0)!==account.extraPaid)throw new Error('入金が更新されました。精算内容を読み直してください。')
 return {eventId:v.eventId,orgId:v.orgId,dates:[...v.dates].sort(),sources:v.sources.map(({id,date,at})=>({id,date,at})),adjustments:v.adjustments.map(({id,at})=>({id,at})),payments:v.payments.map(({id,at,amount,method,reversesId})=>({id,at,amount,method,reversesId}))}
}
export function winterContextPayments(context:Pick<WinterStatementContext,'payments'>):StatementPayment[]{
 const reversed=new Set(context.payments.flatMap(row=>row.reversesId?[row.reversesId]:[]))
 return context.payments.filter(row=>row.amount>0&&!row.reversesId&&!reversed.has(row.id))
  .sort((a,b)=>statementTime(b.at)-statementTime(a.at))
  .map(row=>({id:row.id,at:row.at,label:`${new Date(row.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ${row.method==='cash_at_venue'?'現金':'振込'} ${row.amount.toLocaleString('ja-JP')}円`}))
}
/** Shared by the admin ledger and the reception's server snapshot. */
export function winterScopedCheckoutStatement(value:WinterCheckoutAccount,metadata:WinterStatementContext,scope:StatementScope,now=new Date(),method?:WinterSettlementRecord['payment_method']){
 const account=validateWinterCheckoutAccount(value),context=validateWinterStatementContext(metadata,account)
 if(scope.date&&!context.dates.includes(scope.date))throw new Error('大会の競技日を選んでください')
 const record=winterSettlementDraft(account,now,method),payments=winterContextPayments(context)
 const payment=scope.paymentId?payments.find(row=>row.id===scope.paymentId):undefined
 if(scope.paymentId&&!payment)throw new Error('選択した入金が取り消されたか、確認できません。読み直して選び直してください。')
 const cutoff=payment?statementTime(payment.at):-Infinity,charges:StatementCharge[]=[]
 const sources=new Map(context.sources.map(row=>[row.id,row])),originals=new Map(account.lines.map(row=>[row.id,row]))
 for(const line of record.document.document.lines){const source=sources.get(line.key!)!;charges.push({date:source.date,at:source.at,line})}
 const times=new Map(context.adjustments.map(row=>[row.id,row.at]))
 for(const adjustment of account.adjustments){
  const at=times.get(adjustment.id)!
  if(statementTime(at)<=cutoff)continue
  let remainder=adjustment.delta
  for(const item of adjustment.statement_items??[]){
   const source=sources.get(item.lineId),original=originals.get(item.lineId)
   if(!source||!original||original.action==='棄権'||original.action.startsWith('現場棄権'))continue
   remainder-=item.delta
   if(statementTime(source.at)>cutoff)continue
   if(item.delta)charges.push({date:source.date,at,line:{key:`${adjustment.id}:${item.lineId}`,period:'締切後・大会期間中',action:'金額訂正',competition:original.competitionLabel,rider:original.rider,horse:original.horse,entryFee:0,serviceFee:0,difference:0,amount:item.delta,note:[original.isOp?'OP参加':'',item.note].filter(Boolean).join(' ／ ')}})
  }
  if(remainder)charges.push({date:null,at,line:{key:adjustment.id,period:'締切後・大会期間中',action:'金額訂正',competition:'競技日指定なし',rider:'—',horse:'—',entryFee:0,serviceFee:0,difference:0,amount:remainder,note:adjustment.reason}})
 }
 return masterScopedStatement(record,charges,scope,payments,WINTER_EVENT_NAME)
}
