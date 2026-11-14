import type {MasterSavedSettlement,MasterSettlementDocument} from './self-settlement'
import {showSettlementLine} from './self-settlement'

export type StatementScope={date:string;paymentId:string}
export type StatementPayment={id:string;at:string;label:string}
export type StatementCharge={date:string|null;at:string;line:MasterSettlementDocument['lines'][number]}
export const statementTime=(value:string)=>{
 const time=Date.parse(value)
 if(!Number.isFinite(time))throw new Error('明細の反映日時を確認できません。全体の精算書で確認してください。')
 return time
}

/** A read-only extract: never allocate a club-level payment to an individual entry. */
export function masterScopedStatement(record:MasterSavedSettlement,charges:StatementCharge[],scope:StatementScope,payments:StatementPayment[],eventName:string){
 const payment=scope.paymentId?payments.find(row=>row.id===scope.paymentId):undefined
 if(scope.paymentId&&!payment)throw new Error('選択した入金が取り消されたか、確認できません。読み直して選び直してください。')
 const cutoff=payment?statementTime(payment.at):-Infinity
 const candidates=charges.filter(charge=>statementTime(charge.at)>cutoff&&showSettlementLine(charge.line))
 const selected=candidates.filter(charge=>!scope.date||charge.date===scope.date)
 const lines=selected.map(charge=>({...charge.line}))
 const total=lines.reduce((sum,line)=>sum+line.amount,0)
 if(!Number.isSafeInteger(total)||lines.some(line=>!Number.isSafeInteger(line.amount)))throw new Error('対象明細の金額を確認できません')
 const dateLabel=scope.date?scope.date.replaceAll('-','/'):'全競技日'
 const label=`対象競技日：${dateLabel}`
 const period=payment?`対象範囲：${payment.label} の入金後に反映した追加・変更`:'対象範囲：追加・変更の全履歴'
 const unassigned=candidates.filter(charge=>scope.date&&!charge.date)
 const warnings=[...record.document.warnings,...(unassigned.length?[`競技日を特定できない金額訂正が${unassigned.length}件あります。「全競技日」で確認してください。`]:[])]
 return {...record,id:'scoped-draft',draft:true,document:{...record.document,warnings,document:{...record.document.document,
  title:'Fuji Horse Show 追加・変更明細書',
  notice:[eventName,label,period,'対象明細合計と団体全体のお支払い残額を記載しています。領収書ではありません。'].join('\n'),
  scope:{label,total},lines,
 }}} satisfies MasterSavedSettlement
}

/** Prefer tomorrow during the event; keep every event date selectable. */
export function defaultStatementDate(dates:string[],now=new Date()){
 const today=now.toLocaleDateString('en-CA',{timeZone:'Asia/Tokyo'})
 const sorted=[...dates].sort()
 return sorted.find(date=>date>today)??sorted.find(date=>date===today)??sorted.at(-1)??''
}
