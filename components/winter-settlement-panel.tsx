"use client"
import {useEffect,useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {loadWinterData} from '@/lib/winter-data'
import {winterSettlementPrintHtml} from '@/lib/winter-settlement-print'
import {loadWinterSettlement,winterSettlementAccount,saveWinterAdvance,type WinterSettlementData,type WinterAdvance} from '@/lib/winter-settlement'
type Data=Awaited<ReturnType<typeof loadWinterData>>
const field='mt-2 min-h-14 w-full rounded-xl border-2 p-3 text-xl'
const button='min-h-14 rounded-xl bg-blue-800 px-5 py-3 text-xl font-bold text-white disabled:opacity-50'
const yen=(n:number)=>`${n.toLocaleString('ja-JP')}円`
function AdvanceForm({session,orgId,advance,onSession,onChanged}:{session:AdminSession;orgId:string;advance:WinterAdvance|null;onSession:(s:AdminSession)=>void;onChanged:()=>void}){
 const[paid,setPaid]=useState(advance?String(advance.paid_amount):''),[note,setNote]=useState(advance?.note??''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[uncertain,setUncertain]=useState(false),lock=useRef(false)
 async function save(){if(lock.current||uncertain)return;setError('');setMessage('');if(!/^\d+$/.test(paid)){setError('入金額を0円以上の整数で入力してください');return}if(!window.confirm(`確認した事前入金額を ${yen(Number(paid))} に保存しますか？`))return;lock.current=true;setBusy(true);try{const result=await saveWinterAdvance(session,orgId,Number(paid),note,advance);onSession(result.session);setMessage('事前入金額を保存し、保存内容の再読み込みを確認しました。');onChanged()}catch(e){setError(e instanceof Error?e.message:'保存を確認できません');setUncertain(true)}finally{lock.current=false;setBusy(false)}}
 return <section className="space-y-3 rounded-xl border-2 p-4"><h3 className="text-2xl font-bold">事前入金の確認・保存</h3><p>銀行口座などで確認した事前エントリー分の入金総額を入力してください。追加・変更分の入金や支払方法の確定はまだ行いません。</p><fieldset disabled={busy||uncertain}><label className="block text-xl">確認した事前入金額（円）<input type="text" inputMode="numeric" className={field} value={paid} onChange={e=>setPaid(e.target.value)}/></label><label className="block text-xl">備考<input className={field} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label></fieldset>{advance&&<p>保存日時：{new Date(advance.updated_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>}{error&&<p role="alert" className="rounded-xl bg-red-100 p-3">{error}</p>}{message&&<p role="status">{message}</p>}{uncertain?<button className={button} onClick={onChanged}>保存内容を再読み込みして確認</button>:<button className={button} disabled={busy} onClick={()=>void save()}>{busy?'保存・確認中…':'事前入金額を保存'}</button>}</section>
}
export function WinterSettlementPanel({data,session,revision,onSession,onChanged}:{data:Data;session:AdminSession;revision:number;onSession:(s:AdminSession)=>void;onChanged:()=>void}){
 const[ledger,setLedger]=useState<WinterSettlementData|null>(null),[orgId,setOrgId]=useState(''),[error,setError]=useState(''),[loading,setLoading]=useState(true),[retry,setRetry]=useState(0)
 const[printing,setPrinting]=useState(false),printLock=useRef(false),mounted=useRef(true),tokenRef=useRef(session.accessToken)
 tokenRef.current=session.accessToken
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 async function print(){
  if(printLock.current||!orgId)return
  const chosenOrg=orgId,popup=window.open('','_blank')
  if(!popup){setError('印刷画面を開けません。ポップアップを許可してから再度お試しください。');return}
  popup.opener=null;popup.document.write('<!doctype html><html lang="ja"><meta charset="utf-8"><title>Winter 精算履歴確認中</title><p>最新の保存済み履歴を確認しています…</p></html>');popup.document.close()
  printLock.current=true;setPrinting(true);setError('')
  try{
   const verified=await verifyAdminSession(session)
   if(mounted.current)onSession(verified)
   const [freshData,freshLedger]=await Promise.all([loadWinterData(),loadWinterSettlement(verified.accessToken)])
   const freshAccount=winterSettlementAccount(freshData,freshLedger,chosenOrg)
   if(popup.closed||!mounted.current){popup.close();return}
   popup.document.open();popup.document.write(winterSettlementPrintHtml(freshAccount));popup.document.close()
   // The print document contains only local text/styles. Reprint never writes a payment.
   await popup.document.fonts.ready
   if(!popup.closed){popup.focus();popup.print()}
  }catch(e){popup.close();if(mounted.current)setError(e instanceof Error?e.message:'最新の精算内容を確認できません。印刷は行いません。')}
  finally{printLock.current=false;if(mounted.current)setPrinting(false)}
 }
 useEffect(()=>{let active=true;setLedger(null);setLoading(true);setError('');loadWinterSettlement(tokenRef.current).then(x=>{if(active)setLedger(x)}).catch(e=>{if(active)setError(e instanceof Error?e.message:'精算を読み込めません')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[revision,retry])
 let account:ReturnType<typeof winterSettlementAccount>|null=null,accountError=''
 try{if(ledger&&orgId)account=winterSettlementAccount(data,ledger,orgId)}catch(e){accountError=e instanceof Error?e.message:'集計を確認できません'}
 return <section className="space-y-5 rounded-xl border-2 bg-card p-5"><h2 className="text-2xl font-bold">精算・事前入金確認</h2><p className="rounded-xl bg-blue-50 p-4 text-lg">現在は登録済みの競技料金と事前入金の確認ができます。入厩料などを含む最終請求額、追加分の入金、選手向け精算確定・印刷は準備中です。</p>{loading&&<p role="status">Winterの精算履歴を読み込んでいます…</p>}{error&&<p role="alert" className="bg-red-100 p-4">{error}</p>}{!loading&&<button className={button} onClick={()=>setRetry(x=>x+1)}>精算履歴を再読み込み</button>}<label className="block text-xl">精算を確認する団体<select className={field} disabled={loading||printing||!data.organizations.length} value={orgId} onChange={e=>setOrgId(e.target.value)}><option value="">団体を選択</option>{data.organizations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>{!data.organizations.length&&<p>「人馬名簿」で今大会の参加人馬を登録すると団体が表示されます。</p>}{accountError&&<p role="alert" className="bg-red-100 p-4">{accountError}</p>}{account&&<><h3 className="text-2xl font-bold">{account.organization.name}</h3>{account.warnings.map(x=><p key={x} role="status" className="rounded-xl bg-orange-100 p-3">{x}</p>)}<dl className="grid grid-cols-2 gap-3 rounded-xl border-2 p-4 text-xl"><dt>事前エントリー合計</dt><dd className="text-right">{yen(account.normalTotal)}</dd><dt>追加・変更合計</dt><dd className="text-right">{yen(account.extraTotal)}</dd><dt>確認済み事前入金</dt><dd className="text-right">{account.advance?yen(account.advancePaid):'未確認'}</dd><dt>登録済み競技料金の残額</dt><dd className="text-right font-bold">{yen(account.remaining)}</dd></dl><button className={button} disabled={printing||loading} onClick={()=>void print()}>{printing?'最新内容を確認・印刷中…':'確認用の精算書を印刷'}</button><p>保存済みの内容を読み直して印刷します。入力途中の入金額・備考は印刷に含まれません。</p><AdvanceForm key={`${orgId}:${account.advance?.updated_at??'new'}`} session={session} orgId={orgId} advance={account.advance??null} onSession={onSession} onChanged={onChanged}/><h3 className="text-2xl font-bold">追加・変更・棄権の明細</h3>{!account.lines.length?<p>反映済みの追加・変更・棄権はありません。</p>:<div className="overflow-x-auto"><table className="w-full border-collapse text-lg"><thead><tr>{['区分','競技','選手','馬','金額'].map(x=><th key={x} scope="col" className="border bg-blue-50 p-2 text-left">{x}</th>)}</tr></thead><tbody>{account.lines.map(x=><tr key={x.id}><td className="border p-2">{x.action}</td><td className="border p-2">{x.competitionLabel}</td><td className="border p-2">{x.rider}</td><td className="border p-2">{x.horse}</td><td className="whitespace-nowrap border p-2 text-right">{yen(x.amount)}</td></tr>)}</tbody></table></div>}</>}</section>
}
