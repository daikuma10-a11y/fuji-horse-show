"use client"
import {useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import type {loadWinterData} from '@/lib/winter-data'
import {WinterInitialBatchFailure} from '@/lib/winter-initial-entry'
import {winterAffiliatedOrganizations} from '@/lib/winter-display-order'
import {savePostItems,type WinterPostItem} from '@/lib/winter-post-registration'
import {WinterReceptionData,WinterMasterDateSelect,WinterMasterCompetitionList,WinterMasterStartList} from './winter-reception-selectors'
import {LoadedWinterReception} from './winter-master-reception-form'
import type {MasterFormCompetition} from '@/lib/master/reception-form'
import type {StartEntry} from '@/lib/types'

type Props={
 data:Awaited<ReturnType<typeof loadWinterData>>
 session:AdminSession
 onSession:(session:AdminSession)=>void
 onChanged:()=>void
 onChooseParticipants:()=>void
}
type Editor={mode:'add'}|{mode:'change';entry:StartEntry}
const button='min-h-14 rounded-xl border-2 border-blue-800 bg-blue-800 px-5 py-3 text-xl font-bold text-white disabled:opacity-50'
const secondary='min-h-12 rounded-xl border-2 px-4 py-2 font-bold disabled:opacity-50'
const yen=(amount:number)=>amount.toLocaleString('ja-JP')+'円'

export function WinterPostRegistration({data,session,onSession,onChanged,onChooseParticipants}:Props){
 const [date,setDate]=useState(''),[competition,setCompetition]=useState<MasterFormCompetition|null>(null)
 const [editor,setEditor]=useState<Editor|null>(null),[items,setItems]=useState<WinterPostItem[]>([])
 const [busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false)
 const [error,setError]=useState(''),[message,setMessage]=useState('')
 const lock=useRef(false),heading=useRef<HTMLHeadingElement>(null)
 const groups=winterAffiliatedOrganizations(data)
 const disabled=busy||uncertain
 function returnToEntries(){
  setEditor(null)
  requestAnimationFrame(()=>heading.current?.scrollIntoView({block:'start'}))
 }
 function stage(item:WinterPostItem){
  if(items.length>=100)throw new Error('先に確認一覧の100件を保存してください')
  if(item.type==='change'&&items.some(old=>old.type==='change'&&old.row.inputs.entryId===item.row.inputs.entryId)){
   throw new Error('この出番の変更は確認一覧にあります。内容を直す場合は一覧から外してください。')
  }
  setItems(previous=>[...previous,item])
  setError('')
  setMessage(`${item.type==='add'?'追加・再走行':'変更'}を確認一覧に入れました。続けて入力できます。`)
 }
 function start(next:Editor){
  setError('');setMessage('')
  setEditor(next)
  requestAnimationFrame(()=>heading.current?.scrollIntoView({block:'start'}))
 }
 async function save(){
  if(lock.current||!items.length||editor)return
  lock.current=true;setBusy(true);setError('');setMessage('')
  let verified=false
  try {
   const current=await verifyAdminSession(session)
   onSession(current);verified=true
   await savePostItems(items,current.accessToken,ids=>{
    setItems(previous=>previous.filter(item=>!ids.includes(item.id)))
   })
   setUncertain(false)
   setMessage(`${items.length}件の精算への保存を確認しました。続けて入力できます。`)
   onChanged()
  } catch(failure) {
   if(verified)setUncertain(failure instanceof WinterInitialBatchFailure&&(failure.uncertain||(uncertain&&!failure.completedIds.length)))
   const count=failure instanceof WinterInitialBatchFailure?failure.completedIds.length:0
   if(count)onChanged()
   setError((count?`${count}件は保存済みです。残りの一覧を確認してください。 `:'')+(failure instanceof Error?failure.message:'精算への保存を確認できません'))
  } finally {lock.current=false;setBusy(false)}
 }
 return <WinterReceptionData data={data}><section className="space-y-4" aria-label="事後登録">
  <h2 ref={heading} className="scroll-mt-4 text-2xl font-bold">事後登録（追加・変更）</h2>
  {message&&<p role="status" className="rounded-xl bg-green-50 p-3">{message}</p>}
  {error&&<p role="alert" className="rounded-xl bg-red-100 p-3">{error}</p>}
  {editor&&competition?
   <LoadedWinterReception scope="post" data={data} mode={editor.mode} post={{visitorName:session.email,onItem:stage}}
    initialCompetition={competition} initialEntry={editor.mode==='change'?editor.entry:undefined} onClose={returnToEntries}/>:
   <fieldset disabled={disabled} className="space-y-4">
    {items.length>0&&<button type="button" className={secondary} onClick={()=>document.getElementById('winter-post-review')?.scrollIntoView({block:'start'})}>確認一覧へ（{items.length}件）</button>}
    <p>現場で受けた追加・再走行と変更を、精算だけに登録します。</p>
    {!data.riders.length||!data.horses.length?<button className={secondary} type="button" onClick={onChooseParticipants}>人馬の登録で参加人馬を選ぶ</button>:
     !date?<><h3 className="text-xl font-bold">大会日を選んでください</h3><WinterMasterDateSelect onSelect={setDate}/></>:
     !competition?<><button type="button" className={secondary} onClick={()=>setDate('')}>日付を選び直す</button>
      <h3 className="text-xl font-bold">{date} の競技を選んでください</h3><WinterMasterCompetitionList date={date} onSelect={setCompetition}/></>:
      <><div className="flex flex-wrap gap-2"><button type="button" className={secondary} onClick={()=>setCompetition(null)}>競技を選び直す</button>
       <button type="button" className={secondary} onClick={()=>{setCompetition(null);setDate('')}}>日付を選び直す</button></div>
       <h3 className="text-xl font-bold">{date}　第{competition.number}競技 {competition.name}</h3>
       <button type="button" className={button} onClick={()=>start({mode:'add'})}>この競技に追加・再走行</button>
       <h4 className="text-xl font-bold">変更する場合は、元の出番を選んでください</h4>
       <WinterMasterStartList competitionId={competition.id} hideWithdrawn onSelect={entry=>start({mode:'change',entry})}/>
      </>}
   </fieldset>}
  {items.length>0&&!editor&&<section id="winter-post-review" className="space-y-3 rounded-xl border-2 p-4">
   <h3 className="text-xl font-bold">事後登録の確認一覧（未保存 {items.length}件）</h3>
   <ul className="divide-y">{items.map(item=><li key={item.id} className="space-y-1 py-3">
    <p><strong>{item.type==='add'?'追加・再走行':'変更'}</strong>　{item.summary}</p>
    <p>請求先：{groups.find(org=>org.id===item.billingOrg)?.name}　{yen(item.total)}</p>
    {item.type==='change'&&<p>変更内容・理由：{item.row.note}</p>}
    <button type="button" className={secondary} disabled={disabled} onClick={()=>{setMessage('');setError('');setItems(rows=>rows.filter(row=>row.id!==item.id))}}>一覧から外す</button>
   </li>)}</ul>
   <p className="text-xl font-bold">合計 {yen(items.reduce((sum,item)=>sum+item.total,0))}</p>
   <button type="button" className={button} disabled={busy} onClick={()=>void save()}>{busy?'保存を確認中…':uncertain?'同じ登録番号で保存を再確認':'この一覧を精算だけに保存'}</button>
  </section>}
 </section></WinterReceptionData>
}
