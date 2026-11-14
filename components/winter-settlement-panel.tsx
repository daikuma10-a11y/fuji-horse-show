"use client"
import {MasterAdminSettlementGroups,MasterAdminSettlementSummary} from "@/components/master/admin-settlement"
import {useEffect,useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {winterMasterSettlementAccount} from '@/lib/winter-master-settlement'
import {loadWinterData} from '@/lib/winter-data'
import {WinterSettlementOnlyHistory} from './winter-settlement-only-history'
import {WinterSettlementReceipts} from './winter-settlement-receipts'
import {WinterSavedSettlements} from './winter-saved-settlements'
import {WinterStatementScope} from './winter-settlement-scope'
import {WinterChargeAdjustmentForm} from './winter-charge-adjustment-form'
import {WinterExtraPaymentForm} from './winter-extra-payment-form'
import {WinterPaymentInstructionForm} from './winter-payment-instruction-form'
import {downloadMasterStatement} from '@/lib/settlement-document'
import {winterSettlementDraft,winterSettlementPrintHtml} from '@/lib/winter-settlement-print'
import {loadWinterSettlement,winterSettlementAccount,saveWinterAdvance,type WinterSettlementData,type WinterAdvance} from '@/lib/winter-settlement'
type Data=Awaited<ReturnType<typeof loadWinterData>>
const field='mt-2 min-h-14 w-full rounded-xl border-2 p-3 text-xl'
const button='min-h-14 rounded-xl bg-blue-800 px-5 py-3 text-xl font-bold text-white disabled:opacity-50'
const yen=(n:number)=>`${n.toLocaleString('ja-JP')}円`
function AdvanceForm({session,orgId,advance,onSession,onChanged,onBusy}:{session:AdminSession;orgId:string;advance:WinterAdvance|null;onSession:(s:AdminSession)=>void;onChanged:()=>void;onBusy:(busy:boolean)=>void}){
 const[paid,setPaid]=useState(advance?String(advance.paid_amount):''),[note,setNote]=useState(advance?.note??''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false),lock=useRef(false)
 useEffect(()=>{onBusy(busy);return()=>onBusy(false)},[busy,onBusy])
 async function save(){if(lock.current||uncertain)return;setError('');setMessage('');if(!/^\d+$/.test(paid)){setError('入金額を0円以上の整数で入力してください');return}if(!window.confirm(`確認した事前入金額を ${yen(Number(paid))} に保存しますか？`))return;lock.current=true;setBusy(true);try{const result=await saveWinterAdvance(session,orgId,Number(paid),note,advance);onSession(result.session);setMessage('事前入金額を保存し、保存内容の再読み込みを確認しました。');onChanged()}catch(e){setError(e instanceof Error?e.message:'保存を確認できません');setUncertain(true)}finally{lock.current=false;setBusy(false)}}
 return <section className="space-y-3 rounded-xl border-2 p-4"><h3 className="text-2xl font-bold">事前入金の確認・保存</h3><p>銀行口座などで確認した事前エントリー・馬匹登録料分の入金総額を入力してください。追加・変更分の入金は下の専用欄に記録してください。</p><fieldset disabled={busy||uncertain}><label className="block text-xl">確認した事前入金額（円）<input type="text" inputMode="numeric" className={field} value={paid} onChange={e=>setPaid(e.target.value)}/></label><label className="block text-xl">備考<input className={field} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label></fieldset>{advance&&<p>保存日時：{new Date(advance.updated_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>}{error&&<p role="alert" className="rounded-xl bg-red-100 p-3">{error}</p>}{message&&<p role="status">{message}</p>}{uncertain?<button className={button} onClick={onChanged}>保存内容を再読み込みして確認</button>:<button className={button} disabled={busy} onClick={()=>void save()}>{busy?'保存・確認中…':'事前入金額を保存'}</button>}</section>
}
export function WinterSettlementPanel({data,session,revision,onSession,onChanged,organizationId}:{organizationId?:string;data:Data;session:AdminSession;revision:number;onSession:(s:AdminSession)=>void;onChanged:()=>void}){
 const[ledger,setLedger]=useState<WinterSettlementData|null>(null),[chosenOrgId,setOrgId]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0)
 const orgId=organizationId??chosenOrgId
 const[paymentLocked,setPaymentLocked]=useState(false),[adjustmentLocked,setAdjustmentLocked]=useState(false)
 const[onsiteLocked,setOnsiteLocked]=useState(false)
 const[advanceBusy,setAdvanceBusy]=useState(false),[instructionBusy,setInstructionBusy]=useState(false)
 const[printing,setPrinting]=useState(false),printLock=useRef(false),mounted=useRef(true),tokenRef=useRef(session.accessToken)
 tokenRef.current=session.accessToken
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 async function print(format:'print'|'excel'='print'){
  if(printLock.current||!orgId)return
  const chosenOrg=orgId,popup=format==='print'?window.open('','_blank'):null
  if(!popup&&format==='print'){setError('印刷画面を開けません。ポップアップを許可してから再度お試しください。');return}
  if(popup){popup.opener=null;popup.document.write('<!doctype html><html lang="ja"><meta charset="utf-8"><title>Winter 精算履歴確認中</title><p>最新の保存済み履歴を確認しています…</p></html>');popup.document.close()}
  printLock.current=true;setPrinting(true);setError('')
  try{
   const verified=await verifyAdminSession(session)
   if(mounted.current)onSession(verified)
   const [freshData,freshLedger]=await Promise.all([loadWinterData(),loadWinterSettlement(verified.accessToken)])
   const freshAccount=winterSettlementAccount(freshData,freshLedger,chosenOrg)
   if(!mounted.current){popup?.close();return}
   if(format==='excel'){downloadMasterStatement(winterSettlementDraft(freshAccount));return}
   if(!popup||popup.closed)return
   popup.document.open();popup.document.write(winterSettlementPrintHtml(freshAccount));popup.document.close()
   // The print document contains only local text/styles. Reprint never writes a payment.
   await popup.document.fonts.ready
   if(!popup.closed){popup.focus();popup.print()}
  }catch(e){popup?.close();if(mounted.current)setError(e instanceof Error?e.message:'最新の精算内容を確認できません。印刷は行いません。')}
  finally{printLock.current=false;if(mounted.current)setPrinting(false)}
 }
 useEffect(()=>{let active=true;setLedger(null);setLoading(true);setError('');loadWinterSettlement(tokenRef.current).then(x=>{if(active)setLedger(x)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'精算を読み込めません')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[revision,retry])
 let account:ReturnType<typeof winterSettlementAccount>|null=null,accountError=''
 let groupAccounts:ReturnType<typeof winterSettlementAccount>[]=[]
 let detailLines:ReturnType<typeof winterMasterSettlementAccount>['document']['lines']=[]
 try{
  if(ledger&&orgId){
   account=winterSettlementAccount(data,ledger,orgId)
   if(!organizationId)detailLines=winterMasterSettlementAccount(account).document.lines
  }else if(ledger)groupAccounts=data.organizations.map(org=>winterSettlementAccount(data,ledger,org.id))
 }catch(e){accountError=e instanceof Error?e.message:'集計を確認できません'}
 if(organizationId)return <section className="space-y-4" aria-label="団体の入金情報">
   <h3 className="text-xl font-bold">入金情報</h3>
   {loading&&<p role="status">精算の記録を読み込んでいます…</p>}
   {(error||accountError)&&<p role="alert">{error||accountError}</p>}
   {account&&<><dl className="flex flex-wrap gap-5 rounded-xl border p-4">
     <div><dt>請求総額</dt><dd>{yen(account.total)}</dd></div>
     <div><dt>入金合計</dt><dd>{yen(account.advancePaid+account.extraPaid+account.refundTotal)}</dd></div>{account.refundTotal>0&&<div><dt>返金済み</dt><dd>{yen(account.refundTotal)}</dd></div>}
     <div><dt>入金状況</dt><dd className="font-bold">{account.remaining<0?'過入金 '+yen(-account.remaining):account.remaining>0?(account.advancePaid+account.extraPaid?'不足 ':'未入金 ')+yen(account.remaining):account.total?'入金済み':'請求なし'}</dd></div>
   </dl><fieldset disabled={paymentLocked}><AdvanceForm key={orgId+':'+(account.advance?.updated_at??'new')} session={session} orgId={orgId} advance={account.advance??null} onBusy={setAdvanceBusy} onSession={onSession} onChanged={onChanged}/></fieldset>
   <details><summary className="cursor-pointer font-bold">入金・過入金の返金・履歴の訂正</summary><fieldset disabled={advanceBusy}><WinterExtraPaymentForm session={session} orgId={orgId} payments={account.payments} remaining={account.remaining} onLocked={setPaymentLocked} onSession={onSession} onChanged={onChanged}/></fieldset></details></>}
   <button className={button} disabled={loading||advanceBusy||paymentLocked} onClick={()=>setRetry(n=>n+1)}>入金記録を読み直す</button>
 </section>
 return <section className="space-y-5 rounded-xl border-2 bg-card p-5"><h2 className="text-2xl font-bold">精算・事前入金確認</h2><p className="rounded-xl bg-blue-50 p-4 text-lg">現在は登録済みの競技料金・馬匹登録料と事前入金の確認ができます。追加・変更分の確認済み入金も記録できます。請求額の訂正と、選手向け精算内容の保存・印刷にも対応しています。その他料金がある場合は本部で理由を付けて加算してください。</p>{loading&&<p role="status">Winterの精算履歴を読み込んでいます…</p>}{error&&<p role="alert" className="bg-red-100 p-4">{error}</p>}{!loading&&<button className={button} disabled={paymentLocked||adjustmentLocked||onsiteLocked||advanceBusy||instructionBusy} onClick={()=>setRetry(x=>x+1)}>精算履歴を再読み込み</button>}{!orgId&&ledger&&!loading&&!accountError&&<MasterAdminSettlementGroups rows={groupAccounts.map(value=>({id:value.organization.id,name:value.organization.name,extraTotal:value.extraTotal,hasAdvance:!!value.advance,balance:{total:value.total,paid:value.advancePaid+value.extraPaid,remaining:value.remaining},warnings:value.warnings}))} balanceTotals={groupAccounts.reduce((sum,value)=>({total:sum.total+value.total,paid:sum.paid+value.advancePaid+value.extraPaid,remaining:sum.remaining+value.remaining}),{total:0,paid:0,remaining:0})} grandTotal={groupAccounts.reduce((sum,value)=>sum+value.total,0)} receptionTotal={groupAccounts.reduce((sum,value)=>sum+value.extraTotal,0)} disabled={printing||paymentLocked||adjustmentLocked||onsiteLocked||advanceBusy||instructionBusy} onSelect={setOrgId}/>}{!data.organizations.length&&<p>「人馬名簿」で今大会の参加人馬を登録すると団体が表示されます。</p>}{accountError&&<p role="alert" className="bg-red-100 p-4">{accountError}</p>}{account&&<><button type="button" disabled={loading||printing||paymentLocked||adjustmentLocked||onsiteLocked||advanceBusy||instructionBusy} onClick={()=>setOrgId('')} className="print-hide w-fit rounded-xl border-2 border-border bg-card px-5 py-3 text-xl font-bold">← 団体一覧へ</button><MasterAdminSettlementSummary name={account.organization.name} due={account.remaining} normalTotal={account.normalTotal} advancePaid={account.advancePaid} advanceRecorded={!!account.advance} advanceTarget={account.initialTotal} extraTotal={account.extraTotal} extraPaid={account.extraPaid+account.refundTotal} warnings={account.warnings} summaryRows={[...(account.refundTotal?[{label:'返金済み',value:yen(account.refundTotal)}]:[]),{label:`馬匹登録料（${account.horseRegistration.count}頭 × ${yen(account.horseRegistration.unitFee)}）`,value:yen(account.horseRegistration.total)},{label:'事前料金合計',value:yen(account.initialTotal)},{label:'金額訂正合計',value:yen(account.adjustmentTotal)},{label:'請求総額',value:yen(account.total)}]} advanceAction={<button type="button" disabled={paymentLocked||adjustmentLocked||onsiteLocked||instructionBusy} onClick={()=>document.getElementById('winter-admin-advance')?.scrollIntoView({block:'start'})} className="min-h-12 rounded-lg border border-primary px-3 font-bold text-primary">事前入金を記録・修正</button>}/>
<button className={button} disabled={printing||loading||paymentLocked||adjustmentLocked||onsiteLocked||advanceBusy||instructionBusy} onClick={()=>void print()}>{printing?'最新内容を確認・印刷中…':'精算書を印刷（確認用）'}</button><button className={button} disabled={printing||loading||paymentLocked||adjustmentLocked||onsiteLocked||advanceBusy||instructionBusy} onClick={()=>void print('excel')}>精算書をExcelに保存（確認用）</button><p>保存済みの内容を読み直して印刷します。入力途中の入金額・支払方法・振込先・備考は印刷に含まれません。</p>
{ledger&&<WinterSettlementReceipts key={orgId} session={session} data={data} ledger={ledger} account={account}/>}
<WinterStatementScope key={`scope:${orgId}:${revision}:${retry}`} session={session} account={account} dates={[...new Set(data.competitions.map(row=>row.competition_date))].sort()} disabled={printing||loading||paymentLocked||adjustmentLocked||onsiteLocked||advanceBusy||instructionBusy} onSession={onSession}/>
<details className="rounded-xl border-2 p-4"><summary className="cursor-pointer text-xl">馬匹登録料の対象馬（{account.horseRegistration.count}頭）</summary><p className="py-2">この団体の保存済み参加名簿を集計しています。出場する競技数・騎乗選手数では増えません。参加チェックを変更すると、再読み込み後の頭数と料金も変わります。</p><ul className="list-disc pl-6">{account.horseRegistration.horses.map(h=><li key={h.id}>{h.name}</li>)}</ul>{!account.horseRegistration.count&&<p>対象馬はありません。</p>}</details><p className="text-xl">保存済み支払方法：{account.instruction?account.instruction.payment_method==='bank_transfer'?'後日振込':'当日現金':'未設定'}（入金済みを示すものではありません）</p><fieldset disabled={paymentLocked||adjustmentLocked||onsiteLocked||advanceBusy}><WinterPaymentInstructionForm key={`${orgId}:${account.instruction?.updated_at??'new'}`} session={session} orgId={orgId} instruction={account.instruction??null} onBusy={setInstructionBusy} onSession={onSession} onChanged={onChanged}/></fieldset><fieldset id="winter-admin-advance" disabled={paymentLocked||adjustmentLocked||onsiteLocked||instructionBusy}><AdvanceForm key={`${orgId}:${account.advance?.updated_at??'new'}`} session={session} orgId={orgId} advance={account.advance??null} onBusy={setAdvanceBusy} onSession={onSession} onChanged={onChanged}/></fieldset><fieldset disabled={adjustmentLocked||onsiteLocked||advanceBusy||instructionBusy}><WinterExtraPaymentForm key={orgId} session={session} orgId={orgId} payments={account.payments} remaining={account.remaining} onLocked={setPaymentLocked} onSession={onSession} onChanged={onChanged}/></fieldset><fieldset disabled={paymentLocked||onsiteLocked||advanceBusy||instructionBusy}><WinterChargeAdjustmentForm key={orgId} session={session} orgId={orgId} total={account.total} previousId={account.latestAdjustmentId} adjustments={account.adjustments} onLocked={setAdjustmentLocked} onSession={onSession} onChanged={onChanged}/></fieldset><fieldset disabled={paymentLocked||adjustmentLocked||advanceBusy||instructionBusy}><WinterSettlementOnlyHistory key={`onsite:${orgId}`} account={account} session={session} onSession={onSession} onChanged={onChanged} onLocked={setOnsiteLocked}/></fieldset><WinterSavedSettlements key={`saved:${orgId}`} session={session} orgId={orgId} revision={revision} onSession={onSession}/><h3 className="text-2xl font-bold">追加・変更の明細</h3>{!detailLines.length?<p>反映済みの追加・変更はありません。</p>:<div className="overflow-x-auto"><table className="w-full border-collapse text-lg"><thead><tr>{['区分','競技','選手','馬','備考','金額'].map(x=><th key={x} scope="col" className="border bg-blue-50 p-2 text-left">{x}</th>)}</tr></thead><tbody>{detailLines.map(x=><tr key={x.key}><td className="border p-2">{x.action}</td><td className="border p-2">{x.competition}</td><td className="border p-2">{x.rider}</td><td className="border p-2">{x.horse}</td><td className="border p-2">{x.note||'—'}</td><td className="whitespace-nowrap border p-2 text-right">{yen(x.amount)}</td></tr>)}</tbody></table></div>}</>}</section>
}
