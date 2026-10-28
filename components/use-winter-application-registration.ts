'use client'

import {useEffect,useRef,useState} from 'react'
import type {ApplicationImportFeedback,ApplicationImportProgress} from '@/lib/master/application-import-status'
import type {ApplicationRegistrationPanelProps} from './master/application-registration'
import {rosterCorrectionInput,rosterCorrectionMatches,type RosterCorrectionInput} from '@/lib/winter-roster-correction'
import {applicationDifferences,applicationReview,rosterCandidates} from '@/lib/winter-application'
import {readApplicationDraft,type ApplicationDraft} from '@/lib/winter-application-draft'
import {applicationRegistrationDifferences,applicationRegistrationKey,createApplicationRegistration,parseApplicationRegistration,persistApplicationRegistration,readApplicationRegistration,reviewApplicationRegistration,resolveUnknownApplicationPerson,runApplicationRegistration,serializeApplicationRegistration,type ApplicationRegistration,type ApplicationSnapshot} from '@/lib/winter-application-registration'
import {winterApplicationServices} from '@/lib/winter-application-services'
import {winterStorageKey} from '@/lib/winter-event'
import type {AdminSession} from '@/lib/supabase-rest'

type Plan=Awaited<ReturnType<typeof reviewApplicationRegistration>>
const completePlan=(plan:Plan,work:ApplicationRegistration)=>plan.ready&&!plan.pendingRoster.length&&plan.credentialsComplete&&plan.participating&&work.review.edited.entries.length>0&&plan.entries?.rows.length===work.review.edited.entries.length&&plan.entries.rows.every(r=>r.state==='registered')
function observedProgress(plan:Plan,work:ApplicationRegistration):ApplicationImportProgress{return {phase:'verifying',detail:'保存結果を確認しました',peopleConfirmed:plan.people.filter(p=>p.state==='registered'&&!plan.pendingRoster.some(r=>r.key===p.key)).length,peopleTotal:work.review.edited.people.length,entriesConfirmed:plan.entries?.rows.filter(r=>r.state==='registered').length??0,entriesTotal:work.review.edited.entries.length}}
function focusFeedback(){if(typeof requestAnimationFrame==='function')requestAnimationFrame(()=>{const el=document.getElementById('application-import-status');el?.scrollIntoView({block:'center',behavior:'smooth'});el?.focus({preventScroll:true})})}
const copy=<T,>(v:T):T=>structuredClone(v)
// In-progress edits may be invalid; invalidate confirmation without throwing during render.
function signature(d:ApplicationDraft){try{return JSON.stringify(readApplicationDraft(d))}catch{return null}}
const status=(s:string)=>s==='registered'?'登録済み':s==='unknown'?'結果不明':'未登録'
function download(value:ApplicationRegistration){
 const url=URL.createObjectURL(new Blob([serializeApplicationRegistration(value)],{type:'application/json'}))
 const a=document.createElement('a');a.href=url;a.download='Winter-Excel登録再開.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
async function exclusive(task:()=>Promise<void>){
 if(typeof navigator==='undefined'||!navigator.locks)throw new Error('このブラウザーでは同時登録の防止を利用できません。登録を停止します。再開JSONを保持してください。')
 await navigator.locks.request(winterStorageKey('application-registration-write'),{mode:'exclusive',ifAvailable:true},async lock=>{
  if(!lock)throw new Error('別のタブでExcel登録を処理中です。その処理を確認してから再度照合してください。')
  await task()
 })
}
/** Winter operations only; presentation and controls stay in the shared master. */
export function useWinterApplicationRegistration(p:{draft:ApplicationDraft|null;session:AdminSession;onSession:(s:AdminSession)=>void;isReviewBusy:()=>boolean;canReplaceReview:()=>boolean;onAdopt:(draft:ApplicationDraft)=>void;onClear:()=>void;onChanged?:()=>void;canImport?:()=>boolean;onBeforeRosterCorrection?:(input:RosterCorrectionInput)=>void;onRosterCorrected?:(snapshot:ApplicationSnapshot)=>void}){
 const [work,setWork]=useState<ApplicationRegistration|null>(null),[preview,setPreview]=useState<{work:ApplicationRegistration;plan:Plan}|null>(null)
 // Keep editable diagnostics after a draft change, never its authorization to register.
 const [lastInspection,setLastInspection]=useState<{work:ApplicationRegistration;plan:Plan;snapshot:ApplicationSnapshot}|null>(null)
 const [snapshot,setSnapshot]=useState<ApplicationSnapshot|null>(null),[busy,setBusy]=useState(false),[running,setRunning]=useState(false)
 const [accepted,setAccepted]=useState(false),[singleOperator,setSingleOperator]=useState(false),[choices,setChoices]=useState<Record<string,string>>({})
 const [correctionAccepted,setCorrectionAccepted]=useState<Record<string,boolean>>({})
 const [feedback,setFeedback]=useState<(ApplicationImportFeedback&{signature:string|null})|null>(null)
 const [message,setMessage]=useState(''),[error,setError]=useState('')
 const current=useRef<ApplicationRegistration|null>(null),expected=useRef<string|null>(null),lock=useRef(false),stop=useRef(false)
 const alive=useRef(true)
 const services=()=>winterApplicationServices(p.session,p.onSession)
 const activeReview=work?.review??p.draft
 const shown=preview&&activeReview&&signature(preview.work.review)===signature(activeReview)?preview:null
 useEffect(()=>{if(!p.draft){setLastInspection(null);setFeedback(null)};if(!current.current){setCorrectionAccepted({});setPreview(null);setSnapshot(null);setAccepted(false);setSingleOperator(false);setChoices({})}},[p.draft])
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;stop.current=true}},[])
 function remember(value:ApplicationRegistration){const clean=readApplicationRegistration(value);current.current=clean;setWork(clean);return clean}
 function persist(value:ApplicationRegistration){
  // Retain an ID returned by the server even if the following local write fails.
  const clean=remember(value)
  expected.current=persistApplicationRegistration(localStorage,clean,expected.current)
 }
 function local(value:ApplicationRegistration){return localStorage.getItem(applicationRegistrationKey(value.review.reference))}
 function frozenMatch(saved:ApplicationRegistration,next:ApplicationRegistration){
  if(signature(saved.review)===signature(next.review))return
  const differences=applicationDifferences(saved.review.edited,next.review.edited).map(d=>`${d.location}：保存「${d.before}」／今回「${d.after}」`)
  if(saved.review.paid!==next.review.paid)differences.push(`確認済み入金額：保存 ${saved.review.paid}／今回 ${next.review.paid}`)
  for(const person of saved.review.edited.people)if(saved.review.choices[person.key]!==next.review.choices[person.key])differences.push(`${person.name}の対応：保存 ${saved.review.choices[person.key]}／今回 ${next.review.choices[person.key]??'未選択'}`)
  if(saved.review.original.digest!==next.review.original.digest)differences.push('原本ファイルの内容が保存時と異なります')
  throw new Error('同じ資料番号の確定時の原本・対応・金額と異なります。登録途中を開き、訂正版との差分を確認してください。\n'+differences.join('\n'))
 }
 function candidate(){
  if(current.current){
   if(local(current.current)!==expected.current)throw new Error('この端末の登録記録が別の画面で変わりました。現在の登録再開JSONを保存し、上書きせず確認してください。')
   return readApplicationRegistration(current.current)
  }
  if(!p.draft)throw new Error('Excelまたは登録再開JSONを開いてください')
  const next=readApplicationRegistration(createApplicationRegistration(p.draft)),raw=local(next)
  if(raw){const saved=parseApplicationRegistration(raw);frozenMatch(saved,next);expected.current=raw;remember(saved);p.onAdopt(saved.review);return saved}
  expected.current=null;return next
 }
 async function action(task:()=>Promise<void>|void,operation?:'save'|'review'){
  if(lock.current||p.isReviewBusy())return
  lock.current=true;setBusy(true);setError('');setMessage('')
  if(operation){
   if(operation==='save')stop.current=false
   setRunning(operation==='save')
   setFeedback({signature:activeReview?signature(activeReview):null,operation,state:'running',detail:'',progress:{...(shown?observedProgress(shown.plan,shown.work):{peopleConfirmed:0,peopleTotal:activeReview?.edited.people.length??0,entriesConfirmed:0,entriesTotal:activeReview?.edited.entries.length??0}),phase:'checking',detail:operation==='save'?'保存前の内容を確認しています':'登録結果を読み直しています'}})
  }
  try{await task()}catch(e){
   const reason=(e instanceof Error?e.message:'処理を完了できません')+(current.current?'\n現在の登録再開JSONを保存してください。再送する前に既存登録を照合してください。':'')
   setPreview(null);setSnapshot(null);setAccepted(false);setSingleOperator(false);setError(reason)
   if(operation){setFeedback(old=>old?{...old,state:'error',detail:reason,stopRequested:false,checkedAt:undefined}:old);focusFeedback()}
  }
  finally{lock.current=false;setBusy(false);setRunning(false)}
 }
 async function inspect(value:ApplicationRegistration,service=services(),focus=true){
  const s=await service.load(),plan=await reviewApplicationRegistration(value,s)
  setSnapshot(s);setPreview({work:copy(value),plan});setLastInspection({work:copy(value),plan,snapshot:s});setCorrectionAccepted({});setChoices({})
  if(focus&&typeof requestAnimationFrame==='function')requestAnimationFrame(()=>{const el=document.getElementById('application-registration');el?.scrollIntoView({block:'start',behavior:'smooth'});el?.focus({preventScroll:true})})
  return plan
 }
 function finishFeedback(plan:Plan,value:ApplicationRegistration,operation:'save'|'review'){
  const complete=completePlan(plan,value),stopped=operation==='save'&&stop.current&&!complete
  setFeedback({signature:signature(value.review),operation,state:complete?'success':stopped?'stopped':operation==='review'&&plan.ready?'ready':'attention',progress:observedProgress(plan,value),checkedAt:new Date().toISOString(),detail:complete?'人馬・出番・資格・グレードの保存結果を確認しました。出番表と精算を確認できます。':stopped?'保存できた分を確認しました。残りは再確認してから再開できます。':plan.ready?'内容の確認が終わりました。上の確認欄にチェックし、取り込むボタンを押してください。':plan.issues.join('\n')||'まだ保存が完了していない項目があります。確認してから再開してください。'})
  focusFeedback()
 }
 function restore(value:ApplicationRegistration){
  const clean=readApplicationRegistration(value),raw=local(clean)
  // A newer exported result may retain an ID that could not be written locally.
  // Accept only forward-compatible results, retaining the raw local value until explicit save.
  if(raw&&applicationRegistrationDifferences(parseApplicationRegistration(raw),clean).length)throw new Error('この端末の登録再開記録と原本・対応・保存結果が異なります。上書きせず「この資料番号の登録途中を開く」で確認してください。')
  if(current.current&&applicationRegistrationDifferences(current.current,clean).length)throw new Error('現在の保存結果を置き換えられません。最新の登録再開JSONを保存してから確認してください。')
  if(!p.canReplaceReview())return
  setFeedback(null);expected.current=raw;remember(clean);p.onAdopt(clean.review);setPreview(null);setSnapshot(null);setChoices({});setAccepted(false);setSingleOperator(false)
  setMessage('登録再開記録を開きました。「登録結果を再確認」で現在の結果を確認してください。開いただけでは登録は行いません。')
 }
 const correctionSource=!work&&p.draft&&!p.draft.rosterPreparation&&lastInspection&&lastInspection.work.review.original.digest===p.draft.original.digest&&lastInspection.work.review.reference===p.draft.reference&&lastInspection.work.review.edited.club===p.draft.edited.club?lastInspection:null
 const hasCorrections=!!correctionSource?.plan.people.some(r=>r.issues.length)
 const model=shown?.work??work,plan=shown?.plan??null,review=model?.review??p.draft
 const people=(review?.edited.people??[]).filter(()=>!!model||!!correctionSource).map(person=>{
  const recorded=model?.people[person.key],row=plan?.people.find(r=>r.key===person.key)
  const options=snapshot?rosterCandidates(person,snapshot.roster,review!.edited.club,{similar:true}).map(c=>({id:c.entity.id,name:c.entity.name,reading:c.entity.reading,jef:c.entity.jef_number??'',reason:c.reason,clubs:c.clubs})):[]
  const previous=correctionSource?.plan.people.find(r=>r.key===person.key)
  const before=correctionSource?.work.review.edited.people.find(r=>r.key===person.key)
  const roster=correctionSource?.snapshot.roster,selected=p.draft?.choices[person.key]??''
  // Retain inspected candidates while typing, including an explicitly selected identity.
  const ids=new Set(roster&&before?[...rosterCandidates(before,roster,review!.edited.club,{similar:true}),...rosterCandidates(person,roster,review!.edited.club,{similar:true})].map(c=>c.entity.id):[])
  ids.add(selected)
  const correction=correctionSource&&roster&&(previous?.issues.length||selected&&selected!=='new')?{
   person,selected,accepted:!!correctionAccepted[person.key],participantCount:roster.participants.filter(p=>p.entity_id===selected).length,original:review!.original.people.find(r=>r.key===person.key),club:review!.edited.club,
   affiliation:p.draft?.rosterEdits?.[person.key]??{entityId:selected,source:'application' as const,clubId:'',clubName:'',endClubIds:[]},
   clubs:roster.clubs.slice().sort((a,b)=>a.name.localeCompare(b.name,'ja')),
   currentClubs:roster.affiliations.filter(a=>a.entity_id===selected&&!a.ended_at).map(a=>({id:a.club_id,name:roster.clubs.find(c=>c.id===a.club_id)?.name??'所属名不明'})),
   candidates:roster.entities.filter(e=>ids.has(e.id)&&!e.archived_at&&e.kind===person.kind).map(e=>({id:e.id,name:e.name,reading:e.reading,jef:e.jef_number??'',reason:'照合時の候補',clubs:roster.affiliations.filter(a=>a.entity_id===e.id&&!a.ended_at).map(a=>roster.clubs.find(c=>c.id===a.club_id)?.name??'所属名不明')})),
  }:undefined
  return {key:person.key,label:`${person.kind==='rider'?'選手':'馬'} ${person.name}`,id:row?.entityId??recorded?.entityId,state:row?.issues.length?'要確認':plan?.pendingRoster.some(r=>r.key===person.key)?'仮確定・取り込み時に訂正':row?status(row.state):work?`端末記録：${status(recorded?.state??'unregistered')}（未再照合）`:'訂正中・再照合が必要',issues:row?.issues??previous?.issues??[],resolve:!!work&&recorded?.state==='unknown'&&!recorded.entityId,candidates:options,selected:choices[person.key]??'',correction}
 })
 const appReview=review?applicationReview(review.edited,review.paid,review.accountChecked):null
 const savedStates=Object.values(work?.entries?.states??{}),registered=savedStates.filter(s=>s==='registered').length,unknown=savedStates.filter(s=>s==='unknown').length
 const panel:ApplicationRegistrationPanelProps={
  complete:!!(plan&&model&&completePlan(plan,model)),
  feedback:feedback&&activeReview&&feedback.signature===signature(activeReview)?feedback:undefined,
  rosterCorrectionCount:plan?.pendingRoster.length??0,credentials:plan?.credentials,showAccountConfirmation:!!(p.draft&&!work&&!p.draft.accountChecked&&(plan||correctionSource)),hasCorrections,reviewStale:!!correctionSource&&!plan,
  busy:busy||p.isReviewBusy(),running,frozen:!!work,hasCheckpoint:!!work,hasPlan:!!plan,ready:!!plan?.ready&&(!!work||!p.canImport||p.canImport()),canReview:!!activeReview&&(!!work||!p.canImport||p.canImport()),canOpenSaved:!!activeReview?.reference.trim(),accepted,singleOperator,
  reference:review?.reference??'',originalTotal:review?.edited.amounts.total??'',paid:review?.paid??'',participantState:plan?(plan.participating?'登録済み':'未登録を含む'):work?`端末記録：${status(work.participants.state)}（未再照合）`:'未照合',savedSummary:`出番の端末記録：登録確認済み ${registered}件 ／ 結果不明 ${unknown}件 ／ 未登録・未記録 ${Math.max(0,(work?.review.edited.entries.length??0)-registered-unknown)}件`,message,error:error||plan?.issues.join('\n')||'',people,
  entries:(model?.review.edited.entries??[]).map((entry,i)=>{const row=plan?.entries?.rows.find(r=>r.index===i);return {key:entry.key,label:`第${entry.competition}競技 ／ ${review!.edited.people.find(p=>p.key===entry.rider)?.name??'選手未対応'} ／ ${review!.edited.people.find(p=>p.key===entry.horse)?.name??'馬未対応'}${entry.op?' ／ OP':''}`,fee:row?.fee??appReview?.report.entries[i]?.price??null,id:row?.registeredId??row?.id,state:row?.differences.length?'要確認':row?status(row.state):work?.entries?'未再照合（端末の途中記録あり）':'参加登録後に出番を照合',issues:row?.differences??[]}}),
  onReview:()=>void action(async()=>{
   setPreview(null);setSnapshot(null);setAccepted(false);setSingleOperator(false)
   const next=candidate()
   if(!current.current&&p.canImport&&!p.canImport())throw new Error('②で人馬を仮確定し、登録済み団体の場合は「登録済みの出番を残して、このExcelを取り込む」にチェックしてください。')
   const result=await inspect(next,services(),false);finishFeedback(result,next,'review')
   setMessage(completePlan(result,next)?'反映済みです。出番表と精算を確認できます。':result.ready?'照合が終わりました。確認一覧を見て、確定する場合は下の確認欄にチェックしてください。':'差分・未確認の項目があります。登録は行っていません。')
  },'review'),
  onAccepted:v=>{if(!lock.current)setAccepted(v)},onSingleOperator:v=>{if(!lock.current)setSingleOperator(v)},
  onRun:()=>void action(async()=>{
   if(!current.current&&p.canImport&&!p.canImport())throw new Error('②で人馬を仮確定し、登録済み団体の場合は「登録済みの出番を残して、このExcelを取り込む」にチェックしてください。')
   if(!shown?.plan.ready||!accepted||!singleOperator)throw new Error('最新の照合結果と、同時登録しないことを確認してください')
   setAccepted(false);setSingleOperator(false)
   await exclusive(async()=>{
    const next=candidate();frozenMatch(shown.work,next)
    if(!next.credentials)next.credentials=Object.fromEntries(shown.plan.credentials.filter(c=>c.value).map(c=>[c.key,{requestId:c.requestId,expected:c.expected}]))
    if(local(next)!==expected.current)throw new Error('登録記録が変わりました。上書きせず照合してください')
    const service=services(),fresh=await reviewApplicationRegistration(next,await service.load())
    if(!fresh.ready)throw new Error(fresh.issues.join('\n'))
    if(!alive.current)throw new Error('画面が閉じられたため登録を開始しませんでした')
    if(stop.current){finishFeedback(fresh,next,'save');return}
    persist(next);p.onAdopt(next.review);setPreview(null)
    const result=await runApplicationRegistration(next,{...service,persist,stop:()=>stop.current||!alive.current,onProgress:progress=>{if(alive.current)setFeedback(old=>old?{...old,progress}:old)}})
    setFeedback(old=>old?{...old,progress:{...old.progress,phase:'verifying',detail:'全件の保存結果を読み直しています'}}:old)
    const finalPlan=await inspect(result,service,false);finishFeedback(finalPlan,result,'save')
    p.onChanged?.()
    setMessage(completePlan(finalPlan,result)?'反映が完了しました。出番表と精算を確認できます。':stop.current?'停止しました。保存済みは保持しています。照合結果を確認して残りを再開できます。':'保存結果を読み直しました。登録済み・未登録・差分を一覧で確認してください。入金処理は行っていません。')
   })
  },'save'),
  onCorrectionAccepted:(key,value)=>{if(!lock.current)setCorrectionAccepted(old=>({...old,[key]:value}))},
  onSaveRoster:key=>void action(()=>exclusive(async()=>{
   if(current.current||!p.draft||!correctionSource||!correctionAccepted[key])throw new Error('同じ人馬の訂正であることと変更内容を確認してください')
   const person=p.draft.edited.people.find(x=>x.key===key),id=p.draft.choices[key]
   if(!person)throw new Error('訂正する人馬を確認してください')
   const input=rosterCorrectionInput(person,id,p.draft.edited.club,correctionSource.snapshot,crypto.randomUUID(),p.draft.rosterEdits?.[key])
   const service=services()
   setPreview(null);setAccepted(false);setSingleOperator(false);setCorrectionAccepted({})
   // Save the user's draft before any mutation; failure must not send the request.
   p.onBeforeRosterCorrection?.(input)
   let writeError:unknown
   try{await service.correctPerson(input)}catch(e){writeError=e}
   const fresh=await service.load(p.draft.edited.people.filter(p=>p.kind==='rider').map(p=>p.jef))
   p.onRosterCorrected?.(fresh)
   if(!rosterCorrectionMatches(input,fresh)){
    // Refresh candidates and diagnostics even after a conflict; never blindly resend.
    await inspect(createApplicationRegistration(p.draft),{...service,load:async()=>fresh})
    throw new Error((writeError instanceof Error?writeError.message:'訂正後の保存内容が一致しません')+'。入力は保持しています。最新の名簿と変更内容を確認してから保存してください')
   }
   await inspect(createApplicationRegistration(p.draft),{...service,load:async()=>fresh})
   p.onChanged?.()
   setMessage(`既存名簿の訂正と所属「${input.clubName}」を保存し、Winterの保存結果を読み直しました。終了を選んだ所属は履歴に残し、既存の出番・請求先・料金は保持しています。`)
  })),
  onStop:()=>{stop.current=true;setFeedback(old=>old?{...old,stopRequested:true}:old);setMessage('停止を受け付けました。処理中の1件の結果確認後に停止します。')},
  onChoice:(key,id)=>{if(!lock.current)setChoices(old=>({...old,[key]:id}))},
  onResolve:key=>void action(async()=>{
   if(!current.current||!choices[key])throw new Error('保存結果を照合する人馬を選択してください')
   await exclusive(async()=>{
    const value=candidate(),service=services(),next=await resolveUnknownApplicationPerson(value,key,choices[key],await service.load())
    persist(next);setAccepted(false);setSingleOperator(false);await inspect(next,service)
    setMessage('選択した既存人馬と照合し、再開記録を保存しました。新規登録・上書きは行っていません。照合結果を確認して再開してください。')
   })
  }),
  onOpenSaved:()=>void action(()=>{const reference=current.current?.review.reference??p.draft?.reference;if(!reference)throw new Error('資料番号を入力してください');const raw=localStorage.getItem(applicationRegistrationKey(reference));if(!raw)throw new Error('この資料番号の登録途中は端末にありません');restore(parseApplicationRegistration(raw))}),
  onRestoreFile:file=>void action(async()=>{if(file.size>8_000_000)throw new Error('登録再開ファイルは8MB以内です');restore(parseApplicationRegistration(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer())))}),
  onDownload:()=>void action(()=>{if(current.current){download(current.current);setMessage('登録再開JSONのダウンロードを開始しました。保存先で最新ファイルを確認してください。')}}),
  onClose:()=>void action(()=>{
   if(!current.current)return
   if(local(current.current)!==expected.current)throw new Error('別の画面で記録が変わっています。現在の入力を保持して照合してください。')
   persist(current.current);setFeedback(null);current.current=null;expected.current=null;setWork(null);setPreview(null);setSnapshot(null);setLastInspection(null);setChoices({});setAccepted(false);setSingleOperator(false);p.onClear()
   setMessage('取り込み記録をこの端末に保存しました。次の申込書を選んでください。')
  }),
 }
 return {panel,busy,frozen:!!work,isBusy:()=>lock.current,isFrozen:()=>current.current!==null,openRecord:restore,invalidate:(clearInspection=false)=>{if(!lock.current){if(clearInspection)setLastInspection(null);setFeedback(null);setPreview(null);setAccepted(false);setSingleOperator(false);setMessage('');setError('')}}}
}
