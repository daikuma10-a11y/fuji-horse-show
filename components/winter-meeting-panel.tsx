"use client"
import {requestMonitorDisplay} from "./master/monitor-fullscreen"
import {SharedRosterManager} from './shared-roster-manager'
import {timetablePhase} from '@/lib/master/timetable'
import {useEffect,useRef,useState} from 'react'
import {emptyWinterQueue,readWinterQueue,writeWinterQueue,validateWinterQueue,winterDraftSummary,submitWinterBatch,WinterBatchRejected,type WinterQueue} from '@/lib/winter-batch'
import {meetingRows,meetingBaseline,updateMeetingWork,meetingDisplay,newMeetingWork,savedMeetingContent,restoreMeeting,meetingTransaction} from '@/lib/winter-meeting'
import {meetingOrderAfterMove} from '@/lib/master/meeting-preview'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {MasterStartSelectors} from './master/start-list-controls'
import {MasterStartDaySection,jumpToStartCompetition} from './master/start-list-day'
import {MasterStartRows} from './master/start-list-rows'
import {MasterCompetitionTime} from './master/timetable'
import {MeetingActionDialog} from './master/meeting-action-dialog'
import {MonitorStatus} from './master/monitor-status'
import {WinterReceptionData} from './winter-reception-selectors'
import {LoadedWinterReception} from './winter-master-reception-form'
import {LoadedWinterWithdraw} from './winter-withdraw-form'
import {winterMasterDates,winterMasterCompetition} from '@/lib/winter-master-reception'
import {winterTimetableSection} from '@/lib/winter-event'
import {winterCompetitionLabel,compareWinterOrganizations} from '@/lib/winter-display-order'
import type {loadWinterData} from '@/lib/winter-data'
import type {StartEntry} from '@/lib/types'

type Data=Awaited<ReturnType<typeof loadWinterData>>
type Editor={mode:'add'|'change'|'withdraw';comp:Data['competitions'][number];entry?:StartEntry}
const weekend=winterMasterDates.filter(d=>[0,6].includes(new Date(d.value+'T00:00:00Z').getUTCDay()))
const button='inline-flex min-h-12 items-center rounded-xl border-2 px-4 py-2 font-bold disabled:opacity-50'
const read=()=>readWinterQueue(window.localStorage,'meeting')
const same=(a:WinterQueue,b:WinterQueue)=>JSON.stringify(a)===JSON.stringify(b)
export function WinterMeetingPanel({data,dataError,session,onSession,onChanged,onStartlist,active=true,disconnected=false}:{disconnected?:boolean;data:Data|null;dataError:string;session:AdminSession;onSession:(s:AdminSession)=>void;onChanged:()=>void;onStartlist:(date:string)=>void;active?:boolean}){
 const [date,setDate]=useState<string>(weekend[0].value),[queue,setQueue]=useState<WinterQueue|null>(null)
 const [error,setError]=useState(''),[message,setMessage]=useState(''),[busy,setBusy]=useState(false),[confirmed,setConfirmed]=useState(false)
 const [showRoster,setShowRoster]=useState(false)
 const [available,setAvailable]=useState<boolean|null>(null),[channel,setChannel]=useState(''),[pick,setPick]=useState<StartEntry>(),[editor,setEditor]=useState<Editor>()
 const [extraLarge,setExtraLarge]=useState(false)
 const lock=useRef(false),dialog=useRef<HTMLDialogElement>(null),section=useRef<HTMLHeadingElement>(null)
 const current=queue??emptyWinterQueue(),work=current.meeting,locked=busy||current.attempted
 const preview=data?meetingRows(data,current):null,display=data&&preview?meetingDisplay(data,date,current,preview):null
 const stateRef=useRef(display);stateRef.current=display
 const displayKey=display?JSON.stringify({...display,updatedAt:''}):''
 function store(next:WinterQueue){writeWinterQueue(window.localStorage,next,'meeting');setQueue(next);setConfirmed(false)}
 function load(){if(lock.current)return;try{setQueue(read());setConfirmed(false)}catch(e){setError(String(e))}}
 useEffect(()=>{
  load()
  setExtraLarge(window.sessionStorage.getItem('winter-meeting-extra-large')==='true')
  let token=window.sessionStorage.getItem('winter-meeting-display');if(!token||!/^winter-meeting-[a-f0-9-]{36}$/.test(token)){token='winter-meeting-'+crypto.randomUUID();window.sessionStorage.setItem('winter-meeting-display',token)}setChannel(token);window.addEventListener('storage',load);window.addEventListener('winter-queue-changed',load);return()=>{window.removeEventListener('storage',load);window.removeEventListener('winter-queue-changed',load)}},[])
 useEffect(()=>{
  if(!active)return
  let live=true
  meetingTransaction('load',null,session.accessToken).then(record=>{
   if(!live)return;setAvailable(true)
   const local=read()
   if(record&&!lock.current&&!local.items.length&&!local.meeting&&!local.attempted)store(restoreMeeting(record))
  }).catch(e=>{if(live){setAvailable(e?.status===404?false:null);if(e?.status!==404)setError('本部の下書きを読み込めません。通信・ログインを確認してください')}})
  return ()=>{live=false}
 },[active,session.accessToken])
 useEffect(()=>{
  if(!active||!channel||!displayKey||dataError||disconnected||typeof BroadcastChannel==='undefined')return
  const link=new BroadcastChannel(channel)
  const send=()=>{if(stateRef.current)link.postMessage({kind:'meeting-preview',state:stateRef.current,extraLarge})}
  link.onmessage=e=>{if(e.data?.kind==='meeting-query')send()};send()
  const timer=window.setInterval(()=>link.postMessage({kind:'meeting-alive'}),2000)
  return ()=>{clearInterval(timer);link.postMessage({kind:'meeting-closed'});link.close()}
 },[channel,displayKey,active,extraLarge,dataError,disconnected])
 useEffect(()=>{const el=dialog.current;if(!editor||!el)return;if(!el.open)el.showModal();return()=>{if(el.open)el.close()}},[editor])
 function edit(fn:(q:WinterQueue)=>WinterQueue){
  try{if(!queue||locked)return;const local=read();if(!same(local,queue))throw new Error('別画面で変更されています。下書きを開き直してください');store(fn(local));setError('')}
  catch(e){setError(e instanceof Error?e.message:'下書きを変更できません')}
 }
 function move(id:string,source:string,target:string){
  if(!data||!preview||available!==true)return
  const rows=preview.rows.filter(e=>e.competitionId===id)
  edit(q=>{const m=q.meeting??newMeetingWork();return {...q,meeting:{...m,saved:false,baselines:{...m.baselines,[id]:m.baselines[id]??meetingBaseline(data,id)},orders:{...m.orders,[id]:meetingOrderAfterMove(rows,source,target)}}}})
 }
 function remove(id:string){if(data)edit(q=>updateMeetingWork(data,q,{...q,items:q.items.filter(i=>winterDraftSummary(i).id!==id)}))}
 function begin(mode:Editor['mode'],comp:Editor['comp'],entry?:StartEntry){
  if(locked)return
  setError('');setShowRoster(false);setPick(undefined);setEditor({mode,comp,entry})
 }
 async function operate(action:'save'|'apply'|'load'|'archive'){
  if(!queue||!data||lock.current)return
  if(action==='apply'&&!current.attempted&&!confirmed)return
  if(action==='archive'&&!window.confirm('全競技の下書きを取り消し、最新の正式出番表からやり直しますか？'))return
  if(action==='load'&&(queue.items.length||work)&&!window.confirm('端末の編集中の内容を、本部に保存した下書きで置き換えますか？'))return
  lock.current=true;setBusy(true);setError('');setMessage('')
  let before=queue
  try{
   function unchanged(){if(!same(read(),before))throw new Error('別画面で保留内容が変わりました。端末の内容を再確認してください')}
   unchanged()
   const verified=await verifyAdminSession(session);onSession(verified);unchanged()
   if(action==='load'){const record=await meetingTransaction('load',null,verified.accessToken);unchanged();if(record)store(restoreMeeting(record));else setMessage('本部に保存済みの下書きはありません。');setAvailable(true);return}
   if(action==='archive'){if(work?.revision)await meetingTransaction('archive',work,verified.accessToken);unchanged();store(emptyWinterQueue());onChanged();return}
   if(action==='save'){
    const m=work??newMeetingWork();before={...before,meeting:m};store(before)
    const content=savedMeetingContent(data,before)
    const record=await meetingTransaction('save',m,verified.accessToken,content);unchanged()
    if(!record||record.id!==m.id||record.status!=='draft')throw new Error('下書きの保存結果を確認してください')
    store(restoreMeeting(record));setMessage('全競技の下書きを本部に保存しました。');return
   }
   before={...before,attempted:true};store(before)
   if(work?.saved&&work.revision){const record=await meetingTransaction('apply',work,verified.accessToken);if(record?.status!=='applied'||record.id!==work.id)throw new Error('最終確定の結果を確認してください')}
   else {if(work?.revision||Object.keys(work?.orders??{}).length)throw new Error('全競技の下書きを保存してから確定してください');await submitWinterBatch(before,verified.accessToken,'meeting')}
   unchanged();store(emptyWinterQueue());onChanged();setMessage('正式出番表と精算へ反映しました。')
  }catch(e){
   if(before.attempted&&(e instanceof WinterBatchRejected||((e as {status?:number})?.status??0)>=400&&((e as {status?:number})?.status??0)<500)&&same(read(),before))store({...before,attempted:false})
   setError(e instanceof Error?e.message:'保存結果を確認できません。同じ番号で再確認してください')
  }finally{lock.current=false;setBusy(false)}
 }
 function exportDraft(){if(!queue)return;const url=URL.createObjectURL(new Blob([JSON.stringify({kind:'winter-meeting-draft',queue},null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download='Winter-meeting-draft.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 async function importDraft(file:File){try{if(file.size>4_000_000||locked)throw new Error('この下書きは取り込めません');const obj=JSON.parse(await file.text());if(obj.kind!=='winter-meeting-draft')throw new Error('打ち合わせ会の保留ファイルを選択してください');const next=validateWinterQueue(obj.queue,'meeting');if(window.confirm('現在の端末の保留一覧をこの下書きで置き換えますか？'))edit(()=>next)}catch(e){setError(String(e))}}
 const competitions=data?.competitions.filter(c=>c.competition_date===date)??[]
 const programOrder=new Map(data?.competitions.map((competition,index)=>[competition.id,index]))
 const summaries=current.items.map(winterDraftSummary).sort((a,b)=>(programOrder.get(a.competitionId)??Infinity)-(programOrder.get(b.competitionId)??Infinity))
 const groups=Array.from(new Map(summaries.map(s=>[s.organizationId,{id:s.organizationId,name:s.organizationName}])).values()).sort(compareWinterOrganizations)
 const monitorUrl='/winter/monitor#'+channel
 const selectedModel=pick&&preview?.models.get(pick.competitionId)
 const hasWork=!!(summaries.length||Object.keys(work?.orders??{}).length)
 return <>
  <section className="space-y-4 rounded-xl border-2 p-5" aria-labelledby="meeting-startlist-title">
   <h2 id="meeting-startlist-title" className="text-2xl font-bold">打ち合わせ会の出番表</h2>
   <div className="flex flex-wrap gap-2">
    <button className={button} disabled={!channel} onClick={()=>{if(!requestMonitorDisplay(channel))window.open(monitorUrl,'fhs-winter-meeting-display','popup')}}>打ち合わせ会のモニター表示</button>
    <button className={button} onClick={()=>onStartlist(date)}>この日の正式出番表を見る</button>
    <button className={button} onClick={()=>section.current?.focus()}>全競技の確認一覧へ</button>
    <label className="inline-flex min-h-12 items-center gap-2 px-2 font-bold">
     <input type="checkbox" className="size-5" checked={extraLarge} onChange={event=>{
      const checked=event.currentTarget.checked
      setExtraLarge(checked)
      window.sessionStorage.setItem('winter-meeting-extra-large',String(checked))
     }}/>モニターの文字を特大にする
    </label>
   </div>
   {active&&channel&&<MonitorStatus token={channel} displayPath={monitorUrl}/>}
   <p>選手名・馬名を押すと変更・棄権を選べます。{available&&'移動マークを押したまま上下に動かすと、相談中の出番順を変更できます。'}</p>
   <MasterStartSelectors dates={weekend} date={date} competitions={competitions.map(c=>({id:c.id,number:c.competition_no,name:c.name,official:c.official}))} selectedId="" wide={false} busy={busy} jump onDate={setDate} onCompetition={id=>jumpToStartCompetition('meeting-'+id)}/>
   {!data?<p role="status">{dataError?'出番表を取得できません。「最新の情報を確認」で再読み込みしてください。':'出番表を読み込んでいます…'}</p>:!competitions.length?<p>この日の競技はありません。</p>:competitions.map(c=>{
    const venue=winterTimetableSection(c.competition_no),time=data.timetable.find(t=>t.competition_id===c.id)
    return <MasterStartDaySection key={c.id} id={'meeting-'+c.id} title={winterCompetitionLabel(c)} official={c.official} wide={false}>
     {venue?.startListVenue&&<p>会場：{venue.startListVenue}</p>}
     <MasterCompetitionTime inspection={time?.inspection_time} start={time?.start_time} phase={timetablePhase(time)} showInspection={venue?.showInspection}/>
     <MasterStartRows model={preview!.models.get(c.id)!} competitionId={c.id} compact dense showAdminChanges draftEntries={preview!.rows.filter(e=>e.competitionId===c.id)} adminReorder={available===true&&!locked} onReorder={(a,b)=>move(c.id,a,b)} onNameSelect={row=>{if(locked||row.withdrawn)return;if(row.id.startsWith('request:')){setError('入力済みの人馬は確認一覧から外して入力し直してください');section.current?.focus();return}setPick(row)}}/>
     <button className={button} disabled={locked||!queue} onClick={()=>begin('add',c)}>この競技に追加</button>
    </MasterStartDaySection>
   })}
   <MeetingActionDialog entry={pick} rider={pick&&selectedModel?.getPlayer(pick.playerId)?.name} horse={pick&&selectedModel?.getHorse(pick.horseId)?.name} onClose={()=>setPick(undefined)} onChoose={mode=>{const comp=competitions.find(c=>c.id===pick?.competitionId);if(comp&&pick)begin(mode,comp,pick)}}/>
   <dialog ref={dialog} onCancel={()=>setEditor(undefined)} aria-label="打ち合わせ会の保留入力" className="m-auto max-h-[95dvh] w-[96vw] max-w-5xl overflow-y-auto rounded-xl bg-white p-4 backdrop:bg-black/40">
    {editor&&data&&<><button className={button} onClick={()=>setEditor(undefined)}>入力を閉じる</button> {editor.mode!=='withdraw'&&<section className="my-3"><button type="button" className={button} aria-expanded={showRoster} onClick={()=>setShowRoster(v=>!v)}>{showRoster?'人馬名簿を閉じる':'新しい選手・馬を登録'}</button>{showRoster&&<><p>名簿に登録した後、所属団体で参加チェックを保存すると、この入力欄で選べます。</p><SharedRosterManager session={session} onParticipantsSaved={onChanged}/></>}</section>}<WinterReceptionData data={data}>{editor.mode==='withdraw'?<LoadedWinterWithdraw data={data} scope="meeting" initialCompetition={winterMasterCompetition(editor.comp)} initialEntry={editor.entry} onClose={()=>setEditor(undefined)}/>:<LoadedWinterReception data={data} scope="meeting" mode={editor.mode} initialCompetition={winterMasterCompetition(editor.comp)} initialEntry={editor.entry} onClose={()=>setEditor(undefined)}/>}</WinterReceptionData></>}
   </dialog>
  </section>
  <section className="space-y-4 rounded-xl border-2 p-5"><h2 ref={section} tabIndex={-1} className="text-2xl font-bold">全競技の確認一覧</h2>
   <p>{summaries.length}件 ／ 出番順の変更 {Object.keys(work?.orders??{}).length}競技 ／ 料金合計 {summaries.reduce((n,s)=>n+s.total,0).toLocaleString('ja-JP')}円</p>
   {groups.map(org=><details open key={org.id} className="rounded-lg border p-3"><summary className="font-bold">{org.name}（{summaries.filter(s=>s.organizationId===org.id).length}件）</summary>{summaries.filter(s=>s.organizationId===org.id).map(s=><article key={s.id} className="border-t py-2"><p>{s.type}　{s.label}</p><p>{s.category} ／ {s.total.toLocaleString('ja-JP')}円{s.visitorName&&' ／ 担当：'+s.visitorName}</p><button className={button} disabled={locked} onClick={()=>remove(s.id)}>保留一覧から外す</button></article>)}</details>)}
   {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}
   {current.attempted&&<p>確定結果の確認待ちです。同じ登録番号で再確認してください。</p>}
   {available===true&&<div className="flex flex-wrap gap-2"><button className={button} disabled={locked||!hasWork||work?.saved} onClick={()=>void operate('save')}>{work?.saved?'本部に下書き保存済み':'全競技をまとめて下書き保存'}</button><button className={button} disabled={locked} onClick={()=>void operate('load')}>本部の保存済み下書きを開く</button></div>}
   {((work?.saved||available===false&&!work?.revision&&!Object.keys(work?.orders??{}).length)&&hasWork||current.attempted)&&<div className="space-y-2"><label className="block font-bold"><input type="checkbox" disabled={locked} checked={confirmed} onChange={e=>setConfirmed(e.target.checked)}/> 全競技の人馬・出番・料金を最終確認した</label><button className={button+' bg-blue-800 text-white'} disabled={busy||!current.attempted&&!confirmed} onClick={()=>void operate('apply')}>{current.attempted?'同じ登録番号で確定を再確認':'正式出番表・精算へまとめて反映'}</button></div>}
   <div className="flex flex-wrap gap-2"><button className={button} disabled={locked} onClick={exportDraft}>保留内容をファイルに保存</button><label className={button}>保留ファイルを取り込む<input type="file" accept=".json" disabled={locked} className="max-w-52" onChange={e=>{const file=e.target.files?.[0];if(file)void importDraft(file);e.target.value=''}}/></label><button className={button} disabled={locked||!hasWork&&!work} onClick={()=>void operate('archive')}>最新の正式出番表からやり直す</button></div>
  </section>
 </>
}
