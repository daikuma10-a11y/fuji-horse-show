"use client"

import { useEffect, useState } from 'react'
import type { MeetingMonitorRow, MeetingMonitorSnapshot } from '@/lib/meeting-monitor'

function AudienceStartList({ rows, fontSize }: { rows: MeetingMonitorRow[]; fontSize: number }) {
  return <table className="w-full table-fixed border-collapse leading-[1.18] [&_td]:align-top [&_td]:px-1 [&_td]:py-0.5" style={{ fontSize }}>
    <colgroup><col className="w-[9%]" /><col className="w-[21%]" /><col className="w-[14%]" /><col className="w-[30%]" /><col className="w-[26%]" /></colgroup>
    <thead className="bg-blue-800 text-white"><tr><th className="px-1 py-1 text-left">出番</th><th className="px-1 py-1 text-left">選手</th><th className="px-1 py-1 text-left">受付</th><th className="px-1 py-1 text-left">馬名</th><th className="px-1 py-1 text-left">所属</th></tr></thead>
    <tbody>{rows.map(row => <tr key={row.id} className={`border-b border-slate-200 ${row.withdrawn ? 'bg-red-50 text-red-700' : 'even:bg-blue-50'}`}>
      <td className="font-bold">{row.order}{row.op && <span className="ml-0.5 inline-block rounded bg-slate-800 px-0.5 text-[0.65em] text-white">OP</span>}</td>
      <td className="break-words font-bold">{row.player}</td>
      <td className="break-words">{row.mark && <span className={`rounded px-0.5 text-[0.75em] font-bold text-white ${row.withdrawn ? 'bg-red-700' : row.mark === '追加' ? 'bg-blue-700' : 'bg-violet-700'}`}>{row.mark}</span>}</td>
      <td className="whitespace-normal break-words font-bold">{row.horse}</td>
      <td className="break-words text-[0.85em]">{row.organization}</td>
    </tr>)}</tbody>
  </table>
}

export default function MeetingDisplayPage() {
  const [snapshot, setSnapshot] = useState<MeetingMonitorSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [fontSize, setFontSize] = useState(18)
  const [error, setError] = useState('')
  useEffect(() => {
    setFontSize(Math.max(12, Math.min(18, Math.floor((window.innerHeight - 110) / 20 / 1.35))))
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
  const groups = snapshot ? Array.from({ length: Math.ceil(snapshot.rows.length / 40) }, (_, index) => snapshot.rows.slice(index * 40, (index + 1) * 40)) : []
  return <main className="min-h-screen bg-white px-3 py-2 text-slate-900">
    <header className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b-2 border-blue-700 pb-1">
      <div><p className="text-sm font-bold text-blue-800">Fuji Horse Show ／ 打ち合わせ会用・正式反映前</p><h1 className="text-2xl font-bold">{snapshot?.competition ?? '出番表を待っています'}</h1></div>
      <div className="flex items-center gap-3 text-sm"><span role="status" className={connected ? 'font-bold text-blue-800' : 'font-bold text-red-700'}>{connected ? 'リアルタイム表示中' : '接続待ち・更新停止'}{snapshot && ` ／ ${new Date(snapshot.sentAt).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' })}`}</span><label className="flex items-center gap-1">文字<input aria-label="文字サイズ" type="range" min={12} max={24} value={fontSize} onChange={event => setFontSize(Number(event.target.value))} /></label><button type="button" onClick={() => void fullscreen()} className="rounded-lg border px-3 py-2 font-bold">全画面</button></div>
    </header>
    {error && <p role="alert" className="mb-3 rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {!connected && <p className="mb-3 rounded bg-amber-50 p-2 font-bold text-amber-900">本部の打ち合わせ会画面を開いたままにしてください。表示は最後に受け取った内容です。</p>}
    {snapshot && (groups.length ? <div className="overflow-x-auto">{groups.map((group, index) => <div key={index} className="mb-3 grid min-w-[950px] grid-cols-2 gap-3"><AudienceStartList rows={group.slice(0, 20)} fontSize={fontSize} /><AudienceStartList rows={group.slice(20, 40)} fontSize={fontSize} /></div>)}</div> : <p className="p-5 text-center">この競技の人馬はありません。</p>)}
  </main>
}
