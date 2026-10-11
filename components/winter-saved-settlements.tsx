"use client"
import {useEffect,useRef,useState} from 'react'
import type {AdminSession} from '@/lib/supabase-rest'
import {loadWinterSavedSettlements} from '@/lib/winter-saved-settlements'
import type {WinterSettlementRecord} from '@/lib/winter-checkout'
import {winterCheckoutPrintHtml} from '@/lib/winter-checkout-print'
const button='min-h-14 rounded-xl border-2 px-4 py-3 text-xl font-bold disabled:opacity-50'
const yen=(n:number)=>`${n.toLocaleString('ja-JP')}円`
export function WinterSavedSettlements({session,orgId,revision,onSession}:{session:AdminSession;orgId:string;revision:number;onSession:(s:AdminSession)=>void}){
 const[records,setRecords]=useState<WinterSettlementRecord[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0),[printing,setPrinting]=useState(false)
 const onSessionRef=useRef(onSession),sessionRef=useRef(session),lock=useRef(false),mounted=useRef(true)
 sessionRef.current=session;onSessionRef.current=onSession
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setRecords([])
  loadWinterSavedSettlements(sessionRef.current,orgId,controller.signal).then(result=>{if(!controller.signal.aborted){setRecords(result.records);onSessionRef.current(result.session)}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'保存済み精算書を確認できません')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[orgId,revision,retry])
 async function print(record:WinterSettlementRecord){
  if(lock.current)return
  const popup=window.open('','_blank');if(!popup){setError('ポップアップを許可してから再印刷してください。');return}
  lock.current=true;setPrinting(true);setError('');popup.opener=null
  try{popup.document.write(winterCheckoutPrintHtml(record));popup.document.close();await popup.document.fonts.ready;if(!popup.closed&&mounted.current){popup.focus();popup.print()}else popup.close()}
  catch(e){popup.close();if(mounted.current)setError(e instanceof Error?e.message:'精算書を印刷できません')}
  finally{lock.current=false;if(mounted.current)setPrinting(false)}
 }
 return <section className="space-y-3 rounded-xl border-2 p-4"><h3 className="text-2xl font-bold">受付で保存済みの精算書</h3><p>当時の金額・支払方法・確認者を表示します。再印刷で再保存や入金登録は行いません。保存後の料金変更は当時の精算書に反映されません。</p><button className={button} disabled={loading||printing} onClick={()=>setRetry(x=>x+1)}>保存済み精算書を再読み込み</button>{loading&&<p role="status">保存済み精算書を確認しています…</p>}{error&&<p role="alert" className="rounded-xl bg-red-100 p-3">{error}</p>}{!loading&&!error&&!records.length&&<p>この団体の保存済み精算書はありません。</p>}{records.map(r=><details key={r.id} className="rounded-xl border p-3"><summary className="cursor-pointer text-xl">{new Date(r.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ 残額 {yen(r.account.remaining)}</summary><div className="space-y-3 py-3"><p>確認者：{r.confirmer_name}</p><p>支払方法：{r.payment_method==='bank_transfer'?'後日振込':r.payment_method==='cash_at_venue'?'当日現金（係員への支払い）':'追加のお支払いなし'}</p><p>保存時の請求総額：{yen(r.account.total)} ／ 確認済み入金：{yen(r.account.advancePaid+r.account.extraPaid)}</p><p>保存番号：{r.id}</p><p>支払方法の選択は入金済みを示しません。</p><button className={button} disabled={printing} onClick={()=>void print(r)}>{printing?'印刷画面を準備中…':'この保存済み精算書を再印刷'}</button></div></details>)}{records.length===20&&<p>新しい順に20件を表示しています。</p>}</section>
}
