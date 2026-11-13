"use client"
import {useEffect,useState} from 'react'
import {useMonitorLink} from './monitor-link'
import {WinterMonitorView} from './winter-monitor-view'
import {validateWinterMonitor,type WinterMonitorState} from '@/lib/winter-monitor'
export function WinterMeetingDisplay({channel}:{channel:string}){
 const [state,setState]=useState<WinterMonitorState|null>(null),[full,setFull]=useState(false),[replica,setReplica]=useState(false)
 useEffect(()=>{
  setReplica(window.parent!==window)
  const link=new BroadcastChannel(channel)
  link.onmessage=event=>{if(event.data?.kind==='meeting-preview'){try{setState(validateWinterMonitor(event.data.state))}catch{setState(null)}}}
  link.postMessage({kind:'meeting-query'})
  const fullscreen=()=>setFull(!!document.fullscreenElement)
  document.addEventListener('fullscreenchange',fullscreen)
  return ()=>{link.close();document.removeEventListener('fullscreenchange',fullscreen)}
 },[channel])
 useMonitorLink({channelName:channel,competition:state?.date??'打ち合わせ会',ready:!!state,pending:!!state&&(state.draft||!!state.followingCompetitions?.some(c=>c.draft)),onAudienceReport:r=>setFull(r.fullscreen)})
 return <main className="min-h-dvh bg-white text-slate-950">{!full&&<button disabled={replica} className="m-3 min-h-14 rounded-xl border-2 p-3 text-xl" onClick={()=>void document.documentElement.requestFullscreen()}>全画面表示</button>}{state?<WinterMonitorView state={state}/>:<p>本部で打ち合わせ中の日付を選択してください。</p>}</main>
}
