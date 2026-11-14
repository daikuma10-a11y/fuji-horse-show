import {formatYen} from '../fees'
import type {MasterSettlementDocument} from './self-settlement'

type SummaryRow = {
 kind: 'normal'|'horse'|'initial'|'extra'|'adjustment'|'total'|'due'|'advance'|'paid'|'refund'|'overpayment'|'refundDue'|'other'
 label:string
 value:string
 amount?:number
}
const money=(kind:SummaryRow['kind'],label:string,amount:number):SummaryRow=>({kind,label,amount,value:formatYen(amount)})

/** Display rows use the saved amounts. Credits and refunds are explanatory, never new charges. */
export function masterSettlementSummary(document:MasterSettlementDocument){
 const detail=document.summaryRows??[]
 const horses=detail.filter(row=>row.kind==='horse')
 const initial=detail.find(row=>row.kind==='initial')?.amount??document.normalTotal+horses.reduce((sum,row)=>sum+(row.amount??0),0)
 const adjustments=detail.filter(row=>row.kind==='adjustment')
 const total=detail.find(row=>row.kind==='total')?.amount??initial+document.extraTotal+adjustments.reduce((sum,row)=>sum+(row.amount??0),0)
 const refunded=detail.filter(row=>row.kind==='refund').reduce((sum,row)=>sum+(row.amount??0),0)
 const refundDue=Math.max(0,-document.due)
 const charges:SummaryRow[]=[
  money('normal','事前エントリー合計',document.normalTotal),
  ...horses.map(row=>({...row,kind:'horse' as const})),
  money('initial','事前料金合計',initial),
  money('extra','追加・変更の合計',document.extraTotal),
  ...adjustments.map(row=>({...row,kind:'adjustment' as const})),
  money('total','請求総額',total),
  money('due','お支払い額',Math.max(0,document.due)),
 ]
 const payments:SummaryRow[]=[
  money('advance','事前分の入金済み',document.advancePaid),
  money('paid','追加・変更分の入金済み',document.extraPaid),
 ]
 if(!document.advanceRecorded)payments[0].value+='（未確認）'
 if(refunded)payments.push(money('refund','返金済み',refunded))
 const overpaid=Math.max(0,document.advancePaid-initial)
 if(overpaid){
  const offset=Math.max(0,overpaid-refunded-refundDue)
  const row=money('overpayment','事前過入金・返金対象分',overpaid)
  if(offset)row.value+=`\n今回精算で差引済み ${formatYen(offset)}`
  payments.push(row)
 }
 if(refundDue)payments.push(money('refundDue','ご返金額（未返金）',refundDue))
 payments.push(...detail.filter(row=>!row.kind).map(row=>({...row,kind:'other' as const})))
 return {charges,payments}
}
