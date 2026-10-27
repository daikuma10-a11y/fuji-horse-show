'use client'

import {useEffect,useMemo,useRef,useState} from 'react'
import {addApplicationEntry,addApplicationPerson,removeApplicationAddition} from '@/lib/master/application-additions'
import {applicationEntryTarget,applicationPersonTarget} from '@/lib/master/application-guide'
import {MasterApplicationReview} from './master/application-review'
import {applyApplicationCandidate,autofillApplicationPerson,jefRiderQualification} from '@/lib/master/application-autofill'
import {autofillApplicationDraft} from '@/lib/winter-application-draft'
import {MasterApplicationRegistration} from './master/application-registration'
import {useWinterApplicationRegistration} from './use-winter-application-registration'
import type {Application,ApplicationPerson,ApplicationEntry,IdentityCandidate} from '@/lib/master/application'
import {applicationDifferences,applicationReview,readWinterApplication,rosterCandidates} from '@/lib/winter-application'
import {applicationDraftKey,createApplicationDraft,parseApplicationDraft,persistApplicationDraft,readApplicationDraft,serializeApplicationDraft,type ApplicationDraft} from '@/lib/winter-application-draft'
import {type SharedRoster} from '@/lib/shared-roster'
import {type AdminSession} from '@/lib/supabase-rest'
import {WINTER_EVENT_NAME,winterStorageKey} from '@/lib/winter-event'
import {applicationTodos,applicationClubSummary} from '@/lib/winter-application-guide'
import {winterApplicationServices} from '@/lib/winter-application-services'
import {applicationRegistrationKey,parseApplicationRegistration,type ApplicationSnapshot} from '@/lib/winter-application-registration'
import {credentialReviewUpgrade} from '@/lib/winter-credential-review-upgrade'
import {WINTER_HORSE_REGISTRATION_FEE} from '@/lib/winter-horse-registration'
import preparation from '@/config/winter-2026-preparation.json'

function download(draft:ApplicationDraft){
 const url=URL.createObjectURL(new Blob([serializeApplicationDraft(draft)],{type:'application/json'}))
 const a=document.createElement('a');a.href=url;a.download='Winter-Excel確認再開.json';a.click()
 setTimeout(()=>URL.revokeObjectURL(url),1000)
}
/** Winter source and service adapter; all presentation remains in the common master. */
export function WinterApplicationImport({session,onSession,onStartlist,onSettlement,onChanges,onRoster,onChanged}:{session:AdminSession;onSession:(session:AdminSession)=>void;onStartlist?:()=>void;onSettlement?:()=>void;onChanges?:()=>void;onRoster?:()=>void;onChanged?:()=>void}){
 const [file,setFile]=useState<File|null>(null),[draft,setDraft]=useState<ApplicationDraft|null>(null)
 const [revision,setRevision]=useState<Application|null>(null),[roster,setRoster]=useState<SharedRoster|null>(null)
 const [context,setContext]=useState<ApplicationSnapshot|null>(null)
 const [intent,setIntent]=useState<'addition'|''>('')
 const [busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[dirty,setDirty]=useState(false)
 const lock=useRef(false),expectedSaved=useRef<string|null>(null)
 const registration=useWinterApplicationRegistration({draft,session,onSession,isReviewBusy:()=>lock.current,
  canReplaceReview:()=>!dirty||window.confirm('現在の未保存の確認入力を登録再開記録で置き換えます。続けますか？'),
  onAdopt:value=>{setDraft(value);setFile(null);setRevision(null);setRoster(null);expectedSaved.current=null;setDirty(false)},
  onClear:()=>{setDraft(null);setFile(null);setRevision(null);setRoster(null);setContext(null);expectedSaved.current=null;setDirty(false)},
  onChanged,
  onBeforeRosterCorrection:input=>{
   if(!draft)throw new Error('申込内容を確認してください')
   expectedSaved.current=persistApplicationDraft(localStorage,draft,expectedSaved.current)
   localStorage.setItem(winterStorageKey('application-roster-correction')+':'+input.requestId,JSON.stringify({kind:'winter-roster-correction',version:1,originalDigest:draft.original.digest,reference:draft.reference,input}))
   setDirty(false)
  },
  onRosterCorrected:snapshot=>{setRoster(snapshot.roster);setContext(snapshot)},
  canImport:()=>{
   if(!draft||!context)return false
   const state=applicationClubSummary(draft,context).state
   return state!=='ambiguous'&&(state!=='registered'||intent==='addition')
  },
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
 function person(key:string,patch:Partial<ApplicationPerson>,keepChoice=false){edit(d=>{
  const choices={...d.choices};if(!keepChoice&&('name' in patch||'reading' in patch||'jef' in patch))delete choices[key]
  const rosterEdits=d.rosterEdits?{...d.rosterEdits}:undefined;if(rosterEdits&&!choices[key])delete rosterEdits[key]
  return {...d,choices,...(rosterEdits?{rosterEdits}:{}),accountChecked:false,edited:{...d.edited,people:d.edited.people.map(p=>{
   if(p.key!==key)return p
   const next={...p,...patch}
   if('name' in patch||'jef' in patch)next.checked=false
   if('grade' in patch){next.gradeManual=true;delete next.gradeAutofill}
   if('reading' in patch)delete next.readingAutofill
   return autofillApplicationPerson(next,context?.riderGrades??[])
  })}}
 })}
 function entry(key:string,patch:Partial<ApplicationEntry>){edit(d=>({...d,accountChecked:false,edited:{...d.edited,entries:d.edited.entries.map(e=>e.key===key?{...e,...patch}:e)}}))}
 function focusAdded(id:string){requestAnimationFrame(()=>requestAnimationFrame(()=>{const row=document.getElementById(id);row?.scrollIntoView({block:'center',behavior:'smooth'});row?.querySelector<HTMLElement>('input,textarea,select')?.focus({preventScroll:true})}))}
 function addEntry(sourceKey?:string){
  if(!draft||lock.current||registration.isBusy()||registration.isFrozen())return
  try{const id=crypto.randomUUID(),edited=addApplicationEntry(draft.edited,id,sourceKey);edit(d=>({...d,edited,accountChecked:false}));registration.invalidate();focusAdded(applicationEntryTarget(`manual-entry-${id}`))}catch(e){setError((e as Error).message)}
 }
 function addPerson(kind:ApplicationPerson['kind']){
  if(!draft||lock.current||registration.isBusy()||registration.isFrozen())return
  try{const id=crypto.randomUUID(),edited=addApplicationPerson(draft.edited,kind,id);edit(d=>({...d,edited,accountChecked:false}));registration.invalidate();focusAdded(applicationPersonTarget(`manual-person-${id}`))}catch(e){setError((e as Error).message)}
 }
 function removeAddition(key:string){edit(d=>{
  const choices={...d.choices},rosterEdits={...d.rosterEdits};delete choices[key];delete rosterEdits[key]
  return {...d,choices,rosterEdits,accountChecked:false,edited:removeApplicationAddition(d.edited,key)}
 });registration.invalidate()}
 function open(value:ApplicationDraft){
  if(registration.isFrozen())throw new Error('登録再開記録の入力は固定しています。③・④の下にある、端末に記録を保持して申込書を閉じるボタンから進んでください。')
  const clean=readApplicationDraft(value),key=applicationDraftKey(clean.original.digest),stored=localStorage.getItem(key)
  if(stored&&JSON.stringify(parseApplicationDraft(stored))!==JSON.stringify(clean))throw new Error('同じ原本の異なる確認記録がこの端末にあります。上書きせず、先にこの端末の確認途中を開いてください')
  if(dirty&&!window.confirm('現在の未保存の訂正を、選択した確認記録で置き換えます。続けますか？'))return
  expectedSaved.current=stored;setDraft(clean);setFile(null);setRevision(null);setRoster(null);setIntent('');setDirty(!stored)
  setMessage('確認途中を開きました。既存名簿の対応は候補を読み直して確認してください。登録結果を示すファイルではありません。')
  return clean
 }
 const review=useMemo(()=>draft?applicationReview(draft.edited,draft.paid,draft.accountChecked):null,[draft])
 const candidates=useMemo(()=>{
  const result:Record<string,IdentityCandidate[]>={}
  if(draft&&roster)for(const p of draft.edited.people)result[p.key]=rosterCandidates(p,roster,draft.edited.club).map(c=>({id:c.entity.id,name:c.entity.name,reading:c.entity.reading,jef:c.entity.jef_number??'',reason:c.reason,clubs:c.clubs}))
  return result
 },[draft,roster])
 const differences=useMemo(()=>draft&&revision?applicationDifferences(draft.original,revision):null,[draft,revision])
 const clubSummary=draft&&context?applicationClubSummary(draft,context):null
 const todos=draft?applicationTodos(draft,roster!==null):[]
 if(clubSummary?.state==='registered'&&intent!=='addition')todos.push({label:'Excelの取込方法',message:'「登録済みの出番を残して、このExcelを取り込む」にチェックしてください。新規・追加の出番や資格級・グレード宣言の保存に進めます。',target:'application-club',blocking:true})
 if(clubSummary?.state==='ambiguous')todos.push({label:'団体名',message:clubSummary.detail,target:'application-club',blocking:true})
 if(context?.riderGradesError)todos.push({label:'資格の自動補完',message:context.riderGradesError,target:'application-club',blocking:false})
 const qualificationNotes=Object.fromEntries((draft?.edited.people??[]).filter(p=>p.kind==='rider'&&p.jef).map(p=>[p.key,context?.riderGrades&&!context.riderGradesError?jefRiderQualification(p,context.riderGrades).message:'']))
 async function loadContext(target:ApplicationDraft|null=draft){
  setRoster(null);setContext(null)
  const services=winterApplicationServices(session,onSession)
  let snapshot:ApplicationSnapshot
  try{snapshot=await services.load(target?.edited.people.filter(p=>p.kind==='rider').map(p=>p.jef))}
  catch(e){
   // Candidate lookup must not depend on a club name or an unrelated charge lookup.
   const available=await services.loadRoster();setRoster(available)
   throw new Error('人馬候補は選択できます。既存出番・料金の確認を完了できなかったため、③へ進む前に「既存登録を再確認」を押してください。\n'+(e instanceof Error?e.message:''))
  }
  setRoster(snapshot.roster);setContext(snapshot)
  if(target&&!registration.isFrozen()){
   const filled=autofillApplicationDraft(target,snapshot.riderGrades??[])
   if(filled!==target){setDirty(true);setDraft(current=>current?.original.digest===target.original.digest?filled:current)}
  }
 }
 function choose(key:string,value:string,options=candidates[key]){void action(async()=>{
  if(!draft||registration.isFrozen())return
  const current=draft.edited.people.find(p=>p.key===key)
  if(!current)throw new Error('選択する人馬を確認できません')
  const selected=options?.find(c=>c.id===value)
  if(value&&value!=='new'&&!selected)throw new Error('候補を確認できません。「既存登録を再確認」を押してください。')
  const person=applyApplicationCandidate(current,selected,context?.riderGrades??[])
  const rosterEdits=draft.rosterEdits?{...draft.rosterEdits}:undefined;if(rosterEdits&&draft.choices[key]!==value)delete rosterEdits[key]
  const next={...draft,choices:{...draft.choices,[key]:value},...(rosterEdits?{rosterEdits}:{}),accountChecked:false,
   edited:{...draft.edited,people:draft.edited.people.map(p=>p.key===key?person:p)}}
  setDraft(next);setDirty(true);registration.invalidate()
  // A previously blank workbook number could not have been included in the first lookup.
  if(selected&&person.kind==='rider'&&person.jef&&person.jef!==current.jef)await loadContext(next)
 })}
 function useExisting(key:string,id:string){void action(async()=>{
  if(!draft||registration.isFrozen())return
  const row=registration.panel.people.find(r=>r.key===key)?.correction
  const selected=row?.candidates.find(c=>c.id===id)
  const current=draft.edited.people.find(p=>p.key===key)
  if(!current||!selected||row?.selected!==id)throw new Error('同じ人馬であることを確認し、候補を選び直してください。')
  const {readingAutofill:_,...base}=current
  const person=applyApplicationCandidate({...base,name:selected.name,reading:selected.reading},selected,context?.riderGrades??[])
  const next={...draft,choices:{...draft.choices,[key]:id},accountChecked:false,edited:{...draft.edited,people:draft.edited.people.map(p=>p.key===key?person:p)}}
  setDraft(next);setDirty(true);registration.invalidate()
  if(person.kind==='rider'&&person.jef&&person.jef!==current.jef)await loadContext(next)
 })}
 async function begin(app:Application){
  setIntent('')
  const stored=localStorage.getItem(applicationDraftKey(app.digest))
  let next=stored?parseApplicationDraft(stored):createApplicationDraft(app)
  const needsReference=!next.reference.trim()
  if(needsReference)next.reference=createApplicationDraft(app).reference
  let saved=localStorage.getItem(applicationRegistrationKey(next.reference))
  const record=saved?parseApplicationRegistration(saved):undefined
  if(record&&record.review.original.digest!==app.digest)throw new Error('同じ資料番号の原本が異なります。保存済み記録を確認してください。')
  const upgraded=credentialReviewUpgrade(app,record?.review??next,record)
  if(upgraded){next=upgraded;saved=localStorage.getItem(applicationRegistrationKey(next.reference))}
  expectedSaved.current=stored;setDraft(next);setRevision(null);setDirty(!stored||needsReference||!!upgraded)
  if(saved)registration.openRecord(parseApplicationRegistration(saved))
  setMessage(saved?'このExcelの取り込み記録があります。③の「登録結果を再確認」で現在の結果を確認してください。':upgraded?'原本から資格・グレードの確認欄を追加しました。②で確認して③へ進んでください。登録済みの出番は重複して取り込みません。':'Excelを読み込みました。②の確認箇所から順に確認してください。読み込んだだけでは登録しません。')
  try{await loadContext(next)}catch(e){setError('Excelは読み込めましたが、既存登録の確認に失敗しました。「既存登録を再確認」を押してください。\n'+(e instanceof Error?e.message:''))}
 }
 function saveAndGo(next?:()=>void){void action(()=>{
  if(draft&&!registration.isFrozen()){expectedSaved.current=persistApplicationDraft(localStorage,draft,expectedSaved.current);setDirty(false)}
  next?.()
 })}
 function nextApplication(){void action(()=>{
  if(!draft||registration.isFrozen())return
  persistApplicationDraft(localStorage,draft,expectedSaved.current)
  setDraft(null);setFile(null);setRevision(null);setRoster(null);setContext(null);setIntent('');expectedSaved.current=null;setDirty(false)
  setMessage('確認途中をこの端末に保存しました。次の申込書を選んでください。')
 })}
 return <MasterApplicationReview
  busy={busy||registration.busy} frozen={registration.frozen} registration={<MasterApplicationRegistration {...registration.panel} onStartlist={onStartlist?()=>saveAndGo(onStartlist):undefined} onSettlement={onSettlement?()=>saveAndGo(onSettlement):undefined} onNext={!registration.frozen?nextApplication:undefined}
   onCorrectPerson={(key,patch)=>person(key,patch,true)} onCorrectChoice={(key,id)=>choose(key,id,registration.panel.people.find(r=>r.key===key)?.correction?.candidates)} onUseExisting={useExisting} onUseOriginal={key=>{const source=draft?.original.people.find(p=>p.key===key);if(source)person(key,{name:source.name,reading:source.reading,jef:source.jef},true)}}
   onCorrectAffiliation={(key,value)=>edit(d=>({...d,accountChecked:false,rosterEdits:{...d.rosterEdits,[key]:value}}))}
   accountChecked={draft?.accountChecked??false} onAccountChecked={accountChecked=>edit(d=>({...d,accountChecked}))}
   onRoster={onRoster?()=>saveAndGo(onRoster):undefined} editError={error}
  />}
  todos={todos} clubSummary={clubSummary} intent={intent} onIntent={value=>{if(lock.current||registration.isBusy())return;setIntent(value);registration.invalidate()}}
  registrationNeedsCorrection={registration.panel.hasCorrections}
  stage={registration.panel.complete?4:registration.panel.hasCorrections||registration.panel.ready&&!todos.some(t=>t.blocking)?3:draft?2:1} onReview={registration.panel.onReview}
  onChanges={onChanges?()=>saveAndGo(onChanges):undefined} onUseRevision={()=>void action(async()=>{
   if(!revision||registration.isFrozen())return
   if(draft)expectedSaved.current=persistApplicationDraft(localStorage,draft,expectedSaved.current)
   await begin(revision)
  })}
  message={message} error={error} fileName={file?.name??''} eventName={WINTER_EVENT_NAME}
  formatDescription="対応：2026 Winterの指定様式（選手30人・馬20頭、障害・馬場の追加入力欄とコピーシート）。"
  original={draft?.original??null} edited={draft?.edited??null} reference={draft?.reference??''} paid={draft?.paid??''} accountChecked={draft?.accountChecked??false}
  review={review?{amounts:review.amounts,entryPrices:review.report.entries.map(e=>e.price),entryFeeTotal:review.report.entryFeeTotal,horseRegistration:{count:draft!.edited.people.filter(p=>p.kind==='horse').length,unit:WINTER_HORSE_REGISTRATION_FEE},issues:[...draft!.edited.issues,...review.report.issues.map(i=>`${i.section} ${i.row}行：${i.message}`)],ready:review.ready}:null}
  candidates={candidates} choices={draft?.choices??{}} qualificationNotes={qualificationNotes} rosterLoaded={roster!==null} differences={differences} revisionName={revision?.fileName??''} competitions={preparation.competitions}
  onFiles={files=>{if(lock.current||registration.isBusy())return;if(!files||files.length!==1){setError('Excelファイルを1つ選択してください');return}setFile(files[0]);setError('')}}
  onRead={()=>void action(async()=>{
   if(!file)throw new Error('Excelファイルを選択してください')
   if(file.size>8_000_000)throw new Error('Excelは8MB以内で選択してください')
   const app=await readWinterApplication(new Uint8Array(await file.arrayBuffer()),file.name)
   if(draft){setRevision(app);setMessage(app.digest===draft.original.digest?'同じ原本です。現在の訂正・対応を保持しました。':'訂正版との差分を表示しました。現在の原本・訂正値を保持しています。');return}
   await begin(app)
  })}
  onRestoreFile={f=>void action(async()=>{if(f.size>8_000_000)throw new Error('確認再開ファイルは8MB以内です');const opened=open(parseApplicationDraft(new TextDecoder('utf-8',{fatal:true}).decode(await f.arrayBuffer())));if(opened)await loadContext(opened)})}
  onSave={()=>void action(()=>{if(!draft||registration.isFrozen())return;expectedSaved.current=persistApplicationDraft(localStorage,draft,expectedSaved.current);setDirty(false);setMessage('確認途中をこの端末に保存しました。端末を替える前に確認再開JSONも保存してください。')})}
  onOpenSaved={()=>void action(async()=>{if(!draft)return;const raw=localStorage.getItem(applicationDraftKey(draft.original.digest));if(!raw)throw new Error('この原本の確認記録は端末にありません');const opened=open(parseApplicationDraft(raw));if(opened)await loadContext(opened)})}
  onDownload={()=>void action(()=>{if(draft&&!registration.isFrozen()){download(draft);setMessage('確認再開JSONのダウンロードを開始しました。保存先でファイルを確認してください。')}})}
  onReset={nextApplication}
  onLoadRoster={()=>void action(async()=>{if(registration.isFrozen())return;await loadContext();setMessage('既存登録を確認しました。候補の所属・番号を確認して選んでください。')})}
  onReference={reference=>edit(d=>({...d,reference}))}
  onClub={club=>{edit(d=>({...d,rosterEdits:{},accountChecked:false,edited:{...d.edited,club}}));setIntent('');registration.invalidate()}}
  onPaid={paid=>edit(d=>({...d,paid,accountChecked:false}))} onAccountChecked={accountChecked=>edit(d=>({...d,accountChecked}))}
  onPerson={person} onEntry={entry} onAddEntry={addEntry} onAddPerson={addPerson} onRemoveAddition={removeAddition}
  onAmount={(key,value)=>edit(d=>({...d,accountChecked:false,edited:{...d.edited,amounts:{...d.edited.amounts,[key]:value}}}))}
  onChoice={choose}
 />
}
