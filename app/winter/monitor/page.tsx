"use client"
import { useEffect,useState } from 'react'
import { WINTER_MONITOR_KEY,validateWinterMonitor,type WinterMonitorState } from '@/lib/winter-monitor'
import { WinterMonitorView } from '@/components/winter-monitor-view'
export default function WinterMonitorPage(){
 const[state,setState]=useState<WinterMonitorState|null>(null),[error,setError]=useState(''),[fullscreen,setFullscreen]=useState(false)
 useEffect(()=>{const update=()=>{try{const raw=window.localStorage.getItem(WINTER_MONITOR_KEY);setState(raw?validateWinterMonitor(JSON.parse(raw)):null);setError('')}catch{setError('本部のモニター情報を読み込めません')}};const onFullscreen=()=>setFullscreen(!!document.fullscreenElement);update();window.addEventListener('storage',update);window.addEventListener('winter-monitor-changed',update);document.addEventListener('fullscreenchange',onFullscreen);return()=>{window.removeEventListener('storage',update);window.removeEventListener('winter-monitor-changed',update);document.removeEventListener('fullscreenchange',onFullscreen)}},[])
 return <main className="min-h-dvh bg-white text-slate-950">{!fullscreen&&<button className="m-3 min-h-14 rounded-xl border-2 p-3 text-xl" onClick={()=>document.documentElement.requestFullscreen().catch(()=>setError('このブラウザーでは全画面にできません'))}>全画面表示</button>}{error&&<p role="alert">{error}</p>}{state?<WinterMonitorView state={state}/>:<div className="p-8 text-2xl">同じパソコン・同じブラウザーの大会本部で、表示する競技を選択してください。</div>}</main>
}
