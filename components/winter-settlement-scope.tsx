"use client"
import {useEffect,useRef,useState} from 'react'
import {MasterStatementScope} from './master/settlement-scope'
import {defaultStatementDate,type StatementScope} from '@/lib/master/settlement-scope'
import {masterCheckoutPrintHtml} from '@/lib/master/settlement-print'
import type {MasterSavedSettlement} from '@/lib/master/self-settlement'
import {downloadMasterStatement} from '@/lib/settlement-document'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {loadWinterData} from '@/lib/winter-data'
import {loadWinterSettlement,winterSettlementAccount} from '@/lib/winter-settlement'
import {winterScopedStatement,winterStatementPayments} from '@/lib/winter-settlement-scope'

export function WinterStatementScope({session,account,dates,disabled,onSession}:{session:AdminSession;account:ReturnType<typeof winterSettlementAccount>;dates:string[];disabled:boolean;onSession:(session:AdminSession)=>void}){
 const[payments,setPayments]=useState(()=>winterStatementPayments(account))
 const[scope,setScope]=useState<StatementScope>(()=>({date:defaultStatementDate(dates),paymentId:payments[0]?.id??''}))
 const[record,setRecord]=useState<MasterSavedSettlement|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState('')
 const lock=useRef(false),mounted=useRef(true)
 useEffect(()=>{mounted.current=true;return()=>{mounted.current=false}},[])
 async function preview(){
  if(lock.current||disabled)return
  lock.current=true;setBusy(true);setRecord(null);setError('')
  const selection={...scope}
  try{
   const verified=await verifyAdminSession(session)
   if(!mounted.current)return
   onSession(verified)
   const[data,ledger]=await Promise.all([loadWinterData(),loadWinterSettlement(verified.accessToken)])
   if(!mounted.current)return
   const freshAccount=winterSettlementAccount(data,ledger,account.organization.id)
   setPayments(winterStatementPayments(freshAccount))
   setRecord(winterScopedStatement(data,ledger,account.organization.id,selection))
  }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'対象明細を確認できません')}
  finally{lock.current=false;if(mounted.current)setBusy(false)}
 }
 async function print(){
  if(lock.current||disabled||!record)return
  const popup=window.open('','_blank')
  if(!popup){setError('印刷画面を開けません。ポップアップを許可してから再度お試しください。');return}
  lock.current=true;setBusy(true);setError('');popup.opener=null
  try{
   popup.document.write(masterCheckoutPrintHtml(record));popup.document.close()
   await popup.document.fonts.ready
   if(mounted.current&&!popup.closed){popup.focus();popup.print()}else popup.close()
  }catch(e){popup.close();if(mounted.current)setError(e instanceof Error?e.message:'明細を印刷できません')}
  finally{lock.current=false;if(mounted.current)setBusy(false)}
 }
 function excel(){
  if(lock.current||disabled||!record)return
  try{downloadMasterStatement(record);setError('')}catch(e){setError(e instanceof Error?e.message:'Excelに保存できません')}
 }
 return <MasterStatementScope dates={dates} payments={payments} scope={scope} record={record} busy={busy} disabled={disabled} error={error}
  onScope={value=>{if(!lock.current){setScope(value);setRecord(null);setError('')}}} onPreview={()=>void preview()} onPrint={()=>void print()} onExcel={excel}/>
}
