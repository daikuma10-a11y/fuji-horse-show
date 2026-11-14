"use client"
import {useEffect,useRef,useState} from 'react'
import {MasterStatementScope} from './master/settlement-scope'
import {defaultStatementDate,type StatementScope} from '@/lib/master/settlement-scope'
import type {MasterSavedSettlement} from '@/lib/master/self-settlement'
import {masterCheckoutPrintHtml} from '@/lib/master/settlement-print'
import {downloadMasterStatement} from '@/lib/settlement-document'
import {validateWinterCheckoutAccount,type WinterSettlementRecord} from '@/lib/winter-checkout'
import {validateWinterStatementContext,winterContextPayments,winterScopedCheckoutStatement,type WinterStatementContext} from '@/lib/winter-statement-context'

export function WinterSelfStatementScope({orgId,version,method,disabled,onReload,onPrinting}:{orgId:string;version:string;method:WinterSettlementRecord['payment_method'];disabled:boolean;onReload:()=>void;onPrinting:(value:boolean)=>void}){
 const[context,setContext]=useState<WinterStatementContext|null>(null),[scope,setScope]=useState<StatementScope>({date:'',paymentId:''})
 const[record,setRecord]=useState<MasterSavedSettlement|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[stale,setStale]=useState(false)
 const lock=useRef(false),mounted=useRef(true),sequence=useRef(0)
 async function read(selection?:StatementScope){
  if(lock.current||disabled)return
  lock.current=true;setBusy(true);setRecord(null);setError('');setStale(false)
  const seq=++sequence.current
  try{
   const response=await fetch('/api/winter-self-settlement?'+new URLSearchParams({org:orgId,scope:'1'}),{cache:'no-store',signal:AbortSignal.timeout(35000)})
   const body=await response.json()
   if(!mounted.current||seq!==sequence.current)return
   if(!response.ok)throw new Error(body.error??'日付・入金後の明細を確認できません')
   const account=validateWinterCheckoutAccount(body.account)
   if(account.organization.id!==orgId)throw new Error('団体が一致しません')
   if(body.version!==version){setStale(true);throw new Error('精算内容が更新されました。最新の金額と支払い方法を確認してください。')}
   const nextContext=validateWinterStatementContext(body.context,account),payments=winterContextPayments(nextContext)
   const chosen=selection??{date:defaultStatementDate(nextContext.dates),paymentId:payments[0]?.id??''}
   setContext(nextContext);setScope(chosen)
   setRecord(winterScopedCheckoutStatement(account,nextContext,chosen,new Date(),method))
  }catch(e){if(mounted.current&&seq===sequence.current)setError(e instanceof Error?e.message:'明細を読み込めません')}
  finally{if(seq===sequence.current){lock.current=false;if(mounted.current)setBusy(false)}}
 }
 useEffect(()=>{mounted.current=true;void read();return()=>{mounted.current=false;sequence.current++;lock.current=false}},[])
 async function print(){
  if(lock.current||disabled||!record)return
  const popup=window.open('','_blank')
  if(!popup){setError('印刷画面を開けません。ポップアップを許可してから再度お試しください。');return}
  lock.current=true;setBusy(true);setError('');onPrinting(true);popup.opener=null
  try{popup.document.write(masterCheckoutPrintHtml(record));popup.document.close();await popup.document.fonts.ready;if(mounted.current&&!popup.closed){popup.focus();popup.print()}else popup.close()}
  catch(e){popup.close();if(mounted.current)setError(e instanceof Error?e.message:'明細を印刷できません')}
  finally{lock.current=false;onPrinting(false);if(mounted.current)setBusy(false)}
 }
 function excel(){if(lock.current||disabled||!record)return;try{downloadMasterStatement(record);setError('')}catch(e){setError(e instanceof Error?e.message:'Excelに保存できません')}}
 return <><MasterStatementScope dates={context?.dates??[]} payments={context?winterContextPayments(context):[]} scope={scope} record={record} busy={busy} disabled={disabled||stale} error={error}
  onScope={value=>{if(!lock.current){setScope(value);setRecord(null);setError('')}}} onPreview={()=>void read(context?scope:undefined)} onPrint={()=>void print()} onExcel={excel}/>
  {stale&&<button type="button" className="min-h-16 rounded-xl border-2 bg-white p-4 text-xl font-bold" disabled={busy||disabled} onClick={onReload}>最新の精算内容を読み直す</button>}</>
}
