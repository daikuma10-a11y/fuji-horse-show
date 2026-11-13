import type {loadWinterData} from './winter-data'
import {winterCompetitionLabel,winterPickerOrder,winterAffiliatedOrganizations} from './winter-display-order'
import type {winterSettlementAccount,WinterSettlementData} from './winter-settlement'
import type {ReceiptSourceItem} from './rider-receipt'
import type {ReceiptInput,SettlementReceipt} from './settlement-receipts'
import {WINTER_EVENT_ID} from './winter-event'
import {riderReceiptChoices} from './rider-receipt'

type Data=Awaited<ReturnType<typeof loadWinterData>>
type Account=ReturnType<typeof winterSettlementAccount>
export function winterReceiptModel(data:Data,ledger:WinterSettlementData,account:Account,receipts:SettlementReceipt[]){
  const group=account.organization.id
  if(receipts.some(r=>r.event_id!==WINTER_EVENT_ID || r.organization_key!==group))throw Error('領収書の大会・団体を確認してください')
  const sources:ReceiptSourceItem[]=[]
  const riders=new Map(data.riders.map(p=>[p.id,p]))
  const horses=new Map([...data.horses,...(data.historicalHorses??[])].map(p=>[p.id,p]))
  function add(key:string,amount:number,title:string,riderId='',horseId=''){
    if(amount<=0)return
    const rider=riders.get(riderId)?.name??'', horse=horses.get(horseId)?.name??''
    const label=[title,rider,horse].filter(Boolean).join(' ／ ')
    sources.push({key,amount,paid:amount,label,riderId,rider,horseId,horse})
  }
  for(const entry of ledger.initial){
    const input=entry.inputs
    if((input.billingOrganizationId??input.organizationId)!==group)continue
    const comp=data.competitions.find(c=>c.id===input.competitionId)!
    add('normal:entry:'+entry.id,entry.entry_fee,winterCompetitionLabel(comp),input.riderId,input.horseId)
  }
  for(const h of account.horseRegistration.horses)add('normal:horse:'+h.id,account.horseRegistration.unitFee,'馬匹登録料','',h.id)
  for(const req of ledger.requests){
    if(req.organization_id!==group||req.status!=='reflected')continue
    const comp=data.competitions.find(c=>c.id===req.target_competition_id)!
    add('request:'+req.id,req.fee_amount,(req.request_type==='add'?'追加':'変更')+' '+winterCompetitionLabel(comp),req.rider_id,req.horse_id)
  }
  for(const row of account.onsite){
    if(row.reverses_id||account.onsiteReversed.has(row.id))continue
    const comp=data.competitions.find(c=>c.id===row.inputs.competitionId)!
    add('manual:'+row.id,row.fee_amount,(row.action_type==='change'?'現場変更':'現場追加')+' '+winterCompetitionLabel(comp),row.inputs.riderId,row.inputs.horseId)
  }
  for(const row of account.adjustments)add('adjustment:'+row.id,row.delta,'金額訂正 ／ '+row.reason)
  const groups=winterAffiliatedOrganizations(data), order=winterPickerOrder(groups)
  const orgNames=new Map(groups.map(o=>[o.id,o.name]))
  const scopeOptions=(['rider','horse'] as const).flatMap(kind=>{
    const ids=new Set(sources.map(s=>kind==='rider'?s.riderId:s.horseId))
    const rows=kind==='rider'?[...riders.values()]:[...horses.values()]
    return rows.filter(p=>ids.has(p.id)).sort(order).map(p=>({kind,id:p.id,name:p.name,group:orgNames.get(p.organization_id)??''}))
  })
  const issued=receipts.reduce((sum,r)=>sum+r.amount,0)
  const availableAmount=Math.max(0,Math.min(account.total,account.advancePaid+account.extraPaid)-issued)
  return {sources,availableAmount,scopeOptions}
}

export function verifyWinterReceipt(input:ReceiptInput,model:ReturnType<typeof winterReceiptModel>,receipts:SettlementReceipt[]){
  const choices=new Map(riderReceiptChoices(model.sources,receipts).map(c=>[c.key,c]))
  const items=input.document_items??[]
  if(!items.length || input.selected_items?.length || input.amount>model.availableAmount ||
     items.reduce((sum,i)=>sum+i.amount,0)!==input.amount || new Set(items.map(i=>i.key)).size!==items.length ||
     items.some(i=>{const c=choices.get(i.key);return !c||c.label!==i.label||i.limit!==c.limit||i.amount<=0||i.amount>c.remaining}))
    throw Error('入金・明細・発行履歴が変わりました。読み直して金額を確認してください。')
}

// Older installations already protect advance-payment receipts in the common archive.
// Enable other funds only when the Winter validator can confirm their available balance.
export function winterReceiptCoverage(model:ReturnType<typeof winterReceiptModel>,account:Account,receipts:SettlementReceipt[],balance:number|null){
  if(balance!==null)return {...model,availableAmount:Math.min(model.availableAmount,balance)}
  const sources=model.sources.filter(s=>s.key.startsWith('normal:'))
  const issued=receipts.reduce((sum,r)=>sum+r.amount,0)
  const eligible=Math.min(account.advancePaid,account.initialTotal)
  const availableAmount=eligible>account.total?0:Math.max(0,Math.min(model.availableAmount,eligible-issued))
  return {...model,sources,availableAmount,scopeOptions:model.scopeOptions.filter(o=>sources.some(s=>o.kind==='rider'?s.riderId===o.id:s.horseId===o.id))}
}
