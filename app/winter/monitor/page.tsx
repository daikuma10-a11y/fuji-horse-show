"use client"
import { useEffect,useMemo,useRef,useState } from 'react'
import {MonitorFontControl} from '@/components/master/monitor-font-control'
import {MonitorFullscreenButton} from '@/components/master/monitor-fullscreen'
import {WinterMeetingDisplay} from '@/components/winter-meeting-display'
import {useMonitorLink} from '@/components/monitor-link'
import { officialMonitorFallback,draftHeartbeatView,draftTimeoutMs,winterMonitorViewId,WINTER_MONITOR_CHANNEL,WINTER_MONITOR_KEY,validateWinterMonitor,reconcileWinterMonitor,type WinterMonitorState } from '@/lib/winter-monitor'
import {listenToScroll} from '@/lib/winter-monitor-scroll'
import {loadWinterData} from '@/lib/winter-data'
import { WinterMonitorView } from '@/components/winter-monitor-view'
import {subscribeWinterUpdates,loadRemoteWinterMonitor} from '@/lib/winter-live'
import {displayChannelName,isPresentationDisplay,listenForPresentation} from '@/lib/monitor-presentation'
export default function WinterMonitorPage(){
 const [channel,setChannel]=useState<string|null>(null)
 useEffect(()=>{const read=()=>setChannel(window.location.hash.slice(1));read();window.addEventListener('hashchange',read);return()=>window.removeEventListener('hashchange',read)},[])
 const meeting=channel!==null && /^winter-meeting-[a-f0-9-]{36}$/.test(channel)
 useEffect(()=>{
  if(channel!==null)return listenForPresentation(meeting?channel:WINTER_MONITOR_CHANNEL)
 },[channel,meeting])
 if(channel===null)return null
 return meeting?<WinterMeetingDisplay channel={channel}/>:<OfficialMonitor/>
}
function OfficialMonitor(){
 const[published,setState]=useState<WinterMonitorState|null>(null),[error,setError]=useState(''),[fullscreen,setFullscreen]=useState(false)
 const[liveStatus,setLiveStatus]=useState('')
 const [audienceFullscreen,setAudienceFullscreen]=useState(false)
 const [roster,setRoster]=useState<{data:Awaited<ReturnType<typeof loadWinterData>>;withdrawalIds?:Set<string>;scope:string}|null>(null)
 const [heartbeat,setHeartbeat]=useState<string|null>(null)
 const heartbeatReceiver=useRef<ReturnType<typeof listenToScroll>|null>(null)
 const last=useMemo(()=>{
  if(!published||!roster)return published
  if(roster.scope!==winterMonitorViewId(published))return published
  try{return reconcileWinterMonitor(published,roster.data,roster.withdrawalIds)}catch{return null}
 },[published,roster])
 const draftId=published?.draftId,controller=published?.scrollController
 const state=useMemo(()=>{
  if(!last||!last.draft&&!last.followingCompetitions?.some(group=>group.draft))return last
  return heartbeat&&heartbeat===draftId?last:officialMonitorFallback(last)
 },[last,heartbeat,draftId])
 useEffect(()=>{
  if(!draftId||!controller)return
  let timeout:ReturnType<typeof setTimeout>|undefined
  const listener=listenToScroll({controller,view:draftHeartbeatView(draftId)},packet=>{
   if(Math.abs(Date.now()-packet.y)>draftTimeoutMs)return
   setHeartbeat(draftId);clearTimeout(timeout)
   timeout=setTimeout(()=>setHeartbeat(null),draftTimeoutMs)
  })
  heartbeatReceiver.current=listener
  const link=typeof BroadcastChannel==='undefined'?null:new BroadcastChannel(displayChannelName(WINTER_MONITOR_CHANNEL))
  if(link)link.onmessage=event=>{if(event.data?.kind==='draft-heartbeat')void listener.receive(event.data.packet)}
  return ()=>{link?.close();listener.close();heartbeatReceiver.current=null;clearTimeout(timeout);setHeartbeat(null)}
 },[draftId,controller?.x,controller?.y])
 const localCommandAt=useRef(0)
 const receiver=useRef<ReturnType<typeof listenToScroll>|null>(null)
 const controlFrame=()=>window.parent!==window && new URLSearchParams(window.location.search).get('control')==='1'
 const view=state?winterMonitorViewId(state):'',key=state?.scrollController
 useEffect(()=>{
  if(!key||!view||controlFrame())return
  const listener=listenToScroll({view,controller:key},p=>{
   if(Date.now()-localCommandAt.current<4000)return
   const extent=Math.max(0,(document.scrollingElement?.scrollHeight??0)-window.innerHeight)
   const top=Math.abs(extent-p.extent)<=2?p.y:p.fraction*extent
   window.scrollTo({top,behavior:'instant'})
  });receiver.current=listener
  return ()=>{listener.close();receiver.current=null}
 },[view,key?.x,key?.y])
 useEffect(()=>{
  if(!isPresentationDisplay())return
  const link=new BroadcastChannel(displayChannelName(WINTER_MONITOR_CHANNEL))
  link.onmessage=({data})=>{
   if(data?.kind!=='monitor-published')return
   try{setState(validateWinterMonitor(data.state));setError('')}catch{/* Ignore invalid publications. */}
  }
  link.postMessage({kind:'monitor-publication-query'})
  return ()=>link.close()
 },[])
 const [fontSize,setFontSize]=useState(18)
 const changeFont=useMonitorLink({fontSize,setFontSize,
  channelName:WINTER_MONITOR_CHANNEL,
  competition:state ? (state.followingCompetitions ? state.date+' 全競技' : '第'+state.competitionNo+'競技 '+state.competitionName) : '日付・競技の選択待ち',
  ready:!!state, pending:!!state && (state.draft || !!state.followingCompetitions?.some(group=>group.draft)),
  onLocalCommand:()=>{localCommandAt.current=Date.now()},
  onPreviewScroll:position=>{if(key&&view)window.parent.postMessage({kind:'winter-preview-scroll',view,controller:key,position},window.location.origin)},
  onAudienceReport:report=>setAudienceFullscreen(report.fullscreen),
 })
 const [replica,setReplica]=useState(false)
 useEffect(()=>{setReplica(window.parent!==window && new URLSearchParams(window.location.search).get('control')==='1')},[])
 useEffect(()=>{
  let active=true,busy=false,again=false,dataNeeded=false,loadedScope=''
  const controller=new AbortController()
  async function update(includeData=false){dataNeeded ||= includeData;if(busy){again=true;return}busy=true
   try{do{again=false;const reloadData=dataNeeded;dataNeeded=false;const remote=await loadRemoteWinterMonitor(controller.signal)
    if(!active)break
    const next=remote?validateWinterMonitor(remote):null
    if(next)setState(next)
    const scope=next?winterMonitorViewId(next):''
    if(next && (reloadData||loadedScope!==scope)){
     const [fresh,response]=await Promise.all([loadWinterData(controller.signal),fetch('/api/winter-monitor',{signal:controller.signal,cache:'no-store'})])
     if(!response.ok)throw new Error()
     const {entryIds}=await response.json()
     if(!Array.isArray(entryIds))throw new Error()
     if(active){loadedScope=scope;setRoster({data:fresh,scope,withdrawalIds:new Set(entryIds)});setError('')}
    }
   }while(active&&again)}catch{if(active)setError('最新の表示を取得できません。表示中の表は通信復旧まで更新されません。')}finally{busy=false;if(active&&again)void update()}
  }
  const stop=subscribeWinterUpdates('monitor',()=>void update(),setLiveStatus,p=>{void heartbeatReceiver.current?.receive(p);if(!controlFrame())void receiver.current?.receive(p)}),stopData=subscribeWinterUpdates('data',()=>void update(true),message=>{if(message.includes('切断'))setError('出番の自動更新が切断されています。通信復旧を待っています。')})
  void update(true);return()=>{active=false;controller.abort();stop();stopData()}
 },[])
 useEffect(()=>{const update=()=>{try{const raw=window.localStorage.getItem(WINTER_MONITOR_KEY);setState(raw?validateWinterMonitor(JSON.parse(raw)):null);setError('')}catch{setError('本部のモニター情報を読み込めません')}};const onFullscreen=()=>setFullscreen(!!document.fullscreenElement);update();const onStorage=(event:StorageEvent)=>{if(event.key===WINTER_MONITOR_KEY)update()};window.addEventListener('storage',onStorage);window.addEventListener('winter-monitor-changed',update);document.addEventListener('fullscreenchange',onFullscreen);return()=>{window.removeEventListener('storage',onStorage);window.removeEventListener('winter-monitor-changed',update);document.removeEventListener('fullscreenchange',onFullscreen)}},[])
 return <main className="min-h-dvh bg-white text-slate-950"><MonitorFullscreenButton channel={WINTER_MONITOR_CHANNEL} preview={replica} fullscreen={replica?audienceFullscreen:fullscreen}/><MonitorFontControl value={fontSize} onChange={changeFont}/><p role="status" className="px-3 text-sm">{liveStatus}</p>{error&&<p role="alert">{error}</p>}{state?<WinterMonitorView state={state} nameSize={fontSize}/>:<div className="p-8 text-2xl">Winter大会本部で表示する日付または競技を選択してください。別端末でも同じモニター画面を表示できます。</div>}</main>
}
