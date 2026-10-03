"use client"

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MeetingMonitorRow, MeetingMonitorSnapshot } from '@/lib/meeting-monitor'
import { monitorRows } from '@/lib/meeting-monitor'
import { useStore } from '@/lib/store'
import { COMPETITION_DATES } from '@/lib/mock-data'

export function StartListMonitor({ source = 'meeting' }: { source?: 'meeting' | 'startlist' }) {
  return source === 'startlist' ? <OfficialStartListMonitor /> : <MeetingStartListMonitor />
}

function OfficialStartListMonitor() {
  const { competitions, entriesByCompetition, getPlayer, getHorse, getOrg, reconciliation, lastSyncedAt, syncError, liveConnected } = useStore()
  const [fontSize, setFontSize] = useState(21)
  const [error, setError] = useState('')
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() }
    catch { setError('全画面表示を開始できません。パソコンではF11キーでも全画面表示にできます。') }
  }
  return <main className="min-h-screen bg-white px-3 py-2 text-slate-900">
    <header className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b-2 border-blue-700 pb-1">
      <h1 className="text-xl font-bold text-blue-800">Fuji Horse Show ／ 正式出番表</h1>
      <div className="flex items-center gap-3 text-sm"><span role="status" className={syncError || !liveConnected ? 'font-bold text-red-700' : 'font-bold text-blue-800'}>{syncError ? '更新停止・通信を確認' : !liveConnected ? '再接続中' : lastSyncedAt ? '変更時に自動更新' : '読み込み中'}{lastSyncedAt > 0 && ` ／ ${new Date(lastSyncedAt).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' })}`}</span><label className="flex items-center gap-1">文字<input aria-label="文字サイズ" type="range" min={12} max={24} value={fontSize} onChange={event => setFontSize(Number(event.target.value))} /></label><button type="button" onClick={() => void fullscreen()} className="rounded-lg border px-3 py-2 font-bold">全画面</button></div>
    </header>
    {(syncError || error) && <p role="alert" className="mb-3 rounded bg-red-50 p-3 text-red-700">{syncError || error}</p>}
    {lastSyncedAt > 0 ? <div className="overflow-x-auto">{competitions.slice().sort((a, b) => a.number - b.number).map(competition => {
      const rows = monitorRows(entriesByCompetition(competition.id), id => getPlayer(id)?.name ?? '要確認', id => getHorse(id)?.name ?? '要確認', id => getOrg(id)?.name ?? '要確認')
      const groups = Array.from({ length: Math.ceil(rows.length / 40) }, (_, index) => rows.slice(index * 40, (index + 1) * 40))
      return <section key={competition.id} className="mb-6 min-w-[950px]" aria-label={`第${competition.number}競技`}>
        <h2 className="mb-2 border-b border-blue-700 text-2xl font-bold">第{competition.number}競技 {competition.name}{competition.official ? ' ★公認' : ''}<span className="ml-3 text-base">{COMPETITION_DATES.find(date => date.value === competition.date)?.label}</span></h2>
        {groups.length ? groups.map((group, index) => <div key={index} className="mb-3"><AudienceStartList rows={group} fontSize={fontSize} /></div>) : <p className="p-3">この競技の人馬はありません。</p>}
      </section>
    })}</div> : <p className="p-5 text-center">{reconciliation.message}</p>}
  </main>
}

function FittedName({ name, fontSize, scale = 1 }: { name: string; fontSize: number; scale?: number }) {
  const container = useRef<HTMLDivElement>(null)
  const text = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const box = container.current, label = text.current
    if (!box || !label) return
    let active = true
    const fit = () => {
      if (!active) return
      const base = fontSize * scale
      label.style.fontSize = `${base}px`
      const width = label.getBoundingClientRect().width
      if (width > box.clientWidth && box.clientWidth > 0) label.style.fontSize = `${base * Math.max(0, box.clientWidth - 1) / width}px`
    }
    fit()
    const observer = new ResizeObserver(fit)
    observer.observe(box)
    void document.fonts.ready.then(fit)
    return () => { active = false; observer.disconnect() }
  }, [name, fontSize, scale])
  return <div ref={container} className="w-full overflow-hidden"><span ref={text} className="inline-block whitespace-nowrap" style={{ fontSize: fontSize * scale }}>{name}</span></div>
}

function AudienceCells({ row, fontSize }: { row?: MeetingMonitorRow; fontSize: number }) {
  if (!row) return <td colSpan={4} className="border-b border-slate-200" />
  const statusClass = `border-b border-slate-200 ${row.withdrawn ? 'bg-red-50 text-red-700' : ''}`
  return <>
    <td className={`${statusClass} font-bold`}><span className="inline-flex items-baseline gap-1 whitespace-nowrap"><span className={`inline-block w-[2.1em] rounded text-center text-[0.7em] ${row.withdrawn ? 'bg-red-700 text-white' : row.op ? 'bg-slate-800 text-white' : ''}`}>{row.withdrawn ? 'WD' : row.op ? 'OP' : ''}</span><span>{row.order}</span></span></td>
    <td className={`${statusClass} font-bold`}><FittedName name={row.player} fontSize={fontSize} /></td>
    <td className={`${statusClass} font-bold`}><FittedName name={row.horse} fontSize={fontSize} /></td>
    <td className={statusClass}><FittedName name={row.organization} fontSize={fontSize} scale={0.85} /></td>
  </>
}

function AudienceStartList({ rows, fontSize }: { rows: MeetingMonitorRow[]; fontSize: number }) {
  return <table className="w-full table-fixed border-collapse leading-[1.18] [&_td]:align-top [&_td]:px-1 [&_td]:py-0.5" style={{ fontSize }}>
    <colgroup><col className="w-[7%]" /><col className="w-[12%]" /><col className="w-[16%]" /><col className="w-[14%]" /><col className="w-[2%]" /><col className="w-[7%]" /><col className="w-[12%]" /><col className="w-[16%]" /><col className="w-[14%]" /></colgroup>
    <thead className="bg-blue-800 text-white"><tr><th className="px-1 py-1 text-left">出番</th><th className="px-1 py-1 text-left">選手</th><th className="px-1 py-1 text-left">馬名</th><th className="px-1 py-1 text-left">所属</th><th aria-hidden="true" className="bg-white" /><th className="px-1 py-1 text-left">出番</th><th className="px-1 py-1 text-left">選手</th><th className="px-1 py-1 text-left">馬名</th><th className="px-1 py-1 text-left">所属</th></tr></thead>
    <tbody>{Array.from({ length: Math.min(20, rows.length) }, (_, index) => <tr key={index} className="even:bg-blue-50">
      <AudienceCells key={rows[index].id} row={rows[index]} fontSize={fontSize} />
      <td aria-hidden="true" className="bg-white" />
      <AudienceCells key={rows[index + 20]?.id ?? 'empty'} row={rows[index + 20]} fontSize={fontSize} />
    </tr>)}</tbody>
  </table>
}

function MeetingStartListMonitor({ source = 'meeting' }: { source?: 'meeting' | 'startlist' }) {
  const [snapshot, setSnapshot] = useState<MeetingMonitorSnapshot | null>(null)
  const [connected, setConnected] = useState(false)
  const [fontSize, setFontSize] = useState(21)
  const [error, setError] = useState('')
  useEffect(() => {
    const token = window.location.hash.slice(1)
    const prefix = source === 'startlist' ? 'fhs-startlist-' : 'fhs-meeting-'
    if (!token.startsWith(prefix) || !/^[a-f0-9-]{36}$/.test(token.slice(prefix.length))) { setError(`本部の「${source === 'startlist' ? '出番表' : '打ち合わせ会'}」から「モニター表示」を押して開いてください。`); return }
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
  }, [source])
  async function fullscreen() {
    try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen() }
    catch { setError('全画面表示を開始できません。パソコンではF11キーでも全画面表示にできます。') }
  }
  const groups = snapshot ? Array.from({ length: Math.ceil(snapshot.rows.length / 40) }, (_, index) => snapshot.rows.slice(index * 40, (index + 1) * 40)) : []
  return <main className="min-h-screen bg-white px-3 py-2 text-slate-900">
    <header className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b-2 border-blue-700 pb-1">
      <div><p className="text-sm font-bold text-blue-800">Fuji Horse Show ／ {source === 'startlist' ? '正式出番表' : '打ち合わせ会用・正式反映前'}</p><h1 className="text-2xl font-bold">{snapshot?.competition ?? '出番表を待っています'}</h1></div>
      <div className="flex items-center gap-3 text-sm"><span role="status" className={connected ? 'font-bold text-blue-800' : 'font-bold text-red-700'}>{connected ? 'リアルタイム表示中' : '接続待ち・更新停止'}{snapshot && ` ／ ${new Date(snapshot.sentAt).toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo' })}`}</span><label className="flex items-center gap-1">文字<input aria-label="文字サイズ" type="range" min={12} max={24} value={fontSize} onChange={event => setFontSize(Number(event.target.value))} /></label><button type="button" onClick={() => void fullscreen()} className="rounded-lg border px-3 py-2 font-bold">全画面</button></div>
    </header>
    {error && <p role="alert" className="mb-3 rounded bg-red-50 p-3 text-red-700">{error}</p>}
    {!connected && <p className="mb-3 rounded bg-amber-50 p-2 font-bold text-amber-900">本部の{source === 'startlist' ? '出番表' : '打ち合わせ会'}画面を開いたままにしてください。表示は最後に受け取った内容です。</p>}
    {snapshot && (groups.length ? <div className="overflow-x-auto">{groups.map((group, index) => <div key={index} className="mb-3 min-w-[950px]"><AudienceStartList rows={group} fontSize={fontSize} /></div>)}</div> : <p className="p-5 text-center">この競技の人馬はありません。</p>)}
  </main>
}
