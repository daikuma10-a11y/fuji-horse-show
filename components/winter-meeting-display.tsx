"use client"
import {useEffect,useState,type CSSProperties} from 'react'
import {MonitorFontControl} from './master/monitor-font-control'
import {MonitorFullscreenButton} from './master/monitor-fullscreen'
import {useMonitorLink} from './monitor-link'
import {WinterMonitorView} from './winter-monitor-view'
import {validateWinterMonitor,type WinterMonitorState} from '@/lib/winter-monitor'

export function WinterMeetingDisplay({channel}:{channel:string}){
 const [state,setState]=useState<WinterMonitorState|null>(null)
 const [full,setFull]=useState(false),[replica,setReplica]=useState(false)
 const [extraLarge,setExtraLarge]=useState(false)
 const [viewportWidth,setViewportWidth]=useState(1280)
 const [connected,setConnected]=useState(false),[fontSize,setFontSize]=useState(18)
 const nameSize=Math.max(16,Math.round(viewportWidth*(extraLarge ? 0.036 : 0.028)*fontSize/18))

 useEffect(()=>{
  const resize=()=>setViewportWidth(window.innerWidth)
  resize()
  window.addEventListener('resize',resize)
  return ()=>window.removeEventListener('resize',resize)
 },[])

 useEffect(()=>{
  setReplica(window.parent!==window)
  const link=new BroadcastChannel(channel)
  let received=0,hasSnapshot=false
  link.onmessage=event=>{
   if(event.data?.kind==='meeting-closed'){received=0;setConnected(false);return}
   if(event.data?.kind==='meeting-alive'){if(hasSnapshot){received=Date.now();setConnected(true)}else link.postMessage({kind:'meeting-query'});return}
   if(event.data?.kind!=='meeting-preview')return
   try{
    setState(validateWinterMonitor(event.data.state));hasSnapshot=true
    received=Date.now();setConnected(true);setExtraLarge(event.data.extraLarge===true)
   }catch{setState(null)}
  }
  link.postMessage({kind:'meeting-query'})
  const timer=window.setInterval(()=>{
   if(Date.now()-received>8000){setConnected(false);link.postMessage({kind:'meeting-query'})}
  },2000)
  const fullscreen=()=>setFull(!!document.fullscreenElement)
  document.addEventListener('fullscreenchange',fullscreen)
  return ()=>{clearInterval(timer);link.close();document.removeEventListener('fullscreenchange',fullscreen)}
 },[channel])

 const changeFont=useMonitorLink({channelName:channel,fontSize,setFontSize,competition:state?.date??'打ち合わせ会',ready:!!state&&connected,pending:!!state&&(state.draft||!!state.followingCompetitions?.some(c=>c.draft)),onAudienceReport:r=>setFull(r.fullscreen)})
 return <main className="meeting-audience min-h-dvh bg-white text-slate-950" style={{'--meeting-row-size':nameSize+'px'} as CSSProperties}>
  <div className={'sticky top-0 z-20 px-3 py-1 text-lg font-bold '+(connected?'bg-amber-100':'bg-red-100')} role="status">打ち合わせ会用・正式反映前{!connected&&(state?'　更新停止・最後に受信した出番表を表示中':'　本部の表示待ち')}</div>
  <MonitorFontControl value={fontSize} onChange={changeFont}/>
  <MonitorFullscreenButton channel={channel} preview={replica} fullscreen={full}/>
  {state ? <WinterMonitorView state={state} nameSize={nameSize}/> : <p>本部で打ち合わせ中の日付を選択してください。</p>}
 </main>
}
