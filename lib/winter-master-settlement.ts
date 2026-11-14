import {winterCheckoutBankDetails,validateWinterCheckoutAccount,validateWinterSettlementRecord,type WinterCheckoutAccount,type WinterSettlementRecord} from './winter-checkout'
import {showSettlementLine,settlementOpNote} from './master/self-settlement'
import type {MasterSettlementAccount,MasterSavedSettlement} from './master/self-settlement'
const yen=(amount:number)=>'¥'+amount.toLocaleString('ja-JP')
export function winterMasterSettlementAccount(value:WinterCheckoutAccount,issuedAt=new Date(),method?:WinterSettlementRecord['payment_method']):MasterSettlementAccount{
 const account=validateWinterCheckoutAccount(value)
 if(!Number.isFinite(issuedAt.getTime()))throw new Error('精算書の発行日時を確認してください')
 const ids=new Set<string>()
 const lines=account.lines.map(line=>{
  if(!line.id||ids.has(line.id)||!Number.isSafeInteger(line.amount)||[line.action,line.competitionLabel,line.rider,line.horse].some(text=>typeof text!=='string'))throw new Error('精算書の明細を確認できません')
  ids.add(line.id)
  return {key:line.id,period:'締切後・大会期間中',action:line.action,competition:line.competitionLabel,rider:line.rider,horse:line.horse,entryFee:0,serviceFee:0,difference:0,amount:line.amount,note:settlementOpNote(line.isOp)}
 })
 if(lines.reduce((sum,line)=>sum+line.amount,0)!==account.extraTotal)throw new Error('精算書の明細合計が一致しません')
 // Itemize only explicitly linked corrections; free-text reasons never determine a charge.
 const byId=new Map(lines.map(line=>[line.key,line]))
 const omitIfZero=new Set<string>()
 const otherCorrections:{label:string;value:string;amount:number;kind:'adjustment'}[]=[]
 if(account.adjustments.reduce((sum,row)=>sum+row.delta,0)!==account.adjustmentTotal)throw new Error('金額訂正の合計が一致しません')
 for(const adjustment of account.adjustments){
  let remainder=adjustment.delta
  const items=adjustment.statement_items
  if(items?.length){
   if(new Set(items.map(item=>item.lineId)).size!==items.length ||
      items.some(item=>!item.lineId||!Number.isSafeInteger(item.delta)||!item.note?.trim()) ||
      items.reduce((sum,item)=>sum+item.delta,0)!==adjustment.delta)throw new Error('訂正の内訳を確認してください')
   for(const item of items){
    const line=byId.get(item.lineId)
    // A subsequently cancelled request may no longer be part of the current statement.
    if(!line||!showSettlementLine(line))continue
    if(item.omitIfZero===true)omitIfZero.add(line.key)
    line.amount+=item.delta
    line.note=[line.note,item.note].filter(Boolean).join(' ／ ')
    remainder-=item.delta
   }
  }
  if(remainder)otherCorrections.push({label:'金額訂正：'+adjustment.reason,value:yen(remainder),amount:remainder,kind:'adjustment'})
 }
 const statementLines=lines.filter(line=>showSettlementLine(line) && (line.amount!==0 || !omitIfZero.has(line.key)))
 const billedExtra=statementLines.reduce((sum,line)=>sum+line.amount,0)
 const payment=method??account.instruction?.payment_method
 return {normalLines:[],warnings:[...account.warnings],document:{organization:account.organization.name,organizationKey:account.organization.id,issuedDate:issuedAt.toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'}),normalTotal:account.normalTotal,advancePaid:account.advancePaid,advanceRecorded:!!account.advance,extraTotal:billedExtra,extraPaid:account.extraPaid+(account.refundTotal??0),due:account.remaining,method:payment==='bank_transfer'?'後日振込':payment==='cash_at_venue'?'当日現金':payment==='no_payment_due'?'お支払い不要':'未設定',bankDetails:payment==='bank_transfer'?winterCheckoutBankDetails(account):'',lines:statementLines,summaryRows:[{kind:'initial',amount:account.initialTotal,label:'事前料金合計',value:yen(account.initialTotal)},...(account.refundTotal?[{label:'返金済み',value:yen(account.refundTotal),amount:account.refundTotal,kind:'refund' as const}]:[]),{kind:'horse',amount:account.horseRegistration.total,label:`馬匹登録料（${account.horseRegistration.count}頭）`,value:`${account.horseRegistration.count}頭 × ${yen(account.horseRegistration.unitFee)} ＝ ${yen(account.horseRegistration.total)}`},...otherCorrections,{label:'請求総額',value:yen(account.total),amount:account.total,kind:'total'}]}}
}
export function winterMasterSavedSettlement(value:WinterSettlementRecord,orgId:string):MasterSavedSettlement{
 const record=validateWinterSettlementRecord(value,orgId)
 const document=winterMasterSettlementAccount(record.account,new Date(record.created_at),record.payment_method)
 document.document.notice=`精算番号：${record.id}`
 return {id:record.id,organization_key:record.organization_key,confirmed_by:record.confirmer_name,payment_method:record.payment_method,amount:record.account.remaining,created_at:record.created_at,document}
}
