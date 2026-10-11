"use client"

import { useEffect, useRef, useState } from 'react'
import { isMonitorReport, type MonitorReport } from '@/lib/monitor-link'
export function MonitorStatus({ token }: { token: string | null }) {
 const [report, setReport] = useState<(MonitorReport & { receivedAt: number }) | null>(null)
 const [now, setNow] = useState(Date.now())
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
  const timer = window.setInterval(() => setNow(Date.now()), 2000)
  return () => { window.clearInterval(timer); channel.close() }
 }, [token])
 if (!token) return null
 const connected = !!report && now - report.receivedAt < 8000
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
  <p className="text-lg font-bold">{connected ? 'モニターから表示状況を受信中' : report ? 'モニターとの接続が途切れています' : 'モニターの接続を待っています'}</p>
  <p className="mt-1 text-xl font-bold">{report ? `${connected ? '表示中' : '最後の表示'}：${report.competition}` : 'モニター画面を開いたままにしてください。'}</p>
  {report && <p className="mt-1">{report.ready ? report.pending ? '確認中・未確定の順番' : '正式な出番順' : 'データの読み込み中・更新状態を確認してください'} ／ {report.fullscreen ? '全画面表示' : '通常表示'}{report.hidden ? ' ／ モニターのタブが非表示です' : ''} ／ 最終受信 {new Date(report.receivedAt).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>}
  {connected && report.ready && <details className="mt-3" open><summary className="cursor-pointer text-lg font-bold">モニタープレビュー・操作</summary><p className="my-2 text-sm">この小さな画面の中でスクロールすると、選手側のモニターも連動します。</p><div className="relative overflow-hidden rounded border-2 border-blue-700 bg-white" style={{width:previewWidth,maxWidth:'100%',height:previewWidth*report.height/report.width}}><iframe title="選手側モニターのプレビューと操作" src={`/${token.startsWith('fhs-startlist-')?'startlist-display':'meeting-display'}?control=1#${token}`} style={{width:report.width,height:report.height,border:0,transform:`scale(${previewWidth/report.width})`,transformOrigin:'top left'}}/></div></details>}
  </div>
 </aside>
}
