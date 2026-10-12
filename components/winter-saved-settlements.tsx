"use client"
import {useEffect,useRef,useState} from 'react'
import type {AdminSession} from '@/lib/supabase-rest'
import {loadWinterSavedSettlements} from '@/lib/winter-saved-settlements'
import type {WinterSettlementRecord} from '@/lib/winter-checkout'
import {winterMasterSavedSettlement} from '@/lib/winter-master-settlement'
import {MasterSettlementHistory} from '@/components/master/settlement-history'
import type {MasterSavedSettlement} from '@/lib/master/self-settlement'
import {masterCheckoutPrintHtml} from '@/lib/master/settlement-print'
export function WinterSavedSettlements({session,orgId,revision,onSession}:{session:AdminSession;orgId:string;revision:number;onSession:(s:AdminSession)=>void}){
 const[records,setRecords]=useState<WinterSettlementRecord[]>([]),[loading,setLoading]=useState(true),[error,setError]=useState(''),[retry,setRetry]=useState(0),[printing,setPrinting]=useState(false),[selected,setSelected]=useState<MasterSavedSettlement|null>(null)
 const onSessionRef=useRef(onSession),sessionRef=useRef(session),lock=useRef(false),mounted=useRef(true)
 sessionRef.current=session;onSessionRef.current=onSession
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 useEffect(()=>{setSelected(null)},[orgId])
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');setRecords([])
  loadWinterSavedSettlements(sessionRef.current,orgId,controller.signal).then(result=>{if(!controller.signal.aborted){setRecords(result.records);onSessionRef.current(result.session)}}).catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'保存済み精算書を確認できません')}).finally(()=>{if(!controller.signal.aborted)setLoading(false)})
  return()=>controller.abort()
 },[orgId,revision,retry])
 async function print(){
  if(lock.current||!selected)return
  const popup=window.open('','_blank');if(!popup){setError('ポップアップを許可してから再印刷してください。');return}
  const snapshot=selected;lock.current=true;setPrinting(true);setError('');popup.opener=null
  try{popup.document.write(masterCheckoutPrintHtml(snapshot));popup.document.close();await popup.document.fonts.ready;if(!popup.closed&&mounted.current){popup.focus();popup.print()}else popup.close()}
  catch(e){popup.close();if(mounted.current)setError(e instanceof Error?e.message:'精算書を印刷できません')}
  finally{lock.current=false;if(mounted.current)setPrinting(false)}
 }
 const rows=records.map(record=>winterMasterSavedSettlement(record,orgId))
 return <MasterSettlementHistory rows={rows} selected={selected} busy={loading} printing={printing} error={error} limitNotice={rows.length===20?'新しい順に20件を表示しています。':undefined} onReload={()=>{if(!lock.current)setRetry(x=>x+1)}} onSelect={row=>{if(!lock.current)setSelected(row)}} onClose={()=>{if(!lock.current)setSelected(null)}} onPrint={()=>void print()}/>
}
