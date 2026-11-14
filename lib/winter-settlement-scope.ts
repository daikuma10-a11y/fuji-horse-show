import {winterSettlementAccount,type WinterSettlementData} from './winter-settlement'
import {winterSettlementDraft} from './winter-settlement-print'
import {WINTER_EVENT_NAME} from './winter-event'
import {masterScopedStatement,statementTime,type StatementScope,type StatementCharge,type StatementPayment} from './master/settlement-scope'
import type {loadWinterData} from './winter-data'

type Data=Awaited<ReturnType<typeof loadWinterData>>
type Account=ReturnType<typeof winterSettlementAccount>
export function winterStatementPayments(account:Account):StatementPayment[]{
 return account.payments.filter(row=>row.amount>0&&!row.reverses_id&&!account.reversed.has(row.id))
  .sort((a,b)=>statementTime(b.created_at)-statementTime(a.created_at))
  .map(row=>({id:row.id,at:row.created_at,label:`${new Date(row.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ${row.payment_method==='cash_at_venue'?'現金':'振込'} ${row.amount.toLocaleString('ja-JP')}円`}))
}

/** Derive a range from saved charge/reflection timestamps, not the competition day or names. */
export function winterScopedStatement(data:Data,ledger:WinterSettlementData,orgId:string,scope:StatementScope,now=new Date()){
 if(scope.date&&!data.competitions.some(row=>row.competition_date===scope.date))throw new Error('大会の競技日を選んでください')
 const account=winterSettlementAccount(data,ledger,orgId)
 const record=winterSettlementDraft(account,now)
 const payments=winterStatementPayments(account)
 const payment=scope.paymentId?payments.find(row=>row.id===scope.paymentId):undefined
 if(scope.paymentId&&!payment)throw new Error('選択した入金が取り消されたか、確認できません。読み直して選び直してください。')
 const cutoff=payment?statementTime(payment.at):-Infinity
 const charges:StatementCharge[]=[]
 const sourceById=new Map<string,{date:string;at:string}>()
 for(const line of account.lines){
  const request=ledger.requests.find(row=>row.id===line.id&&row.organization_id===orgId&&row.status==='reflected')
  const onsite=account.onsite.find(row=>row.id===line.id)
  const at=request?.reflected_at??onsite?.created_at
  // A submitted/pending timestamp is never evidence of a billed charge.
  if(!at)throw new Error('明細の反映日時を確認できません。全体の精算書で確認してください。')
  statementTime(at)
  sourceById.set(line.id,{date:line.competition.competition_date,at})
 }
 const corrected=new Map(record.document.document.lines.map(line=>[line.key,line]))
 for(const [id,source] of sourceById){
  const line=corrected.get(id)
  if(line)charges.push({...source,line})
 }
 // Corrections after payment on an older entry are new deltas, not the old charge again.
 // Independent corrections have no invented competition day and appear under all days.
 for(const adjustment of account.adjustments){
  if(statementTime(adjustment.created_at)<=cutoff)continue
  let remainder=adjustment.delta
  for(const item of adjustment.statement_items??[]){
   const source=sourceById.get(item.lineId)
   const original=account.lines.find(line=>line.id===item.lineId)
   if(!source||!original||original.action==='棄権'||original.action.startsWith('現場棄権'))continue
   remainder-=item.delta
   if(statementTime(source.at)>cutoff)continue
   if(item.delta)charges.push({date:source.date,at:adjustment.created_at,line:{key:`${adjustment.id}:${item.lineId}`,period:'締切後・大会期間中',action:'金額訂正',competition:original.competitionLabel,rider:original.rider,horse:original.horse,entryFee:0,serviceFee:0,difference:0,amount:item.delta,note:[original.isOp?'OP参加':'',item.note].filter(Boolean).join(' ／ ')}})
  }
  if(remainder)charges.push({date:null,at:adjustment.created_at,line:{key:adjustment.id,period:'締切後・大会期間中',action:'金額訂正',competition:'競技日指定なし',rider:'—',horse:'—',entryFee:0,serviceFee:0,difference:0,amount:remainder,note:adjustment.reason}})
 }
 return masterScopedStatement(record,charges,scope,payments,WINTER_EVENT_NAME)
}
