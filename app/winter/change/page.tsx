"use client"

import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { loadWinterData } from '@/lib/winter-data'
import { signInAdmin, verifyAdminSession, type AdminSession } from '@/lib/supabase-rest'
import { WINTER_EVENT_NAME, winterCompetition, type WinterFeeSelection } from '@/lib/winter-event'
import { reviewWinterChange, submitWinterChange, type WinterChangeInput } from '@/lib/winter-change'

type Data = Awaited<ReturnType<typeof loadWinterData>>
const field = 'mt-2 min-h-16 w-full rounded-xl border-2 bg-white p-3 text-xl'
const button = 'min-h-16 w-full rounded-xl bg-blue-800 p-4 text-2xl font-bold text-white disabled:opacity-50'

export default function WinterChangePage() {
  const [data, setData] = useState<Data | null>(null), [reload, setReload] = useState(0)
  const [orgId, setOrgId] = useState(''), [entryId, setEntryId] = useState('')
  const [competitionId, setCompetitionId] = useState(''), [riderId, setRiderId] = useState(''), [horseId, setHorseId] = useState('')
  const [fromSelection, setFromSelection] = useState<WinterFeeSelection>({}), [selection, setSelection] = useState<WinterFeeSelection>({})
  const [visitorName, setVisitorName] = useState(''), [review, setReview] = useState<WinterChangeInput | null>(null)
  const [session, setSession] = useState<AdminSession | null>(null), [email, setEmail] = useState(''), [password, setPassword] = useState('')
  const [error, setError] = useState(''), [saved, setSaved] = useState(''), [busy, setBusy] = useState(false)
  const lock = useRef(false)
  useEffect(() => { setOrgId(new URLSearchParams(window.location.search).get('org') ?? '') }, [])
  useEffect(() => {
    const controller = new AbortController()
    loadWinterData(controller.signal).then(value => { if (!controller.signal.aborted) setData(value) }).catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : 'Winterデータを読み込めません') })
    return () => controller.abort()
  }, [reload])
  const original = data?.entries.find(row => row.entry_id === entryId)
  const from = data?.competitions.find(row => row.id === original?.competition_id)
  const competition = data?.competitions.find(row => row.id === competitionId)
  const organization = data?.organizations.find(row => row.id === orgId)
  const rider = data?.riders.find(row => row.id === riderId), horse = data?.horses.find(row => row.id === horseId)
  const entries = data?.entries.filter(row => !['wd','withdrawn'].includes(row.status.toLowerCase()) && data.riders.find(r => r.id === row.rider_id)?.organization_id === orgId) ?? []
  const labelEntry = (id: string) => {
    const e = data?.entries.find(row => row.entry_id === id)
    return e ? `第${e.competition_no}競技・${e.start_order}番　${data?.riders.find(r => r.id === e.rider_id)?.name} ／ ${data?.horses.find(h => h.id === e.horse_id)?.name}${e.is_op ? '（OP）' : ''}` : ''
  }
  function chooseEntry(id: string) {
    const row = data?.entries.find(e => e.entry_id === id)
    setEntryId(id); setReview(null); setSaved(''); setError('')
    setCompetitionId(row?.competition_id ?? ''); setRiderId(row?.rider_id ?? ''); setHorseId(row?.horse_id ?? '')
    setFromSelection({ isOp: !!row?.is_op }); setSelection({ isOp: !!row?.is_op })
  }
  function confirm() {
    setError(''); setSaved('')
    try {
      if (!original || !from || !organization || !competition || !rider || !horse) throw new Error('変更前と変更後の人馬を選択してください')
      const input: WinterChangeInput = { original: { ...original }, from: { ...from }, fromSelection: { ...fromSelection }, target: { id: crypto.randomUUID(), organization: { ...organization }, competition: { ...competition }, rider: { ...rider }, horse: { ...horse }, visitorName, selection: { ...selection } } }
      reviewWinterChange(input); setReview(input)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '変更内容を確認してください') }
  }
  async function login(event: FormEvent) {
    event.preventDefault(); if (lock.current) return
    lock.current = true; setBusy(true); setError('')
    try { setSession(await signInAdmin(email,password)); setPassword('') }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'ログインできません') }
    finally { lock.current = false; setBusy(false) }
  }
  async function save() {
    if (!review || !session || lock.current) return
    lock.current = true; setBusy(true); setError('')
    try {
      const verified = await verifyAdminSession(session); setSession(verified)
      setSaved(await submitWinterChange(review,verified.accessToken)); setReview(null); setEntryId(''); setReload(value => value+1)
    } catch (reason) { setError(reason instanceof Error ? reason.message : '保存できません。同じ内容で再試行してください') }
    finally { lock.current = false; setBusy(false) }
  }
  const amounts = review ? reviewWinterChange(review) : null
  return <main className="mx-auto min-h-dvh max-w-3xl space-y-5 bg-slate-50 p-5 text-slate-900">
    <h1 className="text-3xl font-bold">{WINTER_EVENT_NAME}</h1>
    <Link className="inline-flex min-h-14 items-center rounded-xl border-2 p-4 text-xl font-bold" href="/winter">受付トップに戻る</Link>
    <h2 className="rounded-xl bg-blue-100 p-4 text-3xl font-bold">変更受付</h2>
    <p className="text-lg">操作テスト版です。保存には本部ログインが必要です。</p>
    {error && <p role="alert" className="rounded-xl bg-red-100 p-4 text-xl">{error}</p>}
    {!data ? <button className={button} onClick={() => { setError(''); setReload(value => value+1) }}>Winterデータを読み込む</button> : review && amounts ? <section className="space-y-4 rounded-xl border-2 bg-white p-5">
      <h3 className="text-2xl font-bold">この内容で変更します</h3>
      <p className="text-xl">変更前：第{review.from.competition_no}競技<br />{data.riders.find(r => r.id === review.original.rider_id)?.name} ／ {data.horses.find(h => h.id === review.original.horse_id)?.name}{review.original.is_op ? '（OP）' : ''}</p>
      <p className="text-xl font-bold">変更後：第{review.target.competition.competition_no}競技 {review.target.competition.name}<br />{review.target.rider.name} ／ {review.target.horse.name}{review.target.selection.isOp ? '（OP）' : ''}<br />所属：{review.target.organization.name}</p>
      {amounts.treatedAsWithdrawAdd && <p className="rounded-xl bg-orange-100 p-4 text-xl font-bold">2項目以上の変更のため、棄権＋追加として扱います。</p>}
      <p className="text-xl">変更手数料：¥{amounts.fee.changeBase.toLocaleString('ja-JP')}<br />競技料金の差額：¥{amounts.fee.competitionDiff.toLocaleString('ja-JP')}<br />追加手数料：¥{amounts.fee.addBase.toLocaleString('ja-JP')}<br />追加競技料金：¥{amounts.fee.addEntry.toLocaleString('ja-JP')}</p>
      <p className="text-3xl font-bold">合計：¥{amounts.fee.total.toLocaleString('ja-JP')}</p>
      <p>受付担当者：{review.target.visitorName}</p>
      <button className={button} disabled={busy || !session} onClick={() => void save()}>{busy ? '保存中…' : '変更申請を保存'}</button>
      {!session && <p>下の本部ログイン後に保存できます。</p>}
      <button className={button} disabled={busy} onClick={() => setReview(null)}>入力に戻る</button>
    </section> : <div className="space-y-4">
      <label className="block text-xl font-bold">団体<select className={field} value={orgId} onChange={e => { setOrgId(e.target.value); chooseEntry('') }}><option value="">団体を選択</option>{[...data.organizations].sort((a,b)=>a.name.localeCompare(b.name,'ja')).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="block text-xl font-bold">変更する人馬<select className={field} value={entryId} onChange={e => chooseEntry(e.target.value)}><option value="">出番表から人馬を選択</option>{entries.map(row => <option key={row.entry_id} value={row.entry_id}>{labelEntry(row.entry_id)}</option>)}</select></label>
      {!entries.length && <p className="rounded-xl bg-blue-100 p-4 text-xl">対象の出番がありません。「大会本部」で人馬を登録し、追加を出番表へ反映すると選択できます。</p>}
      {original && from && <>
        <p className="rounded-xl bg-white p-4 text-xl">変更前：{labelEntry(original.entry_id)}</p>
        <FeeSelection label="変更前" competition={from} value={fromSelection} onChange={setFromSelection} />
        <h3 className="text-2xl font-bold">変更後の内容</h3>
        <label className="block text-xl font-bold">競技<select className={field} value={competitionId} onChange={e => { setCompetitionId(e.target.value); setSelection({}) }}>{[...data.competitions].sort((a,b)=>a.competition_date.localeCompare(b.competition_date)||(['①','②','③','④'].indexOf(a.competition_no)-['①','②','③','④'].indexOf(b.competition_no))||Number(a.competition_no)-Number(b.competition_no)).map(row => <option key={row.id} value={row.id}>第{row.competition_no}競技 {row.name}</option>)}</select></label>
        <label className="block text-xl font-bold">選手<select className={field} value={riderId} onChange={e => setRiderId(e.target.value)}>{data.riders.filter(r=>r.organization_id===orgId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        <label className="block text-xl font-bold">馬<select className={field} value={horseId} onChange={e => setHorseId(e.target.value)}>{data.horses.filter(h=>h.organization_id===orgId).map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
        {competition && <FeeSelection label="変更後" competition={competition} value={selection} onChange={setSelection} />}
        {competition && !competition.official && competition.op_fee !== null && <label className="flex min-h-16 items-center gap-3 text-xl"><input className="size-7" type="checkbox" checked={!!selection.isOp} onChange={e=>setSelection(v=>({...v,isOp:e.target.checked}))}/>OP参加</label>}
        <label className="block text-xl font-bold">受付担当者名<input className={field} maxLength={100} value={visitorName} onChange={e=>setVisitorName(e.target.value)}/></label>
        <button className={button} disabled={busy} onClick={confirm}>変更内容と料金を確認</button>
      </>}
    </div>}
    {!session ? <form className="space-y-3 rounded-xl border-2 bg-white p-5" onSubmit={login}><h3 className="text-2xl font-bold">本部ログイン</h3><label className="block text-xl">メールアドレス<input required type="email" autoComplete="username" className={field} value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="block text-xl">パスワード<input required type="password" autoComplete="current-password" className={field} value={password} onChange={e=>setPassword(e.target.value)}/></label><button className={button} disabled={busy}>本部ログイン</button></form> : <button className={button} disabled={busy} onClick={()=>setSession(null)}>本部ログアウト</button>}
    {saved && <div role="status" className="rounded-xl bg-green-100 p-4 text-xl"><p className="font-bold">変更申請を保存しました</p><p className="break-all">受付番号：{saved}</p><p>大会本部の申請一覧から出番表へ反映できます。</p></div>}
    <Link href="/winter/admin" className="inline-flex min-h-14 items-center rounded-xl border-2 p-4 text-xl font-bold">大会本部へ</Link>
  </main>
}

function FeeSelection({ label, competition, value, onChange }: { label: string; competition: Data['competitions'][number]; value: WinterFeeSelection; onChange: (v: WinterFeeSelection) => void }) {
  return <div className="space-y-3">
    {(competition.member_fee !== null || competition.nonmember_fee !== null) && <label className="block text-xl font-bold">{label}の料金区分<select className={field} value={value.membership??''} onChange={e=>onChange({...value,membership:e.target.value==='member'?'member':e.target.value==='nonmember'?'nonmember':undefined})}><option value="">区分を選択</option><option value="member">会員</option><option value="nonmember">非会員</option></select></label>}
    {winterCompetition(competition.competition_no).instructorRequired && <label className="flex min-h-16 items-center gap-3 text-xl"><input className="size-7" type="checkbox" checked={!!value.instructorConfirmed} onChange={e=>onChange({...value,instructorConfirmed:e.target.checked})}/>{label}の地域乗馬指導者資格を確認しました</label>}
  </div>
}
