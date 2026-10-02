"use client"

import { useEffect, useState } from 'react'
import type { MeetingMonitorSnapshot } from '@/lib/meeting-monitor'

export default function MeetingDisplayPage() {
  const [snapshot, setSnapshot] = useState<MeetingMonitorSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [fontSize, setFontSize] = useState(18)
  const [error, setError] = useState('')
  useEffect(() => {
    const token = window.location.hash.slice(1)
    if (!/^fhs-meeting-[a-f0-9-]{36}$/.test(token)) { setError('本部の「打ち合わせ会」から「モニター表示」を押して開いてください。'); return }
    const channel = new BroadcastChannel(token)
    let lastReceived = 0
    channel.onmessage = event => {
      if (event.data?.kind !== 'snapshot' || !Array.isArray(event.data.rows)) return
      lastReceived = Date.now(); setSnapshot(event.data); setConnected(true)
    }
    const request = () => { channel.postMessage({ kind: 'request' }); setConnected(lastReceived > 0 && Date.now() - lastReceived < 7000) }
    request()
    const timer = window.setInterval(request, 2000)
    return () => { window.clearInterval(timer); channel.close() }
  }, [])
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() }
    catch { setError('全画面表示を開始できません。パソコンではF11キーでも全画面表示にできます。') }
  }
  return <main className="min-h-screen bg-white px-5 py-3 text-slate-900">
    <header className="mb-3 flex flex-wrap items-center justify-between gap-3 border-b-2 border-blue-700 pb-2">
      <div><p className="text-sm font-bold text-blue-800">Fuji Horse Show ／ 打ち合わせ会用・正式反映前</p><h1 className="text-2xl font-bold">{snapshot?.competition ?? '出番表を待っています'}</h1></div>
      <div className="flex items-center gap-3 text-sm"><span role="status" className={connected ? 'font-bold text-blue-800' : 'font-bold text-red-700'}>{connected ? 'リアルタイム表示中' : '接続待ち・更新停止'}{snapshot && ` ／ ${new Date(snapshot.sentAt).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' })}`}</span><label className="flex items-center gap-1">文字<input aria-label="文字サイズ" type="range" min={12} max={24} value={fontSize} onChange={event => setFontSize(Number(event.target.value))} /></label><button type="button" onClick={() => void fullscreen()} className="rounded-lg border px-3 py-2 font-bold">全画面</button></div>
    </header>
    {error && <p role="alert" className="mb-3 rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {!connected && <p className="mb-3 rounded bg-amber-50 p-2 font-bold text-amber-900">本部の打ち合わせ会画面を開いたままにしてください。表示は最後に受け取った内容です。</p>}
    {snapshot && <div className="overflow-x-auto"><table className="w-full table-fixed border-collapse" style={{ fontSize }}><thead className="bg-blue-800 text-white"><tr><th className="w-[6%] px-2 py-1 text-left">出番</th><th className="w-[22%] px-2 py-1 text-left">選手名</th><th className="w-[10%] px-2 py-1 text-left">受付</th><th className="w-[30%] px-2 py-1 text-left">馬名</th><th className="px-2 py-1 text-left">所属</th></tr></thead><tbody>{snapshot.rows.map(row => <tr key={row.id} className={`border-b border-slate-200 ${row.withdrawn ? 'bg-red-50 text-red-700' : 'even:bg-blue-50'}`}><td className="px-2 py-1 font-bold">{row.order}{row.op && <span className="ml-1 rounded bg-slate-800 px-1 text-[0.65em] text-white">OP</span>}</td><td className="px-2 py-1 font-bold">{row.player}{row.riderGap !== undefined && <span className="ml-2 inline-block rounded bg-amber-100 px-1 text-[0.65em] text-amber-950">選手：間に{row.riderGap}頭・要確認</span>}</td><td className="px-2 py-1">{row.mark && <span className={`rounded px-1 text-[0.75em] font-bold text-white ${row.withdrawn ? 'bg-red-700' : row.mark === '追加' ? 'bg-blue-700' : 'bg-violet-700'}`}>{row.mark}</span>}</td><td className="px-2 py-1">{row.horse}{row.horseGap !== undefined && <span className="ml-2 inline-block rounded bg-sky-100 px-1 text-[0.65em] text-sky-950">馬：間に{row.horseGap}頭・要確認</span>}</td><td className="px-2 py-1 text-[0.85em]">{row.organization}</td></tr>)}</tbody></table>{snapshot.rows.length === 0 && <p className="p-5 text-center">この競技の人馬はありません。</p>}</div>}
  </main>
}
