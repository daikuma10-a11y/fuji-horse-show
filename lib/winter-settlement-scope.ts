import {winterSettlementAccount,type WinterSettlementData} from './winter-settlement'
import {winterScopedCheckoutStatement,winterContextPayments,type WinterStatementContext} from './winter-statement-context'
import type {StatementScope} from './master/settlement-scope'
import type {loadWinterData} from './winter-data'
type Data=Awaited<ReturnType<typeof loadWinterData>>
type Account=ReturnType<typeof winterSettlementAccount>
function payments(account:Account){return account.payments.map(row=>({id:row.id,at:row.created_at,amount:row.amount,method:row.payment_method,reversesId:row.reverses_id}))}
export function winterStatementPayments(account:Account){return winterContextPayments({payments:payments(account)})}
export function winterScopedStatement(data:Data,ledger:WinterSettlementData,orgId:string,scope:StatementScope,now=new Date()){
 const account=winterSettlementAccount(data,ledger,orgId)
 const requests=new Map(ledger.requests.filter(row=>row.organization_id===orgId&&row.status==='reflected').map(row=>[row.id,row]))
 const onsite=new Map(account.onsite.map(row=>[row.id,row]))
 const sources=account.lines.map(line=>{
  const at=requests.get(line.id)?.reflected_at??onsite.get(line.id)?.created_at
  if(!at)throw new Error('明細の反映日時を確認できません。全体の精算書で確認してください。')
  return {id:line.id,date:line.competition.competition_date,at}
 })
 const context:WinterStatementContext={eventId:data.eventId,orgId,dates:[...new Set(data.competitions.map(row=>row.competition_date))].sort(),sources,adjustments:account.adjustments.map(row=>({id:row.id,at:row.created_at})),payments:payments(account)}
 return winterScopedCheckoutStatement(account,context,scope,now)
}
