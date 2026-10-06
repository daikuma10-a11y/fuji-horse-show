"use client"

import { useEffect, useState } from 'react'
import { isMonitorReport, type MonitorReport } from '@/lib/monitor-link'
export function MonitorStatus({ token }: { token: string | null }) {
 const [report, setReport] = useState<(MonitorReport & { receivedAt: number }) | null>(null)
 const [now, setNow] = useState(Date.now())
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
 return <aside className={`print-hide rounded-xl border-2 p-4 ${connected && report.ready && !report.hidden ? 'border-blue-500 bg-blue-50 text-blue-950' : 'border-amber-500 bg-amber-50 text-amber-950'}`} aria-label="モニターの表示状況">
  <p className="text-lg font-bold">{connected ? 'モニターから表示状況を受信中' : report ? 'モニターとの接続が途切れています' : 'モニターの接続を待っています'}</p>
  <p className="mt-1 text-xl font-bold">{report ? `${connected ? '表示中' : '最後の表示'}：${report.competition}` : 'モニター画面を開いたままにしてください。'}</p>
  {report && <p className="mt-1">{report.ready ? report.pending ? '確認中・未確定の順番' : '正式な出番順' : 'データの読み込み中・更新状態を確認してください'} ／ {report.fullscreen ? '全画面表示' : '通常表示'}{report.hidden ? ' ／ モニターのタブが非表示です' : ''} ／ 最終受信 {new Date(report.receivedAt).toLocaleTimeString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>}
  {connected && report.ready && <details className="mt-3" open><summary className="cursor-pointer text-lg font-bold">モニタープレビュー・操作</summary><p className="my-2 text-sm">この小さな画面の中でスクロールすると、選手側のモニターも連動します。</p><div className="relative overflow-hidden rounded border-2 border-blue-700 bg-white" style={{width:400,maxWidth:'100%',height:400*report.height/report.width}}><iframe title="選手側モニターのプレビューと操作" src={`/${token.startsWith('fhs-startlist-')?'startlist-display':'meeting-display'}?control=1#${token}`} style={{width:report.width,height:report.height,border:0,transform:`scale(${400/report.width})`,transformOrigin:'top left'}}/></div></details>}
 </aside>
}
