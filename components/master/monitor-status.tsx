"use client"

import { useEffect, useRef, useState } from 'react'
import { useAudienceFullscreen, previewClick, displayClick } from './monitor-fullscreen'
import { isMonitorReport, type MonitorReport } from '@/lib/monitor-link'
export function MonitorStatus({ token, displayPath, onPreviewScroll }: { token: string | null; displayPath?: string; onPreviewScroll?:(value:unknown)=>void }) {
 const [report, setReport] = useState<(MonitorReport & { receivedAt: number }) | null>(null)
 const [now, setNow] = useState(Date.now())
 const previewFrame=useRef<HTMLIFrameElement>(null)
 const fullscreen = useAudienceFullscreen(token,displayPath)
 useEffect(()=>{
  if(!displayPath)return
  const click=(event:Event)=>{if(event.target===previewFrame.current)fullscreen.request()}
  const open=(event:Event)=>{
   if((event as CustomEvent).detail!==token)return
   event.preventDefault();fullscreen.request()
  }
  window.addEventListener(previewClick,click);window.addEventListener(displayClick,open)
  return ()=>{window.removeEventListener(previewClick,click);window.removeEventListener(displayClick,open)}
 },[token,displayPath,fullscreen.request])
 const panel = useRef<HTMLElement>(null)
 const drag = useRef<{id:number; x:number; y:number; left:number; top:number} | null>(null)
 const [position, setPosition] = useState<{left:number;top:number} | null>(null)
 const [collapsed, setCollapsed] = useState(false)
 const [previewWidth, setPreviewWidth] = useState(400)
 const place = (left:number, top:number) => {
  const rect=panel.current?.getBoundingClientRect()
  setPosition({left:Math.max(12,Math.min(left,window.innerWidth-(rect?.width??436)-12)),top:Math.max(12,Math.min(top,window.innerHeight-(rect?.height??60)-12))})
 }
 useEffect(()=>{
  const resize=()=>{
   setPreviewWidth(Math.max(1,Math.min(400,window.innerWidth-60)))
   const rect=panel.current?.getBoundingClientRect()
   if(rect)place(rect.left,rect.top)
  }
  resize();window.addEventListener('resize',resize)
  return()=>window.removeEventListener('resize',resize)
 },[token])
 useEffect(()=>{
  const rect=panel.current?.getBoundingClientRect()
  if(rect)place(rect.left,rect.top)
 },[collapsed,report?.height,report?.width])
 useEffect(() => {
  setReport(null)
  if (!token || typeof BroadcastChannel === 'undefined') return
  const channel = new BroadcastChannel(token)
  channel.onmessage = event => {
   const data = event.data
   if (isMonitorReport(data)) setReport({ ...data, receivedAt: Date.now() })
  }
  channel.postMessage({kind:'monitor-query'})
  const timer = window.setInterval(() => setNow(Date.now()), 2000)
  return () => { window.clearInterval(timer); channel.close() }
 }, [token])
 useEffect(()=>{
  if(!onPreviewScroll)return
  const receive=(e:MessageEvent)=>{if(e.origin===window.location.origin&&e.source===previewFrame.current?.contentWindow&&e.data?.kind==='winter-preview-scroll')onPreviewScroll(e.data)}
  window.addEventListener('message',receive);return()=>window.removeEventListener('message',receive)
 },[onPreviewScroll])
 useEffect(()=>{
  const box=panel.current
  if(!box)return
  const wheel=(e:WheelEvent)=>{
   const frame=previewFrame.current
   if(!frame?.contentWindow||!frame.closest('details')?.open||e.ctrlKey||!e.deltaY||!e.cancelable)return
   // The iframe handles wheel/touch on the table itself. Route wheel on its surrounding card too.
   if(box.scrollHeight>box.clientHeight+1)return
   const win=frame.contentWindow
   const unit=e.deltaMode===1?16:e.deltaMode===2?win.innerHeight:1
   e.preventDefault();win.scrollBy({top:e.deltaY*unit,behavior:'instant'})
  }
  box.addEventListener('wheel',wheel,{passive:false});return()=>box.removeEventListener('wheel',wheel)
 },[token])
 if (!token) return null
 const connected = !!report && now - report.receivedAt < 8000
 const previewUrl=displayPath ? displayPath.split('#')[0]+'?control=1'+(displayPath.includes('#')?'#'+displayPath.split('#')[1]:'') : `/${token.startsWith('fhs-startlist-')?'startlist-display':'meeting-display'}?control=1#${token}`
 const width=report?.width ?? 1280, height=report?.height ?? 720
 const previewAvailable=displayPath ? !collapsed : connected && report?.ready
 return <aside ref={panel} className={`print-hide fixed z-40 overflow-auto rounded-xl border-2 p-4 shadow-xl ${connected && report.ready && !report.hidden ? 'border-blue-500 bg-blue-50 text-blue-950' : 'border-amber-500 bg-amber-50 text-amber-950'}`} style={{width:436,maxWidth:'calc(100vw - 24px)',maxHeight:'calc(100dvh - 24px)',...(position?{left:position.left,top:position.top}:{right:12,bottom:12})}} aria-label="モニターの表示状況">
  <div className="mb-3 flex items-center gap-2">
   <div role="button" tabIndex={0} aria-label="モニター小窓を移動。矢印キーでも移動できます" className="min-h-11 flex-1 cursor-move select-none rounded-lg border border-current px-3 py-2 font-bold" style={{touchAction:'none'}}
    onPointerDown={event=>{if(event.button!==0)return;const rect=panel.current?.getBoundingClientRect();if(!rect)return;drag.current={id:event.pointerId,x:event.clientX,y:event.clientY,left:rect.left,top:rect.top};event.currentTarget.setPointerCapture(event.pointerId);event.preventDefault()}}
    onPointerMove={event=>{const start=drag.current;if(start?.id===event.pointerId)place(start.left+event.clientX-start.x,start.top+event.clientY-start.y)}}
    onPointerUp={event=>{if(drag.current?.id===event.pointerId)drag.current=null}}
    onPointerCancel={()=>{drag.current=null}}
    onLostPointerCapture={()=>{drag.current=null}}
    onKeyDown={event=>{const offsets:Record<string,[number,number]>={ArrowLeft:[-20,0],ArrowRight:[20,0],ArrowUp:[0,-20],ArrowDown:[0,20]};const offset=offsets[event.key],rect=panel.current?.getBoundingClientRect();if(offset&&rect){event.preventDefault();place(rect.left+offset[0],rect.top+offset[1])}}}
   >↕ モニター小窓を移動</div>
   <button type="button" className="min-h-11 rounded-lg border border-current px-3 font-bold" aria-expanded={!collapsed} onClick={()=>setCollapsed(value=>!value)}>{collapsed?'開く':'畳む'}</button>
  </div>
  <div hidden={collapsed}>
  <p className="text-lg font-bold">{connected ? 'モニターから表示状況を受信中' : report ? 'モニターとの接続が途切れています' : onPreviewScroll ? '別端末のモニターにもスクロール位置を送ります' : displayPath ? '同じPCの外部モニターを待っています' : 'モニターの接続を待っています'}</p>
  <p className="mt-1 text-xl font-bold">{report ? `${connected ? '表示中' : '最後の表示'}：${report.competition}` : displayPath ? '出番表のプレビュー' : 'モニター画面を開いたままにしてください。'}</p>
  {report && <p className="mt-1">{report.ready ? report.pending ? '確認中・未確定の順番' : '正式な出番順' : 'データの読み込み中・更新状態を確認してください'} ／ {report.fullscreen ? '全画面表示' : '通常表示'}{report.hidden ? ' ／ モニターのタブが非表示です' : ''} ／ 最終受信 {new Date(report.receivedAt).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>}
  {displayPath&&<div className="mt-2">
   <button type="button" className="min-h-11 rounded-lg border-2 border-primary bg-white px-3 font-bold text-primary" onClick={fullscreen.stop??fullscreen.request}>{fullscreen.stop?'全画面配信を終了':'外部モニターを全画面表示'}</button>
   {fullscreen.fallback&&<a className="ml-2 underline" href={displayPath} target={token?.startsWith('winter-meeting-')?'fhs-winter-meeting-display':'fhs-winter-startlist-monitor'} onClick={event=>{
    if(window.open(event.currentTarget.href,event.currentTarget.target,'popup'))event.preventDefault()
   }}>別ウィンドウで表示</a>}
   {fullscreen.fallback&&<p>別ウィンドウを外部モニターへ移し、その画面で F11 を押してください。</p>}
   {fullscreen.hint&&<p role="status" className="mt-1 font-semibold">{fullscreen.hint}</p>}
  </div>}
  {previewAvailable && <details className="mt-3" open><summary className="cursor-pointer text-lg font-bold">モニタープレビュー・操作</summary><p className="my-2 text-sm">{connected||onPreviewScroll ? '枠内の出番表を上下にスクロールすると、モニターも連動します。' : '外部画面の表示位置は未確認です。'}</p><div className="relative overflow-clip rounded border-2 border-blue-700 bg-white" style={{width:previewWidth,maxWidth:'100%',height:previewWidth*height/width}}><iframe ref={previewFrame} title="選手側モニターのプレビューと操作" src={previewUrl} style={{position:'absolute',top:0,left:0,width,height,border:0,transform:`scale(${previewWidth/width})`,transformOrigin:'top left'}}/></div></details>}
  </div>
 </aside>
}
