"use client"
import {useEffect,useState,type CSSProperties} from 'react'
import {MonitorFullscreenButton} from './master/monitor-fullscreen'
import {useMonitorLink} from './monitor-link'
import {WinterMonitorView} from './winter-monitor-view'
import {validateWinterMonitor,type WinterMonitorState} from '@/lib/winter-monitor'

export function WinterMeetingDisplay({channel}:{channel:string}){
 const [state,setState]=useState<WinterMonitorState|null>(null)
 const [full,setFull]=useState(false),[replica,setReplica]=useState(false)
 const [extraLarge,setExtraLarge]=useState(false)
 const [viewportWidth,setViewportWidth]=useState(1280)
 const nameSize=Math.max(16,Math.round(viewportWidth*(extraLarge ? 0.036 : 0.028)))

 useEffect(()=>{
  const resize=()=>setViewportWidth(window.innerWidth)
  resize()
  window.addEventListener('resize',resize)
  return ()=>window.removeEventListener('resize',resize)
 },[])

 useEffect(()=>{
  setReplica(window.parent!==window)
  const link=new BroadcastChannel(channel)
  link.onmessage=event=>{
   if(event.data?.kind!=='meeting-preview')return
   try{
    setState(validateWinterMonitor(event.data.state))
    setExtraLarge(event.data.extraLarge===true)
   }catch{setState(null)}
  }
  link.postMessage({kind:'meeting-query'})
  const fullscreen=()=>setFull(!!document.fullscreenElement)
  document.addEventListener('fullscreenchange',fullscreen)
  return ()=>{link.close();document.removeEventListener('fullscreenchange',fullscreen)}
 },[channel])

 useMonitorLink({channelName:channel,competition:state?.date??'打ち合わせ会',ready:!!state,pending:!!state&&(state.draft||!!state.followingCompetitions?.some(c=>c.draft)),onAudienceReport:r=>setFull(r.fullscreen)})
 return <main className="meeting-audience min-h-dvh bg-white text-slate-950" style={{'--meeting-row-size':nameSize+'px'} as CSSProperties}>
  <MonitorFullscreenButton channel={channel} preview={replica} fullscreen={full}/>
  {state ? <WinterMonitorView state={state} nameSize={nameSize}/> : <p>本部で打ち合わせ中の日付を選択してください。</p>}
 </main>
}
