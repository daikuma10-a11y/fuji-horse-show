"use client"
import {loadWinterRosterIdentities,type WinterRosterIdentity} from '@/lib/winter-entry-intervals'
import {winterCompetitionLabel} from "@/lib/winter-display-order"
import {useEffect,useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {publishWinterMonitor,validateWinterMonitor,moveWinterEntry,saveWinterOrder,winterOrderAfterRefresh,type WinterMonitorState} from '@/lib/winter-monitor'
import {MasterStartSelectors,MasterStartLegend,MasterOrderStatus,MasterFloatingOrderSave} from './master/start-list-controls'
import {masterStartViewClass} from '@/lib/master/start-list'
import {MasterStartRows} from './master/start-list-rows'
import {OfficialBadge} from './official-badge'
import {winterStartListModel} from '@/lib/winter-start-list-model'
import {WINTER_DATES} from '@/lib/winter-event'
import {exportWinterCsv} from '@/lib/winter-export'
import {WinterMonitorView} from './winter-monitor-view'
import {WinterTimetableEditor} from './winter-timetable-editor'
import {loadWinterRequests,winterRpc,type WinterRequestRow} from '@/lib/winter-reception'
import type {loadWinterData} from '@/lib/winter-data'
type Data=Awaited<ReturnType<typeof loadWinterData>>
const button='min-h-12 rounded-lg bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50'
export function WinterStartList({data,session,onSession,onChanged}:{data:Data;session:AdminSession;onSession:(v:AdminSession)=>void;onChanged:()=>void}){
 const[compId,setCompId]=useState(''),[ids,setIds]=useState<string[]>([]),[page,setPage]=useState(0),[error,setError]=useState(''),[saved,setSaved]=useState(''),[busy,setBusy]=useState(false),[requests,setRequests]=useState<WinterRequestRow[]>([])
 const[position,setPosition]=useState<{x:number;y:number}|null>(null),drag=useRef<{x:number;y:number;left:number;top:number}|null>(null),lock=useRef(false)
 const[remoteStatus,setRemoteStatus]=useState(''),[resend,setResend]=useState(0),remotePending=useRef<WinterMonitorState|null>(null),remoteRunning=useRef(false),alive=useRef(true),latestSession=useRef(session)
 latestSession.current=session
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;remotePending.current=null}},[])
 async function sendRemote(){
  if(remoteRunning.current)return
  remoteRunning.current=true
  try{while(alive.current&&remotePending.current){const value=remotePending.current;remotePending.current=null;setRemoteStatus('別端末のモニターへ送信中…');const verified=await verifyAdminSession(latestSession.current);if(!alive.current)return;sessionCallback.current(verified);validateWinterMonitor(value);await winterRpc('publish_winter_monitor',{p_state:value},verified.accessToken);if(alive.current)setRemoteStatus('別端末のモニターへ送信済み')}}catch(reason){if(alive.current)setRemoteStatus(`送信できません：${reason instanceof Error?reason.message:'通信を確認してください'}。「モニターに再送」で最新表示を送ってください。`)}finally{remoteRunning.current=false}
 }
 const[date,setDate]=useState<string>(WINTER_DATES[0]),[wideView,setWideView]=useState(false),[printScope,setPrintScope]=useState<'day'|'competition'>('day'),[drafts,setDrafts]=useState<Record<string,{ids:string[];baseline:string}>>({})
 const[identities,setIdentities]=useState<WinterRosterIdentity[]>([]),[identityStatus,setIdentityStatus]=useState('共通名簿の照合中…'),sessionCallback=useRef(onSession)
 sessionCallback.current=onSession
 useEffect(()=>{const controller=new AbortController();setIdentities([]);setIdentityStatus('共通名簿の照合中…');loadWinterRosterIdentities(session,controller.signal).then(value=>{if(!controller.signal.aborted){setIdentities(value.identities);setIdentityStatus('');sessionCallback.current(value.session)}}).catch(()=>{if(!controller.signal.aborted)setIdentityStatus('共通名簿を照合できません。所属違いの同一人馬は未確認です。')});return()=>controller.abort()},[session.accessToken,data])
 const competition=data.competitions.find(c=>c.id===compId)
 const original=data.entries.filter(e=>e.competition_id===compId&&!['wd','withdrawn'].includes(e.status.toLowerCase())).sort((a,b)=>a.start_order-b.start_order)
 const originalIds=original.map(e=>e.entry_id),originalKey=JSON.stringify(originalIds)
 const [baseline,setBaseline]=useState(originalKey)
 const observedOrder=useRef(originalKey)
 useEffect(()=>{if(observedOrder.current===originalKey)return;observedOrder.current=originalKey;const next=winterOrderAfterRefresh(ids,baseline,originalIds);if(next){setIds(next);setBaseline(originalKey);setPage(v=>Math.min(v,Math.max(0,Math.ceil(next.length/30)-1)))}},[originalKey])
 const stale=baseline!==originalKey
 const dirty=JSON.stringify(ids)!==originalKey
 useEffect(()=>{let active=true;loadWinterRequests(session.accessToken).then(rows=>{if(active)setRequests(rows)}).catch(reason=>{if(active)setError(reason instanceof Error?reason.message:'変更表示を取得できません')});return()=>{active=false}},[session.accessToken,data])
 function choose(id:string){
  if(busy)return
  const retained={...drafts};if(compId){if(dirty)retained[compId]={ids:[...ids],baseline};else delete retained[compId]}setDrafts(retained)
  setCompId(id);const rows=data.entries.filter(e=>e.competition_id===id&&!['wd','withdrawn'].includes(e.status.toLowerCase())).sort((a,b)=>a.start_order-b.start_order).map(e=>e.entry_id),draft=retained[id]
  setIds(draft?.ids??rows);setBaseline(draft?.baseline??JSON.stringify(rows));setPage(0);setSaved('');setError('')
 }
 const model=winterStartListModel(data,compId,requests),riderKeys=new Map(identities.filter(x=>x.rider_id).map(x=>[x.rider_id!,x.entity_id])),horseKeys=new Map(identities.filter(x=>x.horse_id).map(x=>[x.horse_id!,x.entity_id]))
 const comps=data.competitions.filter(c=>c.competition_date===date)
 const dateLabel=(value:string)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(value+'T00:00:00+09:00'))
 function cancel(){setIds(originalIds);setBaseline(originalKey);setSaved('');setDrafts(v=>{const next={...v};delete next[compId];return next});setError('')}
 function hasDrafts(){return dirty||Object.entries(drafts).some(([id,draft])=>id!==compId&&JSON.stringify(draft.ids)!==JSON.stringify(data.entries.filter(e=>e.competition_id===id&&!['wd','withdrawn'].includes(e.status.toLowerCase())).sort((a,b)=>a.start_order-b.start_order).map(e=>e.entry_id)))}
 function print(scope:'day'|'competition'){if(hasDrafts()){setError('未保存の出番順があります。保存または取消後に印刷してください');return}setPrintScope(scope);setTimeout(()=>window.print(),0)}
 function exportCsv(){if(hasDrafts()){setError('未保存の出番順があります。保存または取消後に出力してください');return}const url=URL.createObjectURL(new Blob([exportWinterCsv(data,'entries')],{type:'text/csv;charset=utf-8'})),a=document.createElement('a');a.href=url;a.download='Winter_startlist.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)}
 const timetable=data.timetable.find(row=>row.competition_id===compId)
 const monitor:WinterMonitorState|null=competition?{version:1,eventId:data.eventId,competitionId:competition.id,competitionNo:competition.competition_no,competitionName:competition.name,date:competition.competition_date,inspectionTime:timetable?.inspection_time,startTime:timetable?.start_time,timePhase:timetable?.phase,page,draft:dirty,updatedAt:new Date().toISOString(),rows:ids.map((id,index)=>{const e=data.entries.find(row=>row.entry_id===id);const mark=model.entriesByCompetition(compId).find(e=>e.id===id)?.adminChangeMark;return{id,number:index+1,rider:data.riders.find(r=>r.id===e?.rider_id)?.name??'要確認',horse:data.horses.find(h=>h.id===e?.horse_id)?.name??'要確認',organization:e?.organization_name??'要確認',isOp:!!e?.is_op,mark:mark==='added'?'追加':mark==='changed'?'変更':''}})}:null
 // Publishing only on display changes avoids sending data on an idle timer.
 const displayKey=monitor?JSON.stringify({...monitor,updatedAt:''}):''
 useEffect(()=>{if(!monitor)return;try{publishWinterMonitor(monitor)}catch(reason){setError(reason instanceof Error?reason.message:'モニター送信に失敗しました')}},[displayKey])
 useEffect(()=>{if(!monitor)return;const timer=setTimeout(()=>{remotePending.current=monitor;void sendRemote()},300);return()=>clearTimeout(timer)},[displayKey,resend])
 async function save(){if(lock.current||!competition||!ids.length||stale)return;lock.current=true;setBusy(true);setError('');try{const verified=await verifyAdminSession(session);onSession(verified);setSaved(await saveWinterOrder(competition.id,ids,original,verified.accessToken));setBaseline(JSON.stringify(ids));setDrafts(v=>{const next={...v};delete next[compId];return next});onChanged()}catch(reason){setError(reason instanceof Error?reason.message:'保存できません')}finally{lock.current=false;setBusy(false)}}
 function move(from:string,to:string){if(busy||stale)return;setIds(value=>moveWinterEntry(value,from,to));setSaved('')}
 return <div className={masterStartViewClass(wideView)}>
 <div className="print-hide flex flex-wrap justify-end gap-2"><button className={button} onClick={exportCsv}>出番表を出力（CSV）</button><a className={button} href="/winter/monitor" target="_blank" rel="noopener">モニター表示</a><button className="min-h-12 rounded-lg border-2 border-primary px-4 font-bold text-primary" onClick={()=>print('day')}>この日の出番表を印刷</button>{competition&&<button className="min-h-12 rounded-lg border-2 border-primary px-4 font-bold text-primary disabled:opacity-50" disabled={dirty} onClick={()=>print('competition')}>この競技を印刷</button>}</div>
 <div className="print-hide contents"><button onClick={()=>setWideView(v=>!v)} className={wideView?'sticky top-0 z-20 self-end rounded-lg border-2 border-primary bg-card px-3 py-1 text-sm font-bold text-primary shadow':'self-end rounded-lg border-2 border-primary bg-card px-3 py-1 text-sm font-bold text-primary'}>{wideView?'通常画面へ戻る':'出番表を一画面で見る'}</button>
 <p className={wideView?'sr-only':'text-sm text-muted-foreground'}>人馬の行を少し長押しすると持ち上がります。そのまま上下に動かし、入れたい位置で指を離してください。右の移動マークならすぐに動かせます。最後に「出番順を保存」を押してください。</p>
 <MasterStartSelectors dates={WINTER_DATES.map(value=>({value,label:dateLabel(value)}))} date={date} competitions={comps.map(c=>({id:c.id,number:c.competition_no,name:c.name,official:c.official}))} selectedId={compId} wide={wideView} busy={busy} onDate={value=>{choose('');setDate(value)}} onCompetition={choose}/>

 {competition?<div>
 <h3 className={wideView?'mb-1 flex flex-wrap items-center gap-2 text-sm font-bold text-foreground':'mb-2 flex flex-wrap items-center gap-2 text-lg font-bold text-foreground'}>{winterCompetitionLabel(competition)}{competition.official&&<OfficialBadge/>}</h3>
 <MasterOrderStatus wide={wideView} dirty={dirty} stale={stale} saving={busy} error={error} savedLabel={saved?new Date(saved).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}):undefined} onDiscard={cancel} onSave={()=>void save()}/>
 <MasterStartLegend/>

 <MasterStartRows model={model} competitionId={compId} readOnly showAdminChanges adminReorder={!busy&&!stale} reorderSaving={busy||stale} compact dense orderedIds={ids} onReorder={move} riderKeys={riderKeys} horseKeys={horseKeys}/>
 {dirty&&<MasterFloatingOrderSave saving={busy} stale={stale} onSave={()=>void save()}/>}
 <details className="print-hide mt-3 rounded-lg border p-3"><summary className="cursor-pointer text-sm font-bold">モニター小窓・時間設定</summary><p role="status" className="my-2 text-sm">{remoteStatus}</p><p className="text-sm">{identityStatus}</p><button className={button} onClick={()=>setResend(v=>v+1)}>モニターに再送</button><WinterTimetableEditor key={competition.id} competitionId={competition.id} initial={timetable??null} session={session} onSession={onSession} onChanged={onChanged}/>
 {monitor&&<div className={position?'fixed z-40 w-[400px] max-w-[90vw] overflow-hidden rounded-xl border-2 border-blue-800 bg-white shadow-xl':'overflow-hidden rounded-xl border-2 border-blue-800'} style={position?{left:position.x,top:position.y}:undefined}><div className="flex touch-none items-center justify-between bg-blue-800 p-2 text-white" onPointerDown={e=>{if(!position||e.target!==e.currentTarget)return;drag.current={x:e.clientX,y:e.clientY,left:position.x,top:position.y};e.currentTarget.setPointerCapture(e.pointerId)}} onPointerMove={e=>{if(drag.current){const d=drag.current;setPosition({x:Math.max(0,Math.min(window.innerWidth-100,d.left+e.clientX-d.x)),y:Math.max(0,Math.min(window.innerHeight-60,d.top+e.clientY-d.y))})}}} onPointerUp={()=>{drag.current=null}} onPointerCancel={()=>{drag.current=null}}>表示プレビュー（ここを掴んで移動）<button onClick={()=>setPosition(position?null:{x:Math.max(0,window.innerWidth-430),y:100})}>{position?'元に戻す':'移動する'}</button></div><div className="max-h-[45vh] overflow-auto"><WinterMonitorView state={monitor} compact/></div><div className="flex justify-between p-2"><button className={button} disabled={page===0} onClick={()=>setPage(v=>v-1)}>前のページ</button><button className={button} disabled={(page+1)*30>=ids.length} onClick={()=>setPage(v=>v+1)}>次のページ</button></div></div>}
 </details>
 </div>:<p className="rounded-xl border-2 border-dashed border-border bg-card px-4 py-5 text-center text-base text-muted-foreground">競技を選んでください。</p>}
 </div>
 <div className="print-only hidden"><h1 className="mb-2 text-xl font-bold">Fuji Horse Show Winter 出番表</h1><p className="mb-4 font-bold">{dateLabel(date)} ／ 正式DBの出番順</p>{(printScope==='competition'&&competition?[competition]:comps).map(c=><section key={c.id} className="print-competition mb-5"><h2 className="mb-2 border-b border-black pb-1 text-base font-bold">{winterCompetitionLabel(c)}{c.official?'（公認）':''}</h2><table className="w-full border-collapse text-sm"><thead><tr>{['出番','選手','馬','所属','備考'].map(h=><th key={h} className="border p-1 text-left">{h}</th>)}</tr></thead><tbody>{data.entries.filter(e=>e.competition_id===c.id).sort((a,b)=>a.start_order-b.start_order).map(e=><tr key={e.entry_id}><td className="border p-1">{e.start_order}</td><td className="border p-1">{data.riders.find(r=>r.id===e.rider_id)?.name}</td><td className="border p-1">{data.horses.find(h=>h.id===e.horse_id)?.name}</td><td className="border p-1">{e.organization_name}</td><td className="border p-1">{e.is_op?'OP ':''}{['wd','withdrawn'].includes(e.status.toLowerCase())?'棄権':''}</td></tr>)}</tbody></table></section>)}</div>
 </div>
}
