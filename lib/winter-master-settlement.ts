import {validateWinterCheckoutAccount,validateWinterSettlementRecord,type WinterCheckoutAccount,type WinterSettlementRecord} from './winter-checkout'
import type {MasterSettlementAccount,MasterSavedSettlement} from './master/self-settlement'
const yen=(amount:number)=>'¥'+amount.toLocaleString('ja-JP')
export function winterMasterSettlementAccount(value:WinterCheckoutAccount,issuedAt=new Date(),method?:WinterSettlementRecord['payment_method']):MasterSettlementAccount{
 const account=validateWinterCheckoutAccount(value)
 if(!Number.isFinite(issuedAt.getTime()))throw new Error('精算書の発行日時を確認してください')
 const ids=new Set<string>()
 const lines=account.lines.map(line=>{
  if(!line.id||ids.has(line.id)||!Number.isSafeInteger(line.amount)||[line.action,line.competitionLabel,line.rider,line.horse].some(text=>typeof text!=='string'))throw new Error('精算書の明細を確認できません')
  ids.add(line.id)
  return {key:line.id,period:'締切後・大会期間中',action:line.action,competition:line.competitionLabel,rider:line.rider,horse:line.horse,entryFee:0,serviceFee:0,difference:0,amount:line.amount,note:''}
 })
 if(lines.reduce((sum,line)=>sum+line.amount,0)!==account.extraTotal)throw new Error('精算書の明細合計が一致しません')
 const payment=method??account.instruction?.payment_method
 return {normalLines:[],warnings:[...account.warnings],document:{organization:account.organization.name,organizationKey:account.organization.id,issuedDate:issuedAt.toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo'}),normalTotal:account.normalTotal,advancePaid:account.advancePaid,advanceRecorded:!!account.advance,extraTotal:account.extraTotal,extraPaid:account.extraPaid,due:account.remaining,method:payment==='bank_transfer'?'後日振込':payment==='cash_at_venue'?'当日現金':payment==='no_payment_due'?'お支払い不要':'未設定',bankDetails:payment==='bank_transfer'?account.instruction?.bank_details??'':'',lines,summaryRows:[{label:`馬匹登録料（${account.horseRegistration.count}頭）`,value:`${account.horseRegistration.count}頭 × ${yen(account.horseRegistration.unitFee)} ＝ ${yen(account.horseRegistration.total)}`},{label:'金額訂正合計',value:yen(account.adjustmentTotal)},{label:'請求総額',value:yen(account.total)}]}}
}
export function winterMasterSavedSettlement(value:WinterSettlementRecord,orgId:string):MasterSavedSettlement{
 const record=validateWinterSettlementRecord(value,orgId)
 const document=winterMasterSettlementAccount(record.account,new Date(record.created_at),record.payment_method)
 document.document.notice=`保存済み精算内容／精算番号：${record.id}。現金・振込の選択は入金済みを示しません。この精算書は領収書ではありません。`
 return {id:record.id,organization_key:record.organization_key,confirmed_by:record.confirmer_name,payment_method:record.payment_method,amount:record.account.remaining,created_at:record.created_at,document}
}
