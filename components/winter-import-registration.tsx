'use client'
import {useEffect,useMemo,useRef,useState,type ChangeEvent} from 'react'
import Link from 'next/link'
import {SharedRosterManager} from './shared-roster-manager'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {WINTER_EVENT_ID,winterStorageKey} from '@/lib/winter-event'
import {loadWinterData} from '@/lib/winter-data'
import {loadWinterInitialCharges} from '@/lib/winter-settlement'
import {saveWinterInitialEntry} from '@/lib/winter-initial-entry'
import {reviewWinterImport,type ImportSource} from '@/lib/winter-import-review'
import {importBindingKey,importReference,importCheckpointDifferences,readImportCheckpoint,reviewImportRegistration,runImportRegistration,type ImportBindings,type ImportCheckpoint,type ImportSnapshot} from '@/lib/winter-import-registration'

const button='min-h-14 rounded-xl border-2 border-blue-800 px-5 py-3 text-xl font-bold disabled:opacity-40'
const field='mt-2 min-h-14 w-full rounded-xl border-2 p-3 text-lg'
const sessionKey=winterStorageKey('admin-session')
const checkpointKey=(reference:string)=>winterStorageKey('import-registration')+':'+encodeURIComponent(importReference(reference))
function download(checkpoint:ImportCheckpoint){
 const url=URL.createObjectURL(new Blob([JSON.stringify(checkpoint,null,2)],{type:'application/json'}))
 const a=document.createElement('a');a.href=url;a.download='Winter-登録再開.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
export function WinterImportRegistration({source,confirmed,onRestore,onBusy}:{source:ImportSource;confirmed:boolean;onRestore:(source:ImportSource)=>void;onBusy:(busy:boolean)=>void}){
 const [session,setSession]=useState<AdminSession|null>(null),[snapshot,setSnapshot]=useState<ImportSnapshot|null>(null)
 const [reference,setReference]=useState(''),[bindings,setBindings]=useState<ImportBindings>({}),[checkpoint,setCheckpoint]=useState<ImportCheckpoint|null>(null)
 const [plan,setPlan]=useState<Awaited<ReturnType<typeof reviewImportRegistration>>|null>(null)
 const [message,setMessage]=useState(''),[busy,setBusy]=useState(false),[accepted,setAccepted]=useState(false),[rosterOpen,setRosterOpen]=useState(false)
 const lock=useRef(false),stop=useRef(false)
 const report=useMemo(()=>reviewWinterImport(source),[source])
 useEffect(()=>{setPlan(null);setAccepted(false)},[source,reference,bindings,confirmed])
 async function verified(){
  const raw=sessionStorage.getItem(sessionKey);if(!raw)throw new Error('Winter大会本部でログインしてから、この画面に戻ってください')
  const next=await verifyAdminSession(JSON.parse(raw) as AdminSession)
  sessionStorage.setItem(sessionKey,JSON.stringify(next));setSession(next);return next
 }
 async function load(){
  const next=await verified()
  const [data,initial]=await Promise.all([loadWinterData(),loadWinterInitialCharges(next.accessToken)])
  const value={data,initial};setSnapshot(value);return value
 }
 function current():ImportCheckpoint{return {kind:'winter-import-registration',version:1,eventId:WINTER_EVENT_ID,reference:importReference(reference),source:{...source},bindings:{...bindings},states:{}}}
 function existing(next:ImportCheckpoint){
  const raw=localStorage.getItem(checkpointKey(next.reference))
  const saved=raw?readImportCheckpoint(JSON.parse(raw)):checkpoint?.reference===next.reference&&Object.keys(checkpoint.states).length?checkpoint:null
  if(saved){
   const differences=importCheckpointDifferences(saved,next)
   if(differences.length){setCheckpoint(saved);throw new Error(differences.join('\n')+'。保存済み再開資料に戻してください。訂正版は既存の変更・精算手順で差分を確認し、別番号で再登録しないでください')}
  }
  return saved??next
 }
 function persist(value:ImportCheckpoint){
  const text=JSON.stringify(value),key=checkpointKey(value.reference)
  const prior=localStorage.getItem(key)
  if(prior&&importCheckpointDifferences(readImportCheckpoint(JSON.parse(prior)),value).length)throw new Error('別の画面で同じ資料番号の原本・対応が変わりました。上書きせず停止します')
  localStorage.setItem(key,text)
  if(localStorage.getItem(key)!==text)throw new Error('途中再開の記録を保存できません。登録を停止しました')
  setCheckpoint(value)
 }
 async function action(task:()=>Promise<void>){
  if(lock.current)return;lock.current=true;setBusy(true);onBusy(true);setMessage('')
  try{await task()}catch(e){setMessage(e instanceof Error?e.message:'処理を完了できません。再開資料を保持して照合し直してください')}
  finally{lock.current=false;setBusy(false);onBusy(false)}
 }
 async function review(){await action(async()=>{
  if(!confirmed)throw new Error('Winterの原本であることを確認してください')
  setPlan(null);setAccepted(false)
  const next=existing(current()),result=await reviewImportRegistration(next,await load())
  setCheckpoint(next);setPlan(result)
  setMessage(result.ready?'原本・所属・人馬・競技・料金・既存登録を照合しました。確認一覧を見てから確定してください。':'差分または未確認の項目があります。登録は行っていません。')
 })}
 async function save(){await action(async()=>{
  if(!accepted||!confirmed||!plan?.ready)throw new Error('確認一覧と原本を確認してから確定してください')
  const next=existing(current());stop.current=false
  persist(next);download(next);setAccepted(false)
  try{
   const result=await runImportRegistration(next,{load,save:async input=>saveWinterInitialEntry(input,(await verified()).accessToken),persist,stop:()=>stop.current})
   // Re-display authoritative results after saving; original version only cleared the plan.
   setPlan(await reviewImportRegistration(result,await load()))
   setMessage(stop.current?'停止しました。保存済み行は保持しています。同じ資料で照合し直すと再開できます。':'登録結果を確認しました。原本総額・入金額は再開資料内に保持し、DBの入金記録は変更していません。')
  }catch(e){setPlan(null);throw e}
  finally{const raw=localStorage.getItem(checkpointKey(next.reference));if(raw)setCheckpoint(readImportCheckpoint(JSON.parse(raw)))}
 })}
 function restore(value:ImportCheckpoint){
  const raw=localStorage.getItem(checkpointKey(value.reference))
  if(raw){const saved=readImportCheckpoint(JSON.parse(raw));if(importCheckpointDifferences(saved,value).length)throw new Error('この端末に同じ資料番号の異なる再開記録があります。上書きせず原本と保存済み資料を確認してください')}
  setCheckpoint(value);setReference(value.reference);setBindings(value.bindings);onRestore(value.source);setPlan(null);setAccepted(false)
 }
 async function file(event:ChangeEvent<HTMLInputElement>){
  const file=event.target.files?.[0];event.target.value='';if(!file)return
  await action(async()=>{if(file.size>8_000_000)throw new Error('再開資料は8MB以内です');restore(readImportCheckpoint(JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await file.arrayBuffer()))));setMessage('再開資料を開きました。照合ボタンでDBの結果を確認します。')})
 }
 const retained=checkpoint&&checkpoint.reference===reference?checkpoint:null
 const sourceDifferences=retained?(['roster','entries','accounts'] as const).filter(key=>retained.source[key]!==source[key]):[]
 return <section className="space-y-4 rounded-xl border-2 border-blue-800 bg-white p-5" aria-label="取込資料から事前登録">
  <h3 className="text-2xl font-bold">既存名簿との照合・事前エントリー登録</h3>
  <p>対応形式は上の3つのCSV UTF-8／TSV雛形です。申込書の.xlsx・PDFを直接登録する機能ではありません。資料を読み込むだけでは登録しません。</p>
  <p>団体・選手・馬を、それぞれ所属を含めて明示選択します。ふりがな・資格は原本確認用で、名簿を自動更新しません。未登録の人馬は既存の「人馬名簿」で追加し、参加チェックを保存してから照合してください。</p>
  <p className="font-bold">原本の出番は照合用です。新規登録は既存処理により仮出番表の末尾に追加されます。正式な順序の反映は既存の出番表操作で行ってください。</p>
  <Link className={button+' inline-block'} href="/winter/admin">Winter大会本部でログイン</Link>
  <label className="block text-lg">資料番号（原本の受付番号など。訂正版・再取込・別端末でも同じ番号）<input className={field} value={reference} maxLength={100} disabled={busy} onChange={e=>setReference(e.target.value)}/></label>
  <div className="flex flex-wrap gap-3">
   <button className={button} disabled={busy} onClick={()=>void action(async()=>{setPlan(null);setAccepted(false);await load();setMessage('Winterの参加名簿と登録履歴を読み込みました。原本との対応を選択してください')})}>参加名簿・登録履歴を読む</button>
   <button className={button} disabled={busy||!reference.trim()} onClick={()=>void action(async()=>{const raw=localStorage.getItem(checkpointKey(reference));if(!raw)throw new Error('この資料番号の再開記録はこの端末にありません');restore(readImportCheckpoint(JSON.parse(raw)));setMessage('端末の再開資料を開きました。Winter原本のチェックと照合を行ってください')})}>この端末の再開資料を開く</button>
   <label className={button}>登録再開JSONを開く<input type="file" accept=".json" disabled={busy} className="block max-w-full text-base" onChange={e=>void file(e)}/></label>
  </div>
  {session&&<><button className={button} disabled={busy} onClick={()=>setRosterOpen(!rosterOpen)}>既存の人馬名簿を{rosterOpen?'閉じる':'開く'}</button>{rosterOpen&&!busy&&<SharedRosterManager session={session} onParticipantsSaved={()=>{setSnapshot(null);setPlan(null);setAccepted(false);setMessage('参加チェック保存後は、参加名簿・登録履歴を読み直してください')}}/>}</>}
  {snapshot&&<div className="space-y-3">{report.people.map(p=>{
   const options=p.kind==='団体'?snapshot.data.organizations:p.kind==='選手'?snapshot.data.riders:snapshot.data.horses
   const key=importBindingKey(p.kind,p.id)
   return <label key={key} className="block rounded-lg border p-3">原本：{p.kind} {p.id} ／ {p.name} ／ 所属 {p.org||'—'} ／ 日馬連 {p.jef||'未登録'} ／ 読み {p.reading||'未確認'}
    <select className={field} value={bindings[key]??''} disabled={busy} onChange={e=>{const id=e.target.value;setBindings(old=>{const next={...old};if(id)next[key]=id;else delete next[key];return next})}}><option value="">既存名簿から明示選択</option>{options.map(x=><option key={x.id} value={x.id}>{x.name}{'organization_id' in x?` ／ ${snapshot.data.organizations.find(o=>o.id===x.organization_id)?.name??'所属不明'}`:''} ／ {x.id}</option>)}</select>
   </label>
  })}</div>}
  {sourceDifferences.map(key=><details key={key} className="rounded-lg bg-amber-100 p-3"><summary>{key}：保存済み原本との差分があります（登録を停止）</summary><p>保存済み</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap">{retained?.source[key]}</pre><p>現在の入力</p><pre className="max-h-64 overflow-auto whitespace-pre-wrap">{source[key]}</pre></details>)}
  <button className={button} disabled={busy||!confirmed} onClick={()=>void review()}>原本と既存登録を照合・確認一覧を作る</button>
  {plan&&<div className="space-y-3">
   {plan.issues.length>0&&<ul className="max-h-96 overflow-auto bg-red-50 p-4">{plan.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul>}
   <div className="overflow-x-auto"><table className="w-full border-collapse text-lg"><caption className="text-left font-bold">登録確認一覧（全{plan.rows.length}件）</caption><thead><tr>{['原本行','競技・人馬','請求所属','料金','状態・差分'].map(t=><th className="border p-2" key={t}>{t}</th>)}</tr></thead><tbody>{plan.rows.map(row=><tr key={row.id}><td className="border p-2">{row.index+2}</td><td className="border p-2">{row.input.competition.competition_no} ／ {row.input.rider.name} ／ {row.input.horse.name} {row.input.selection.isOp?'OP':''}</td><td className="border p-2">{snapshot?.data.organizations.find(x=>x.id===row.input.rider.organization_id)?.name}</td><td className="border p-2">¥{row.fee.toLocaleString('ja-JP')}</td><td className="border p-2">{row.state==='registered'?'登録済み':row.state==='unknown'?'結果不明（同じ番号で確認・再送）':'未登録'}{row.differences.map((d,i)=><p className="text-red-800" key={i}>{d}</p>)}</td></tr>)}</tbody></table></div>
   <p>原本請求総額 ¥{plan.report.initialTotal.toLocaleString('ja-JP')} ／ 原本で確認した入金額 ¥{plan.report.paidTotal.toLocaleString('ja-JP')}。いずれも出番の計算とは別に再開資料へ保持します。精算DBへの登録・入金済みへの変更は行いません。</p>
   <label className="flex gap-3 p-3 text-lg"><input type="checkbox" className="size-7" disabled={busy||!plan.ready} checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>原本・資格・所属・会員区分・料金・差分を確認しました。未登録の行だけを既存の事前登録処理で確定します。</label>
   <button className={button+' bg-blue-800 text-white'} disabled={busy||!accepted||!plan.ready} onClick={()=>void save()}>管理者として確定・1件ずつ登録／再開</button>
  </div>}
  {busy&&<button className={button} onClick={()=>{stop.current=true;setMessage('停止を受け付けました。処理中の1件の結果確認後に停止します')}}>処理中の1件を確認して停止</button>}
  {checkpoint&&<><button className={button} disabled={busy} onClick={()=>download(checkpoint)}>原本・対応・途中結果を再開JSONに保存</button><p>端末記録：登録確認済み {Object.values(checkpoint.states).filter(x=>x==='registered').length}件 ／ 結果不明 {Object.values(checkpoint.states).filter(x=>x==='unknown').length}件。端末記録だけで完了とは判定しません。未記録の行は未登録としてDBと照合します。</p></>}
  <p>再開資料には原本の氏名・金額が含まれます。閉じる前や端末を替える前に保存してください。訂正版は元と同じ資料番号・再開JSONで差分を確認し、行の追加・削除・並べ替えを含め、既存の変更手順で扱います。</p>
  {message&&<p role="status" className="whitespace-pre-wrap rounded-xl bg-blue-100 p-4 text-lg">{message}</p>}
 </section>
}
