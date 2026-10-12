"use client"
import { useEffect,useRef,useState } from 'react'
import { WINTER_MONITOR_KEY,validateWinterMonitor,reconcileWinterMonitor,type WinterMonitorState } from '@/lib/winter-monitor'
import {loadWinterData} from '@/lib/winter-data'
import { WinterMonitorView } from '@/components/winter-monitor-view'
import {subscribeWinterUpdates,loadRemoteWinterMonitor} from '@/lib/winter-live'
export default function WinterMonitorPage(){
 const[state,setState]=useState<WinterMonitorState|null>(null),[error,setError]=useState(''),[fullscreen,setFullscreen]=useState(false)
 const[liveStatus,setLiveStatus]=useState('')
 const current=useRef<WinterMonitorState|null>(null);current.current=state
 useEffect(()=>{
  let active=true,busy=false,again=false,dataNeeded=false
  const controller=new AbortController()
  async function update(includeData=false){dataNeeded ||= includeData;if(busy){again=true;return}busy=true
   try{do{again=false;const reloadData=dataNeeded;dataNeeded=false;const remote=await loadRemoteWinterMonitor(controller.signal)
    if(!active)break
    let next=remote?validateWinterMonitor(remote):null
    if(next&&reloadData){if(next.draft)setError('調整中の表示を維持しています。出番の更新がある場合は本部で最新の出番を確認してください。');else{next=reconcileWinterMonitor(next,await loadWinterData(controller.signal));if(active)setError('')}}
    if(active){current.current=next;setState(next)}
   }while(active&&again)}catch{if(active)setError('最新の表示を取得できません。表示中の表は通信復旧まで更新されません。')}finally{busy=false}
  }
  const stop=subscribeWinterUpdates('monitor',()=>void update(),setLiveStatus),stopData=subscribeWinterUpdates('data',()=>void update(true),message=>{if(message.includes('切断'))setError('出番の自動更新が切断されています。通信復旧を待っています。')})
  void update(true);return()=>{active=false;controller.abort();stop();stopData()}
 },[])
 useEffect(()=>{const update=()=>{try{const raw=window.localStorage.getItem(WINTER_MONITOR_KEY);setState(raw?validateWinterMonitor(JSON.parse(raw)):null);setError('')}catch{setError('本部のモニター情報を読み込めません')}};const onFullscreen=()=>setFullscreen(!!document.fullscreenElement);update();window.addEventListener('storage',update);window.addEventListener('winter-monitor-changed',update);document.addEventListener('fullscreenchange',onFullscreen);return()=>{window.removeEventListener('storage',update);window.removeEventListener('winter-monitor-changed',update);document.removeEventListener('fullscreenchange',onFullscreen)}},[])
 return <main className="min-h-dvh bg-white text-slate-950">{!fullscreen&&<button className="m-3 min-h-14 rounded-xl border-2 p-3 text-xl" onClick={()=>document.documentElement.requestFullscreen().catch(()=>setError('このブラウザーでは全画面にできません'))}>全画面表示</button>}<p role="status" className="px-3 text-sm">{liveStatus}</p>{error&&<p role="alert">{error}</p>}{state?<WinterMonitorView state={state}/>:<div className="p-8 text-2xl">Winter大会本部で表示する競技を選択してください。別端末でも同じモニター画面を表示できます。</div>}</main>
}
