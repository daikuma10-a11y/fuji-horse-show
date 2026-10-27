'use client'
import {MasterSelfSettlementView,MasterConfirmationPaper} from '@/components/master/self-settlement'
import { useEffect, useRef, useState } from 'react'
import type { SavedSettlement } from '@/lib/self-settlement-saved'
import type { selfSettlementAccount } from '@/lib/self-settlement-account'

type Account=ReturnType<typeof selfSettlementAccount>
type RecordRow=SavedSettlement
export function ConfirmationPaper({record}:{record:RecordRow}){return <MasterConfirmationPaper record={record}/>}
type Organization={id:string;name:string}
const button='min-h-16 rounded-2xl border-2 px-5 py-3 text-xl font-bold disabled:opacity-40'
async function api(url:string,options?:RequestInit){const response=await fetch(url,{...options,cache:'no-store'});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'通信できませんでした'),{refresh:result.refresh,status:response.status});return result}

export function SelfSettlement(){
 const [organizations,setOrganizations]=useState<Organization[]>([]),[query,setQuery]=useState(''),[org,setOrg]=useState('')
 const [account,setAccount]=useState<Account|null>(null),[version,setVersion]=useState(''),[name,setName]=useState(''),[method,setMethod]=useState(''),[checked,setChecked]=useState(false)
 const [record,setRecord]=useState<RecordRow|null>(null),[history,setHistory]=useState<RecordRow[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[consult,setConsult]=useState(false)
 const attemptId=useRef<string|null>(null),lastAction=useRef(Date.now()),sequence=useRef(0),working=useRef(false),printing=useRef(false)
 function reset(){sequence.current++;setOrg('');setQuery('');setAccount(null);setVersion('');setName('');setMethod('');setChecked(false);setRecord(null);setHistory([]);setError('');setConsult(false);attemptId.current=null;lastAction.current=Date.now()}
 useEffect(()=>{let active=true;api('/api/self-settlement').then(data=>{if(active)setOrganizations(data.organizations)}).catch(e=>{if(active){setError(e.message)}});return()=>{active=false}},[])
 useEffect(()=>{const touch=()=>{lastAction.current=Date.now()};const timer=window.setInterval(()=>{if(!working.current&&!printing.current&&document.visibilityState!=='hidden'&&Date.now()-lastAction.current>120000)reset()},5000);window.addEventListener('pointerdown',touch);window.addEventListener('keydown',touch);return()=>{window.clearInterval(timer);window.removeEventListener('pointerdown',touch);window.removeEventListener('keydown',touch)}},[])
 useEffect(()=>{const start=()=>{printing.current=true};const finish=()=>{printing.current=false;lastAction.current=Date.now()};window.addEventListener('beforeprint',start);window.addEventListener('afterprint',finish);return()=>{window.removeEventListener('beforeprint',start);window.removeEventListener('afterprint',finish)}},[])
 async function select(id:string){const seq=++sequence.current;setOrg(id);setAccount(null);setRecord(null);setHistory([]);setChecked(false);setMethod('');setName('');setConsult(false);setError('');setBusy(true);working.current=true;attemptId.current=null
  try{const data=await api(`/api/self-settlement?org=${encodeURIComponent(id)}`);if(seq===sequence.current){setAccount(data.account);setVersion(data.version);setRecord(data.savedRecord??null);if(data.account.document.due===0)setMethod('no_payment_due')}}catch(e){if(seq===sequence.current)setError(e instanceof Error?e.message:'取得できません')}finally{if(seq===sequence.current)setBusy(false);working.current=false}
 }
 async function confirm(){if(!account||working.current||busy||!checked||!name.trim()||!method||account.warnings.length)return;setBusy(true);working.current=true;setError('');attemptId.current??=crypto.randomUUID()
  try{const data=await api('/api/self-settlement',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'confirm',org,name,method,version,id:attemptId.current})});setRecord(data.record)}catch(e){setError(e instanceof Error?e.message:'確定できません');if((e as {refresh?:boolean}).refresh){setChecked(false);attemptId.current=null;await select(org);setError('明細が更新されました。新しい内容を確認してください。')}}finally{setBusy(false);working.current=false;lastAction.current=Date.now()}
 }
 async function loadHistory(){setBusy(true);working.current=true;setError('');try{const data=await api(`/api/self-settlement?org=${encodeURIComponent(org)}&history=1`);setHistory(data.records)}catch(e){setError(e instanceof Error?e.message:'履歴を取得できません')}finally{setBusy(false);working.current=false}}
 function print(){lastAction.current=Date.now();printing.current=true;window.print()}
 return <MasterSelfSettlementView organizations={organizations} query={query} org={org} account={account} record={record} history={history} busy={busy} error={error} consult={consult} checked={checked} name={name} method={method} onQuery={setQuery} onName={value=>{setName(value);attemptId.current=null}} onMethod={value=>{setMethod(value);attemptId.current=null}} onChecked={setChecked} onConsult={()=>setConsult(true)} onSelect={id=>void select(id)} onReset={reset} onConfirm={()=>void confirm()} onPrint={print} onEditSaved={()=>{setRecord(null);setChecked(false);setName('');setMethod(account?.document.due===0?'no_payment_due':'');attemptId.current=null}} onHistory={()=>void loadHistory()} onChooseHistory={row=>{const original=history.find(record=>record.id===row.id);if(original)setRecord(original)}}/>
}
