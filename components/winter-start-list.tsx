"use client"
import {timetablePhase} from '@/lib/master/timetable'
import {loadWinterRosterIdentities,type WinterRosterIdentity} from '@/lib/winter-entry-intervals'
import {compareWinterOrganizations,winterCompetitionLabel} from "@/lib/winter-display-order"
import {useEffect,useMemo,useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {winterMonitorViewId,WINTER_MONITOR_CHANNEL,publishWinterMonitor,validateWinterMonitor,moveWinterEntry,saveWinterOrder,winterOrderSnapshot,type WinterMonitorState,type WinterMonitorCompetition} from '@/lib/winter-monitor'
import {MasterStartSelectors,MasterStartLegend,MasterOrderStatus,MasterFloatingOrderSave} from './master/start-list-controls'
import {masterStartViewClass} from '@/lib/master/start-list'
import {MasterStartRows} from './master/start-list-rows'
import {MasterStartDaySection,jumpToStartCompetition} from './master/start-list-day'
import {winterStartListModel} from '@/lib/winter-start-list-model'
import {WINTER_DATES, WINTER_EVENT_NAME, winterTimetableSection} from '@/lib/winter-event'
import {loadWinterReadingList} from '@/lib/winter-reading-list'
import type {ReadingList} from '@/lib/master/reading-list'
import {MasterReadingList} from './master/reading-list'
import {usePrintDocument} from './master/use-print-document'
import {exportWinterCsv} from '@/lib/winter-export'
import {useWinterPreviewScroll} from './use-winter-preview-scroll'
import {MonitorStatus} from './master/monitor-status'
import {WinterTimetableEditor} from './winter-timetable-editor'
import {MasterCompetitionTime} from './master/timetable'
import {loadWinterRequests,winterRpc,type WinterRequestRow} from '@/lib/winter-reception'
import {isConfirmedWithdrawal,winterOfficialStarts} from '@/lib/winter-confirmed-withdrawals'
import {loadWinterData} from '@/lib/winter-data'
type Data=Awaited<ReturnType<typeof loadWinterData>>
const button='min-h-12 rounded-lg bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50'
export function WinterStartList({data,session,onSession,onChanged,meetingDay,active=true}:{active?:boolean;meetingDay?:{date:string}|null;data:Data;session:AdminSession;onSession:(v:AdminSession)=>void;onChanged:()=>void}){
 const[compId,setCompId]=useState(''),[page,setPage]=useState(0),[error,setError]=useState(''),[saved,setSaved]=useState<{id:string;at:string}|null>(null),[busy,setBusy]=useState(false),[requests,setRequests]=useState<WinterRequestRow[]>([])
 const lock=useRef(false)
 const[remoteStatus,setRemoteStatus]=useState(''),[resend,setResend]=useState(0),remotePending=useRef<WinterMonitorState|null>(null),remoteRunning=useRef(false),alive=useRef(true),latestSession=useRef(session)
 latestSession.current=session
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;remotePending.current=null}},[])
 async function sendRemote(){
  if(remoteRunning.current)return
  remoteRunning.current=true
  try{while(alive.current&&remotePending.current){const value=remotePending.current;remotePending.current=null;setRemoteStatus('別端末のモニターへ送信中…');const verified=await verifyAdminSession(latestSession.current);if(!alive.current)return;sessionCallback.current(verified);validateWinterMonitor(value);await winterRpc('publish_winter_monitor',{p_state:value},verified.accessToken);if(alive.current)setRemoteStatus('別端末のモニターへ送信済み')}}catch(reason){if(alive.current)setRemoteStatus(`送信できません：${reason instanceof Error?reason.message:'通信を確認してください'}。「モニターに再送」で最新表示を送ってください。`)}finally{remoteRunning.current=false}
 }
 const[date,setDate]=useState<string>(WINTER_DATES[0]),[wideView,setWideView]=useState(false),[printScope,setPrintScope]=useState<'day'|'readings'>('day'),[drafts,setDrafts]=useState<Record<string,{ids:string[];baseline:string}>>({})
 const[readingOpen,setReadingOpen]=useState(false),[readingBusy,setReadingBusy]=useState(false),[readingError,setReadingError]=useState(''),[readingResult,setReadingResult]=useState<{source:Data;list:ReadingList}|null>(null)
 const readingList=readingResult?.source===data?readingResult.list:null
 async function prepareReadings(){
  if(readingBusy)return
  setReadingOpen(true);setReadingBusy(true);setReadingError('');setReadingResult(null)
  try{const verified=await verifyAdminSession(session);if(!alive.current)return;onSession(verified);const list=await loadWinterReadingList(data,verified.accessToken);if(alive.current)setReadingResult({source:data,list})}
  catch(reason){if(alive.current)setReadingError(reason instanceof Error?reason.message:'フリガナ一覧を取得できません')}
  finally{if(alive.current)setReadingBusy(false)}
 }
 const[identities,setIdentities]=useState<WinterRosterIdentity[]>([]),[identityStatus,setIdentityStatus]=useState('共通名簿の照合中…'),sessionCallback=useRef(onSession)
 sessionCallback.current=onSession
 useEffect(()=>{const controller=new AbortController();setIdentities([]);setIdentityStatus('共通名簿の照合中…');loadWinterRosterIdentities(session,controller.signal).then(value=>{if(!controller.signal.aborted){setIdentities(value.identities);setIdentityStatus('');sessionCallback.current(value.session)}}).catch(()=>{if(!controller.signal.aborted)setIdentityStatus('共通名簿を照合できません。所属違いの同一人馬は未確認です。')});return()=>controller.abort()},[session.accessToken,data])
 const [dailyMonitor,setDailyMonitor]=useState(false)
 function selectDay(value:string){
  setDailyMonitor(true);setDate(value);setCompId('');setPage(0);setError('')
 }
 useEffect(()=>{if(meetingDay)selectDay(meetingDay.date)},[meetingDay])
 const competition=data.competitions.find(c=>c.id===compId)
 const comps=useMemo(()=>data.competitions.filter(c=>c.competition_date===date),[data.competitions,date])
 const day=useMemo(()=>new Map(comps.map(c=>{
   const entries=data.entries.filter(e=>e.competition_id===c.id&&!['wd','withdrawn'].includes(e.status.toLowerCase())).sort((a,b)=>a.start_order-b.start_order)
   return [c.id,{entries,order:entries.map(e=>e.entry_id),baseline:JSON.stringify(winterOrderSnapshot(entries)),model:winterStartListModel(data,c.id,requests,true)}]
 })),[data,comps,requests])
 const dirty=!!drafts[compId]
 useEffect(()=>{let active=true;loadWinterRequests(session.accessToken).then(rows=>{if(active)setRequests(rows)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'変更表示を取得できません')});return()=>{active=false}},[session.accessToken,data])
 function selectCompetition(id:string){
   if(busy||!day.has(id))return
   setDailyMonitor(false);setCompId(id);setPage(0);setError('')
   requestAnimationFrame(()=>jumpToStartCompetition(id))
 }
 const riderKeys=useMemo(()=>new Map(identities.filter(x=>x.rider_id).map(x=>[x.rider_id!,x.entity_id])),[identities])
 const horseKeys=useMemo(()=>new Map(identities.filter(x=>x.horse_id).map(x=>[x.horse_id!,x.entity_id])),[identities])
 const dateLabel=(value:string)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(value+'T00:00:00+09:00'))
 function discard(id:string){setDrafts(previous=>{const next={...previous};delete next[id];return next});setError('')}
 function hasDrafts(){return Object.keys(drafts).length>0}
 function printReadings(){if(!readingList)return;setPrintScope('readings');setTimeout(()=>window.print(),0)}
 function exportCsv(){if(hasDrafts()){setError('未保存の出番順があります。保存または取消後に出力してください');return}const url=URL.createObjectURL(new Blob([exportWinterCsv(data,'entries')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Winter_startlist.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
 const [excelBusy,setExcelBusy]=useState(false)
 const dayPrinter=usePrintDocument()
 async function dayWorkbook(competitionId?:string){
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000)
  try{
   const verified=await verifyAdminSession(session);onSession(verified)
   const {WINTER_LAYOUT_URL,exportWinterWorkbook,winterWorkbookName}=await import('@/lib/winter-official-workbook')
   const [current,layout]=await Promise.all([loadWinterData(controller.signal,verified.accessToken),fetch(WINTER_LAYOUT_URL,{signal:controller.signal})])
   if(!layout.ok)throw new Error('出番表・成績表の様式を取得できません')
   return {bytes:exportWinterWorkbook(new Uint8Array(await layout.arrayBuffer()),current,date,competitionId),name:winterWorkbookName(date)}
  }finally{clearTimeout(timeout)}
 }
 async function exportExcel(){
  if(hasDrafts()){setError('未保存の出番順があります。保存または取消後に出力してください');return}
  if(excelBusy)return
  setExcelBusy(true);setError('')
  try{
   const {bytes,name}=await dayWorkbook()
   const url=URL.createObjectURL(new Blob([new Uint8Array(bytes)],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}))
   const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove()
   setTimeout(()=>URL.revokeObjectURL(url),10000)
  }catch(reason){setError(reason instanceof Error?reason.message:'Excelを出力できません')}
  finally{setExcelBusy(false)}
 }
 function printStarts(competitionId?:string){
  if(hasDrafts()){setError('未保存の出番順があります。保存または取消後に印刷してください');return}
  setError('')
  void dayPrinter.print(async()=>{
   const [{bytes,name},{linkedStartPrintHtml}]=await Promise.all([dayWorkbook(competitionId),import('@/lib/master/linked-start-print')])
   return linkedStartPrintHtml(bytes,name.replace(/\.xlsx$/,''))
  },'縦')
 }
 function monitorCompetition(c:Data['competitions'][number]): WinterMonitorCompetition {
  const current = day.get(c.id)!
  const draft = active && drafts[c.id]?.baseline===current.baseline ? drafts[c.id] : undefined
  const order = draft?.ids ?? current.order
  const official = winterOfficialStarts(data.entries,c.id)
  const lookup = new Map(official.map(entry => [entry.entry_id,entry]))
  const model = current.model
  const marks = new Map(model.entriesByCompetition(c.id).map(entry => [entry.id,entry.adminChangeMark]))
  const time = data.timetable.find(row => row.competition_id === c.id)
  const rows = [...order,...official.filter(isConfirmedWithdrawal).map(e=>e.entry_id)].map((id,index) => {
   const e = lookup.get(id), mark = marks.get(id)
   return {id,number:index+1,rider:e && model.getPlayer(e.rider_id)?.name || '要確認',horse:e && model.getHorse(e.horse_id)?.name || '要確認',
    organization:e?.organization_name ?? '要確認',isOp:!!e?.is_op,mark:e&&isConfirmedWithdrawal(e)?'棄権':mark==='added'?'追加':mark==='changed'?'変更':''}
  })
  return {competitionId:c.id,competitionNo:c.competition_no,competitionName:c.name,date:c.competition_date,rows,
   inspectionTime:time?.inspection_time,startTime:time?.start_time,timePhase:timetablePhase(time),draft:!!draft,...(draft?{officialOrder:official.map(e=>e.entry_id)}:{}),
   page:dailyMonitor?0:Math.min(page,Math.max(0,Math.ceil(rows.length/30)-1))}
 }
 const visible = dailyMonitor ? comps : competition ? [competition] : []
 const groups = visible.map(monitorCompetition)
 const monitor:WinterMonitorState|null = groups.length ? {...groups[0],version:1,eventId:data.eventId,updatedAt:new Date().toISOString(),
  ...(dailyMonitor ? {followingCompetitions:groups.slice(1)} : {})} : null
 const draftKey=JSON.stringify(groups.filter(g=>g.draft).map(g=>[g.competitionId,g.rows.map(row=>row.id)]))
 const draftId=useMemo(()=>draftKey==='[]'?undefined:crypto.randomUUID(),[draftKey])
 if(monitor&&draftId)monitor.draftId=draftId
 const scrolling=useWinterPreviewScroll(active,monitor?winterMonitorViewId(monitor):'',draftId)
 if(monitor&&scrolling.key)monitor.scrollController=scrolling.key
 // Publishing only on display changes avoids sending data on an idle timer.
 const displayKey=monitor?JSON.stringify({...monitor,updatedAt:''}):''
 useEffect(()=>{if(!monitor)return;try{publishWinterMonitor(monitor)}catch(reason){setError(reason instanceof Error?reason.message:'モニター送信に失敗しました')}},[displayKey])
 useEffect(()=>{if(!monitor)return;const timer=setTimeout(()=>{remotePending.current=monitor;void sendRemote()},300);return()=>clearTimeout(timer)},[displayKey,resend])
 async function save(id:string){
   const draft=drafts[id],current=day.get(id)
   if(lock.current||!draft||!current||draft.baseline!==current.baseline)return
   lock.current=true;setBusy(true);setError('')
   try{
     const verified=await verifyAdminSession(session);onSession(verified)
     const at=await saveWinterOrder(id,draft.ids,current.entries,verified.accessToken)
     discard(id);setSaved({id,at});onChanged()
   }catch(reason){setError(reason instanceof Error?reason.message:'保存できません')}
   finally{lock.current=false;setBusy(false)}
 }
 function move(id:string,from:string,to:string){
   const current=day.get(id),draft=drafts[id]
   if(busy||!current||(draft&&draft.baseline!==current.baseline)||!current.order.includes(from)||!current.order.includes(to))return
   const order=moveWinterEntry(draft?.ids??current.order,from,to)
   if(compId!==id){setCompId(id);setPage(0)}
   setSaved(null);setError('')
   setDrafts(previous=>{
     const next={...previous}
     if(order.every((entry,index)=>entry===current.order[index]))delete next[id]
     else next[id]={ids:order,baseline:current.baseline}
     return next
   })
 }
 return <div className={`${masterStartViewClass(wideView)}${printScope==='readings'?' reading-list-print-root':''}`}>
 {error&&<p role="alert" className="print-hide text-destructive">{error}</p>}
 {scrolling.error&&<p role="status">{scrolling.error}</p>}
 {dayPrinter.error&&<p className="print-hide text-destructive" role="alert">{dayPrinter.error}</p>}
 <div className="print-hide flex flex-wrap justify-end gap-2"><button type="button" className={button} disabled={readingBusy} onClick={()=>void prepareReadings()}>{readingBusy?'フリガナを読み込み中…':'人馬のフリガナ一覧'}</button><button type="button" className={button} disabled={busy||excelBusy} onClick={()=>void exportExcel()}>{excelBusy?'Excelを作成中…':'この日の出番表・成績表をExcelに保存'}</button><button className={button} onClick={exportCsv}>出番表を出力（CSV）</button><a className={button} href="/winter/monitor" target="fhs-winter-startlist-monitor" onClick={event=>{
  if(!competition)setDailyMonitor(true)
  if(!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey&&window.open(event.currentTarget.href,event.currentTarget.target,'popup'))event.preventDefault()
 }}>モニター表示</a><button className="min-h-12 rounded-lg border-2 border-primary px-4 font-bold text-primary" disabled={busy||excelBusy||dayPrinter.busy} onClick={()=>printStarts()}>この日の出番表を印刷</button>{competition&&<button className="min-h-12 rounded-lg border-2 border-primary px-4 font-bold text-primary disabled:opacity-50" disabled={dirty||busy||excelBusy||dayPrinter.busy} onClick={()=>printStarts(competition.id)}>この競技だけを印刷</button>}</div>
 {active&&<MonitorStatus token={WINTER_MONITOR_CHANNEL} displayPath="/winter/monitor" onPreviewScroll={monitor&&scrolling.key?scrolling.scroll:undefined}/>}
 {readingOpen&&<section className="print-hide rounded-xl border-2 border-primary bg-card p-4" aria-label="人馬のフリガナ一覧">
  <div className="mb-3 flex flex-wrap gap-2"><button type="button" className={button} disabled={readingBusy||!readingList} onClick={printReadings}>フリガナ一覧を印刷（A4）</button><button type="button" className="min-h-12 rounded-lg border-2 px-4 font-bold" onClick={()=>setReadingOpen(false)}>一覧を閉じる</button></div>
  {readingBusy?<p role="status">登録済みのフリガナを読み込んでいます…</p>:readingError?<div role="alert"><p className="font-bold text-destructive">{readingError}</p><button type="button" className={button} onClick={()=>void prepareReadings()}>再読み込み</button></div>:readingList?<MasterReadingList compareClubs={compareWinterOrganizations} list={readingList} eventName={WINTER_EVENT_NAME}/>:<p>出番表が更新されました。上の「人馬のフリガナ一覧」を押して再読み込みしてください。</p>}
 </section>}
 <div className="print-hide contents"><button onClick={()=>setWideView(v=>!v)} className={wideView?'sticky top-0 z-20 self-end rounded-lg border-2 border-primary bg-card px-3 py-1 text-sm font-bold text-primary shadow':'self-end rounded-lg border-2 border-primary bg-card px-3 py-1 text-sm font-bold text-primary'}>{wideView?'通常画面へ戻る':'出番表を一画面で見る'}</button>
 <p className={wideView?'sr-only':'text-sm text-muted-foreground'}>人馬の行を少し長押しすると持ち上がります。そのまま上下に動かし、入れたい位置で指を離してください。右の移動マークならすぐに動かせます。最後に「出番順を保存」を押してください。</p>
 <MasterStartSelectors dates={WINTER_DATES.map(value=>({value,label:dateLabel(value)}))} date={date} competitions={comps.map(c=>({id:c.id,number:c.competition_no,name:c.name,official:c.official}))} selectedId={compId} wide={wideView} busy={busy} jump onDate={selectDay} onCompetition={selectCompetition}/>
 <div className="flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
  <span>{dailyMonitor ? `モニター表示：${dateLabel(date)}の全競技` : competition ? `モニター表示：${winterCompetitionLabel(competition)}` : '日付を押すと、その日の全競技をモニターに表示します。'}</span>
  {monitor&&<><span>{remoteStatus}</span><button type="button" className="rounded border px-3 py-1" onClick={()=>setResend(v=>v+1)}>モニターに再送</button></>}
  {!dailyMonitor&&competition&&monitor&&monitor.rows.length>30&&<><button className={button} disabled={page===0} onClick={()=>setPage(v=>v-1)}>前のページ</button><button className={button} disabled={(page+1)*30>=monitor.rows.length} onClick={()=>setPage(v=>v+1)}>次のページ</button></>}
 </div>
 <MasterStartLegend/>
 {identityStatus&&<p role="status" className="mb-2 text-sm">{identityStatus}</p>}
 {comps.map(c=>{
   const current=day.get(c.id)!,draft=drafts[c.id],active=c.id===compId
   const stale=!!draft&&draft.baseline!==current.baseline
   const timetable=data.timetable.find(t=>t.competition_id===c.id)
   const section=winterTimetableSection(c.competition_no),showInspection=section?.showInspection
   return <MasterStartDaySection key={c.id} id={c.id} title={winterCompetitionLabel(c)} official={c.official} wide={wideView}>
     {section?.startListVenue&&<p className="mb-1 text-sm">会場：{section.startListVenue}</p>}
     <MasterCompetitionTime inspection={timetable?.inspection_time} start={timetable?.start_time} phase={timetablePhase(timetable)} showInspection={showInspection}/>
     {(active||draft)&&<MasterOrderStatus wide={wideView} dirty={!!draft} stale={stale} saving={busy} error="" savedLabel={saved?.id===c.id?new Date(saved.at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):undefined} onDiscard={()=>discard(c.id)} onSave={()=>void save(c.id)}/>}
     <MasterStartRows model={current.model} competitionId={c.id} readOnly showAdminChanges adminReorder={!busy&&!stale} reorderSaving={busy||stale} compact dense orderedIds={draft?.ids} onReorder={(from,to)=>move(c.id,from,to)} riderKeys={riderKeys} horseKeys={horseKeys}/>
     {active&&draft&&<MasterFloatingOrderSave saving={busy} stale={stale} onSave={()=>void save(c.id)}/>}
     {active&&competition&&<> <details className="print-hide mt-3 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-bold">競技の時間設定</summary><WinterTimetableEditor key={competition.id} competitionId={competition.id} count={current.entries.length} showInspection={showInspection} initial={timetable??null} session={session} onSession={onSession} onChanged={onChanged}/>

 </details></>}
   </MasterStartDaySection>
 })}
 {!comps.length&&<p>この日の競技はありません。</p>}
 </div>
 <div className="print-only hidden">{printScope==='readings'?(readingList?<MasterReadingList compareClubs={compareWinterOrganizations} list={readingList} eventName={WINTER_EVENT_NAME}/>:null):<><h1 className="mb-2 text-xl font-bold">Fuji Horse Show Winter 出番表</h1><p className="mb-4 font-bold">{dateLabel(date)}</p>{comps.map(c=>{
 const section=winterTimetableSection(c.competition_no)
 return <section key={c.id} className="print-competition mb-5"><h2 className="mb-2 border-b border-black pb-1 text-base font-bold">{winterCompetitionLabel(c)}{c.official?'（公認）':''}</h2>{section?.startListVenue&&<p>会場：{section.startListVenue}</p>}<MasterCompetitionTime inspection={data.timetable.find(t=>t.competition_id===c.id)?.inspection_time} start={data.timetable.find(t=>t.competition_id===c.id)?.start_time} phase={timetablePhase(data.timetable.find(t=>t.competition_id===c.id))} showInspection={section?.showInspection}/><table className="w-full border-collapse text-sm"><thead><tr>{['出番','選手','馬','所属','備考'].map(h=><th key={h} className="border p-1 text-left">{h}</th>)}</tr></thead><tbody>{winterOfficialStarts(data.entries,c.id).map(e=><tr key={e.entry_id}><td className="border p-1">{e.start_order}</td><td className="border p-1">{data.riders.find(r=>r.id===e.rider_id)?.name}</td><td className="border p-1">{day.get(c.id)?.model.getHorse(e.horse_id)?.name}</td><td className="border p-1">{e.organization_name}</td><td className="border p-1">{e.is_op?'OP ':''}{['wd','withdrawn'].includes(e.status.toLowerCase())?'棄権':''}</td></tr>)}</tbody></table></section>
 })}</>}</div>
 </div>
}
