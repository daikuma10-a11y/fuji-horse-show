"use client"

import { useEffect, useRef, useState } from 'react'
import { verifyAdminSession, type AdminSession } from '@/lib/supabase-rest'
import { loadWinterData } from '@/lib/winter-data'
import { loadWinterRequests, reflectWinterRequest, submitWinterWithdraw, type WinterRequestRow } from '@/lib/winter-reception'

type Data = Awaited<ReturnType<typeof loadWinterData>>
type Props = { session: AdminSession; onSession: (session: AdminSession) => void; data: Data; refresh: number; onChanged: () => void }
const button = 'min-h-14 rounded-xl border-2 border-blue-800 bg-blue-800 p-3 text-xl font-bold text-white disabled:opacity-50'

export function WinterRequestPanel({ session, onSession, data, refresh, onChanged }: Props) {
  const [requests, setRequests] = useState<WinterRequestRow[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [reload, setReload] = useState(0)
  const [orgId, setOrgId] = useState('')
  const [entryId, setEntryId] = useState('')
  const [visitorName, setVisitorName] = useState('')
  const [review, setReview] = useState<{ id: string; entryId: string; visitorName: string } | null>(null)
  const lock = useRef(false)
  useEffect(() => {
    let active = true
    setLoaded(false); setError('')
    loadWinterRequests(session.accessToken).then(rows => { if (active) { setRequests(rows); setLoaded(true) } }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '一覧を取得できません') })
    return () => { active = false }
  }, [session.accessToken, refresh, reload])
  const orgName = (id: string) => data.organizations.find(row => row.id === id)?.name ?? '所属を確認してください'
  const entryLabel = (id: string) => {
    const entry = data.entries.find(row => row.entry_id === id)
    if (!entry) return '対象人馬を確認してください'
    const competition = data.competitions.find(row => row.id === entry.competition_id)
    return `第${competition?.competition_no}競技・${entry.start_order ?? '―'}番　${data.riders.find(row => row.id === entry.rider_id)?.name} ／ ${data.horses.find(row => row.id === entry.horse_id)?.name}${entry.is_op ? '（OP）' : ''}`
  }
  async function run(action: (token: string) => Promise<unknown>, success: string) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const verified = await verifyAdminSession(session); onSession(verified)
      await action(verified.accessToken)
      setMessage(success); setReview(null); setReload(value => value + 1); onChanged()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '処理できませんでした。同じ内容で再試行してください') }
    finally { lock.current = false; setBusy(false) }
  }
  const activeEntries = data.entries.filter(row => !['wd','withdrawn'].includes(row.status.toLowerCase()) && (!orgId || data.riders.find(rider => rider.id === row.rider_id)?.organization_id === orgId))
  return <div className="space-y-5 border-t-2 pt-5">
    <h2 className="text-2xl font-bold">本部：申請一覧・出番表への反映</h2>
    <p>反映前は「未反映」、反映後も一覧に残します。反映ボタンは出番表を変更します。</p>
    <button className={button} disabled={busy} onClick={() => { setReload(value => value + 1); onChanged() }}>最新の情報を確認</button>
    <label className="block text-xl">団体で絞り込む<select className="mt-2 min-h-14 w-full rounded-xl border-2 p-3" value={orgId} onChange={event => { setOrgId(event.target.value); setEntryId(''); setReview(null) }}><option value="">すべての団体</option>{data.organizations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
    {!loaded && !error && <p role="status">申請一覧を読み込んでいます…</p>}
    {loaded && !requests.length && <p>まだWinterの申請はありません。</p>}
    {loaded && requests.filter(row => !orgId || row.organization_id === orgId).map(row => <article key={row.id} className={`space-y-2 rounded-xl border-2 p-4 ${row.status === 'pending' ? 'border-orange-400 bg-orange-50' : 'border-blue-200 bg-blue-50'}`}>
      <p className="text-xl font-bold">{orgName(row.organization_id)} ／ {row.request_type === 'add' ? '追加' : row.request_type === 'withdraw' ? '棄権' : '変更'} ／ {row.status === 'pending' ? '未反映' : row.status === 'reflected' ? '反映済み' : row.status}</p>
      <p>第{data.competitions.find(c => c.id === row.target_competition_id)?.competition_no}競技　{data.riders.find(r => r.id === row.rider_id)?.name} ／ {data.horses.find(h => h.id === row.horse_id)?.name}</p>
      <p>受付担当者：{row.payload.visitorName ?? '―'} ／ ¥{row.fee_amount.toLocaleString('ja-JP')}</p>
      <p className="text-sm">{new Date(row.created_at).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</p>
      {row.status === 'pending' && ['add','withdraw'].includes(row.request_type) && <button className={button} disabled={busy} onClick={() => void run(token => reflectWinterRequest(row.id, token), '出番表へ反映しました')}>出番表へ反映</button>}
    </article>)}
    <h2 className="text-2xl font-bold">棄権受付（0円）</h2>
    {review ? <div className="space-y-3 rounded-xl bg-orange-50 p-4"><p className="text-xl font-bold">この人馬の棄権を保存します</p><p>{entryLabel(review.entryId)}</p><p>受付担当者：{review.visitorName} ／ 料金：0円</p><button className={button} disabled={busy} onClick={() => void run(token => submitWinterWithdraw(review.id, review.entryId, review.visitorName, token), '棄権申請を保存しました。一覧で出番表へ反映してください')}>棄権申請を保存</button><button className={button} disabled={busy} onClick={() => setReview(null)}>入力に戻る</button></div> : <div className="space-y-3">
      <label className="block text-xl">対象の人馬<select className="mt-2 min-h-14 w-full rounded-xl border-2 p-3" value={entryId} onChange={event => setEntryId(event.target.value)}><option value="">人馬を選択</option>{activeEntries.map(row => <option key={row.entry_id} value={row.entry_id}>{entryLabel(row.entry_id)}</option>)}</select></label>
      {!activeEntries.length && <p>対象の出番がありません。追加申請を出番表へ反映すると選択できます。</p>}
      <label className="block text-xl">棄権の受付担当者名<input className="mt-2 min-h-14 w-full rounded-xl border-2 p-3" maxLength={100} value={visitorName} onChange={event => setVisitorName(event.target.value)} /></label>
      <button className={button} disabled={busy || !entryId || !visitorName.trim()} onClick={() => { setError(''); setReview({ id: crypto.randomUUID(), entryId, visitorName: visitorName.trim() }) }}>棄権内容を確認</button>
    </div>}
    {message && <p role="status" className="rounded-xl bg-green-100 p-4 text-xl">{message}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-100 p-4 text-xl">{error}</p>}
  </div>
}
