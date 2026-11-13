"use client"
import { useEffect,useState } from 'react'
import {WinterMeetingDisplay} from '@/components/winter-meeting-display'
import {useMonitorLink} from '@/components/monitor-link'
import { WINTER_MONITOR_CHANNEL,WINTER_MONITOR_KEY,validateWinterMonitor,reconcileWinterMonitor,type WinterMonitorState } from '@/lib/winter-monitor'
import {loadWinterData} from '@/lib/winter-data'
import { WinterMonitorView } from '@/components/winter-monitor-view'
import {subscribeWinterUpdates,loadRemoteWinterMonitor} from '@/lib/winter-live'
export default function WinterMonitorPage(){
 const [channel,setChannel]=useState<string|null>(null)
 useEffect(()=>{const read=()=>setChannel(window.location.hash.slice(1));read();window.addEventListener('hashchange',read);return()=>window.removeEventListener('hashchange',read)},[])
 if(channel===null)return null
 return /^winter-meeting-[a-f0-9-]{36}$/.test(channel)?<WinterMeetingDisplay channel={channel}/>:<OfficialMonitor/>
}
function OfficialMonitor(){
 const[state,setState]=useState<WinterMonitorState|null>(null),[error,setError]=useState(''),[fullscreen,setFullscreen]=useState(false)
 const[liveStatus,setLiveStatus]=useState('')
 const [audienceFullscreen,setAudienceFullscreen]=useState(false)
 useMonitorLink({
  channelName:WINTER_MONITOR_CHANNEL,
  competition:state ? (state.followingCompetitions ? state.date+' 全競技' : '第'+state.competitionNo+'競技 '+state.competitionName) : '日付・競技の選択待ち',
  ready:!!state, pending:!!state && (state.draft || !!state.followingCompetitions?.some(group=>group.draft)),
  onAudienceReport:report=>setAudienceFullscreen(report.fullscreen),
 })
 const [replica,setReplica]=useState(false)
 useEffect(()=>{setReplica(window.parent!==window && new URLSearchParams(window.location.search).get('control')==='1')},[])
 useEffect(()=>{
  let active=true,busy=false,again=false,dataNeeded=false
  const controller=new AbortController()
  async function update(includeData=false){dataNeeded ||= includeData;if(busy){again=true;return}busy=true
   try{do{again=false;const reloadData=dataNeeded;dataNeeded=false;const remote=await loadRemoteWinterMonitor(controller.signal)
    if(!active)break
    let next=remote?validateWinterMonitor(remote):null
    if(next&&reloadData){
     const hasDraft=next.draft||next.followingCompetitions?.some(group=>group.draft)
     if(!next.draft||next.followingCompetitions!==undefined)next=reconcileWinterMonitor(next,await loadWinterData(controller.signal))
     if(active)setError(hasDraft?'調整中の競技は本部で編集中の出番順を表示しています。':'')
    }
    if(active)setState(next)
   }while(active&&again)}catch{if(active)setError('最新の表示を取得できません。表示中の表は通信復旧まで更新されません。')}finally{busy=false;if(active&&again)void update()}
  }
  const stop=subscribeWinterUpdates('monitor',()=>void update(),setLiveStatus),stopData=subscribeWinterUpdates('data',()=>void update(true),message=>{if(message.includes('切断'))setError('出番の自動更新が切断されています。通信復旧を待っています。')})
  void update(true);return()=>{active=false;controller.abort();stop();stopData()}
 },[])
 useEffect(()=>{const update=()=>{try{const raw=window.localStorage.getItem(WINTER_MONITOR_KEY);setState(raw?validateWinterMonitor(JSON.parse(raw)):null);setError('')}catch{setError('本部のモニター情報を読み込めません')}};const onFullscreen=()=>setFullscreen(!!document.fullscreenElement);update();const onStorage=(event:StorageEvent)=>{if(event.key===WINTER_MONITOR_KEY)update()};window.addEventListener('storage',onStorage);window.addEventListener('winter-monitor-changed',update);document.addEventListener('fullscreenchange',onFullscreen);return()=>{window.removeEventListener('storage',onStorage);window.removeEventListener('winter-monitor-changed',update);document.removeEventListener('fullscreenchange',onFullscreen)}},[])
 return <main className="min-h-dvh bg-white text-slate-950">{!(replica?audienceFullscreen:fullscreen)&&<button disabled={replica} className="m-3 min-h-14 rounded-xl border-2 p-3 text-xl" onClick={()=>document.documentElement.requestFullscreen().catch(()=>setError('このブラウザーでは全画面にできません'))}>全画面表示</button>}<p role="status" className="px-3 text-sm">{liveStatus}</p>{error&&<p role="alert">{error}</p>}{state?<WinterMonitorView state={state}/>:<div className="p-8 text-2xl">Winter大会本部で表示する日付または競技を選択してください。別端末でも同じモニター画面を表示できます。</div>}</main>
}
