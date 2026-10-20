'use client'

import {useEffect,useMemo,useRef,useState} from 'react'
import {MasterApplicationReview} from './master/application-review'
import {MasterApplicationRegistration} from './master/application-registration'
import {useWinterApplicationRegistration} from './use-winter-application-registration'
import type {Application,ApplicationPerson,ApplicationEntry,IdentityCandidate} from '@/lib/master/application'
import {applicationDifferences,applicationReview,readWinterApplication,rosterCandidates} from '@/lib/winter-application'
import {applicationDraftKey,createApplicationDraft,parseApplicationDraft,persistApplicationDraft,readApplicationDraft,serializeApplicationDraft,type ApplicationDraft} from '@/lib/winter-application-draft'
import {loadSharedRoster,type SharedRoster} from '@/lib/shared-roster'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {WINTER_EVENT_NAME} from '@/lib/winter-event'
import preparation from '@/config/winter-2026-preparation.json'

function download(draft:ApplicationDraft){
 const url=URL.createObjectURL(new Blob([serializeApplicationDraft(draft)],{type:'application/json'}))
 const a=document.createElement('a');a.href=url;a.download='Winter-Excel確認再開.json';a.click()
 setTimeout(()=>URL.revokeObjectURL(url),1000)
}
/** Winter source and service adapter; all presentation remains in the common master. */
export function WinterApplicationImport({session,onSession}:{session:AdminSession;onSession:(session:AdminSession)=>void}){
 const [file,setFile]=useState<File|null>(null),[draft,setDraft]=useState<ApplicationDraft|null>(null)
 const [revision,setRevision]=useState<Application|null>(null),[roster,setRoster]=useState<SharedRoster|null>(null)
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[dirty,setDirty]=useState(false)
 const lock=useRef(false),expectedSaved=useRef<string|null>(null)
 const registration=useWinterApplicationRegistration({draft,session,onSession,isReviewBusy:()=>lock.current,
  canReplaceReview:()=>!dirty||window.confirm('現在の未保存の確認入力を登録再開記録で置き換えます。必要な確認再開JSONを保存済みですか？'),
  onAdopt:value=>{setDraft(value);setFile(null);setRevision(null);setRoster(null);expectedSaved.current=null;setDirty(false)},
  onClear:()=>{setDraft(null);setFile(null);setRevision(null);setRoster(null);expectedSaved.current=null;setDirty(false)},
 })
 useEffect(()=>{
  if(!dirty&&!registration.busy&&!registration.frozen)return
  const warn=(event:BeforeUnloadEvent)=>{event.preventDefault();event.returnValue=''}
  window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn)
 },[dirty,registration.busy,registration.frozen])
 async function action(task:()=>Promise<void>|void){
  if(lock.current||registration.isBusy())return;lock.current=true;setBusy(true);setError('');setMessage('')
  try{await task()}catch(e){setError(e instanceof Error?e.message:'処理を完了できません。元のファイルを保持してください')}
  finally{lock.current=false;setBusy(false)}
 }
 function edit(fn:(d:ApplicationDraft)=>ApplicationDraft){if(lock.current||registration.isBusy()||registration.isFrozen())return;setDraft(d=>d?fn(d):d);setDirty(true);setMessage('')}
 function person(key:string,patch:Partial<ApplicationPerson>){edit(d=>{
  const choices={...d.choices};if('name' in patch||'reading' in patch||'jef' in patch)delete choices[key]
  return {...d,choices,accountChecked:false,edited:{...d.edited,people:d.edited.people.map(p=>p.key===key?{...p,...patch}:p)}}
 })}
 function entry(key:string,patch:Partial<ApplicationEntry>){edit(d=>({...d,accountChecked:false,edited:{...d.edited,entries:d.edited.entries.map(e=>e.key===key?{...e,...patch}:e)}}))}
 function open(value:ApplicationDraft){
  if(registration.isFrozen())throw new Error('登録再開記録の入力は固定しています。下の登録再開JSONを保存してから別の申込書へ進んでください。')
  const clean=readApplicationDraft(value),key=applicationDraftKey(clean.original.digest),stored=localStorage.getItem(key)
  if(stored&&JSON.stringify(parseApplicationDraft(stored))!==JSON.stringify(clean))throw new Error('同じ原本の異なる確認記録がこの端末にあります。上書きせず、先にこの端末の確認途中を開いてください')
  if(dirty&&!window.confirm('現在の未保存の訂正を置き換えます。必要な確認再開JSONを保存済みですか？'))return
  expectedSaved.current=stored;setDraft(clean);setFile(null);setRevision(null);setRoster(null);setDirty(!stored)
  setMessage('確認途中を開きました。既存名簿の対応は候補を読み直して確認してください。登録結果を示すファイルではありません。')
 }
 const review=useMemo(()=>draft?applicationReview(draft.edited,draft.paid,draft.accountChecked):null,[draft])
 const candidates=useMemo(()=>{
  const result:Record<string,IdentityCandidate[]>={}
  if(draft&&roster)for(const p of draft.edited.people)result[p.key]=rosterCandidates(p,roster,draft.edited.club).map(c=>({id:c.entity.id,name:c.entity.name,reading:c.entity.reading,jef:c.entity.jef_number??'',reason:c.reason,clubs:c.clubs}))
  return result
 },[draft,roster])
 const differences=useMemo(()=>draft&&revision?applicationDifferences(draft.original,revision):null,[draft,revision])
 return <MasterApplicationReview
  busy={busy||registration.busy} frozen={registration.frozen} registration={<MasterApplicationRegistration {...registration.panel}/>}
  message={message} error={error} fileName={file?.name??''} eventName={WINTER_EVENT_NAME}
  formatDescription="対応：2026 Winterの指定様式（選手30人・馬20頭、障害・馬場の追加入力欄とコピーシート）。"
  original={draft?.original??null} edited={draft?.edited??null} reference={draft?.reference??''} paid={draft?.paid??''} accountChecked={draft?.accountChecked??false}
  review={review?{amounts:review.amounts,entryPrices:review.report.entries.map(e=>e.price),issues:[...draft!.edited.issues,...review.report.issues.map(i=>`${i.section} ${i.row}行：${i.message}`)],ready:review.ready}:null}
  candidates={candidates} choices={draft?.choices??{}} rosterLoaded={roster!==null} differences={differences} revisionName={revision?.fileName??''} competitions={preparation.competitions}
  onFiles={files=>{if(lock.current||registration.isBusy())return;if(!files||files.length!==1){setError('Excelファイルを1つ選択してください');return}setFile(files[0]);setError('')}}
  onRead={()=>void action(async()=>{
   if(!file)throw new Error('Excelファイルを選択してください')
   if(file.size>8_000_000)throw new Error('Excelは8MB以内で選択してください')
   const app=await readWinterApplication(new Uint8Array(await file.arrayBuffer()),file.name)
   if(draft){setRevision(app);setMessage(app.digest===draft.original.digest?'同じ原本です。現在の訂正・対応を保持しました。':'訂正版との差分を表示しました。現在の原本・訂正値を保持しています。');return}
   expectedSaved.current=null;setDraft(createApplicationDraft(app));setRevision(null);setDirty(true)
   setMessage('Excelを読み込みました。元シート・セルと照合して訂正してください。DB登録は行っていません。')
  })}
  onRestoreFile={f=>void action(async()=>{if(f.size>8_000_000)throw new Error('確認再開ファイルは8MB以内です');open(parseApplicationDraft(new TextDecoder('utf-8',{fatal:true}).decode(await f.arrayBuffer())))})}
  onSave={()=>void action(()=>{if(!draft||registration.isFrozen())return;expectedSaved.current=persistApplicationDraft(localStorage,draft,expectedSaved.current);setDirty(false);setMessage('確認途中をこの端末に保存しました。端末を替える前に確認再開JSONも保存してください。')})}
  onOpenSaved={()=>void action(()=>{if(!draft)return;const raw=localStorage.getItem(applicationDraftKey(draft.original.digest));if(!raw)throw new Error('この原本の確認記録は端末にありません');open(parseApplicationDraft(raw))})}
  onDownload={()=>void action(()=>{if(draft&&!registration.isFrozen()){download(draft);setMessage('確認再開JSONのダウンロードを開始しました。保存先でファイルを確認してください。')}})}
  onReset={()=>void action(()=>{
   if(!draft||registration.isFrozen()||!window.confirm('現在の確認再開JSONをダウンロードし、入力欄を空にします。保存先でファイルを確認してから、次の申込書を選んでください。'))return
   download(draft);setDraft(null);setFile(null);setRevision(null);setRoster(null);expectedSaved.current=null;setDirty(false)
   setMessage('確認再開JSONのダウンロードを開始しました。保存先を確認してから、次の申込書を選んでください。')
  })}
  onLoadRoster={()=>void action(async()=>{if(registration.isFrozen())return;setRoster(null);const verified=await verifyAdminSession(session);onSession(verified);setRoster(await loadSharedRoster(verified.accessToken));setMessage('既存の名簿を読み込みました。所属・番号を照合し、対応を明示選択してください。')})}
  onReference={reference=>edit(d=>({...d,reference}))}
  onClub={club=>edit(d=>({...d,choices:{},accountChecked:false,edited:{...d.edited,club}}))}
  onPaid={paid=>edit(d=>({...d,paid,accountChecked:false}))} onAccountChecked={accountChecked=>edit(d=>({...d,accountChecked}))}
  onPerson={person} onEntry={entry}
  onAmount={(key,value)=>edit(d=>({...d,accountChecked:false,edited:{...d.edited,amounts:{...d.edited.amounts,[key]:value}}}))}
  onChoice={(key,value)=>edit(d=>({...d,choices:{...d.choices,[key]:value}}))}
 />
}
