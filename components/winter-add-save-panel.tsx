"use client"

import { useState, useRef, type FormEvent } from "react"
import { signInAdmin, verifyAdminSession, type AdminSession } from "@/lib/supabase-rest"
import { reviewWinterAdd, submitWinterAdd, type WinterAddInput } from "@/lib/winter-reception"
import { WinterMasterRegistration } from "@/components/winter-master-registration"
import { loadWinterData, type WinterOrganizationRow } from "@/lib/winter-data"
import { WinterRequestPanel } from "@/components/winter-request-panel"

type Props = Partial<Pick<WinterAddInput, "organization" | "competition" | "rider" | "horse">> & Pick<WinterAddInput, "selection"> & { organizations: WinterOrganizationRow[]; data: Awaited<ReturnType<typeof loadWinterData>>; onRegistered: () => void }
const inputClass = "mt-2 min-h-16 w-full rounded-xl border-2 border-slate-300 p-3 text-xl"
const buttonClass = "min-h-16 w-full rounded-xl bg-blue-800 p-4 text-2xl font-bold text-white disabled:opacity-50"

export function WinterAddSavePanel(props: Props) {
  const [session, setSession] = useState<AdminSession | null>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [visitorName, setVisitorName] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  const lock = useRef(false)
  const [review, setReview] = useState<WinterAddInput | null>(null)
  const [savedId, setSavedId] = useState("")

  async function login(e: FormEvent) {
    e.preventDefault(); if (lock.current) return
    lock.current = true; setBusy(true); setError("")
    try { setSession(await signInAdmin(email, password)); setPassword("") }
    catch (reason) { setError(reason instanceof Error ? reason.message : "ログインできません") }
    finally { lock.current = false; setBusy(false) }
  }

  function confirm() {
    setError(""); setSavedId("")
    try {
      const { organization, competition, rider, horse, selection } = props
      if (!organization || !competition || !rider || !horse) throw new Error("団体・競技・選手・馬を選択してください")
      const input = { id: crypto.randomUUID(), organization, competition, rider, horse, visitorName, selection: { ...selection } }
      reviewWinterAdd(input); setReview(input)
    } catch (reason) { setError(reason instanceof Error ? reason.message : "入力を確認してください") }
  }

  async function save() {
    if (!review || !session || lock.current) return
    lock.current = true; setBusy(true); setError("")
    try {
      const verified = await verifyAdminSession(session); setSession(verified)
      setSavedId(await submitWinterAdd(review, verified.accessToken)); setReview(null); props.onRegistered()
    } catch (reason) { setError(reason instanceof Error ? reason.message : "保存できませんでした。同じ内容で再試行できます") }
    finally { lock.current = false; setBusy(false) }
  }

  return <section className="space-y-4 rounded-xl border-2 border-blue-200 bg-white p-5">
    <h2 className="text-2xl font-bold">追加申請の保存テスト</h2>
    {session && !review && <WinterMasterRegistration session={session} organizations={props.organizations} onRegistered={props.onRegistered} />}
    {!session ? <form onSubmit={login} className="space-y-3">
      <p className="text-lg">準備段階の保存テストには本部ログインが必要です。</p>
      <label className="block text-xl">メールアドレス<input required type="email" autoComplete="username" className={inputClass} value={email} onChange={e => setEmail(e.target.value)} /></label>
      <label className="block text-xl">パスワード<input required type="password" autoComplete="current-password" className={inputClass} value={password} onChange={e => setPassword(e.target.value)} /></label>
      <button disabled={busy} className={buttonClass}>{busy ? "確認中…" : "本部ログイン"}</button>
    </form> : review ? <div className="space-y-4">
      <h3 className="text-2xl font-bold">この内容で保存します</h3>
      <p className="text-xl">{review.organization.name}<br />第{review.competition.competition_no}競技 {review.competition.name}<br />{review.rider.name} ／ {review.horse.name}{review.selection.isOp ? '（OP）' : ''}</p>
      <p className="text-xl">確認者：{review.visitorName}<br />合計：¥{reviewWinterAdd(review).total.toLocaleString('ja-JP')}（追加手数料込み）</p>
      {review.selection.membership && <p className="text-xl">料金区分：{review.selection.membership === 'member' ? '会員' : '非会員'}</p>}
      <p>上の選択を変更した場合は「入力に戻る」を押して確認し直してください。</p>
      <button disabled={busy} onClick={save} className={buttonClass}>{busy ? "保存中…" : "追加申請を保存"}</button>
      <button disabled={busy} onClick={() => setReview(null)} className="min-h-16 w-full rounded-xl border-2 p-4 text-xl">入力に戻る</button>
    </div> : <div className="space-y-4">
      <label className="block text-xl">受付担当者名<input className={inputClass} maxLength={100} value={visitorName} onChange={e => setVisitorName(e.target.value)} /></label>
      <button onClick={confirm} disabled={busy || !props.organization || !props.competition || !props.rider || !props.horse} className={buttonClass}>内容を確認</button>
      <button disabled={busy} onClick={() => setSession(null)} className="min-h-12 rounded-lg border p-3 text-lg">本部ログアウト</button>
    </div>}
    {session && !review && <WinterRequestPanel session={session} onSession={setSession} data={props.data} refresh={props.data.entries.length + props.data.organizations.length + (savedId ? 1 : 0)} onChanged={props.onRegistered} />}
    {error && <p role="alert" className="rounded-xl bg-red-100 p-4 text-xl">{error}</p>}
    {savedId && <div role="status" className="rounded-xl bg-green-100 p-4 text-xl"><p className="font-bold">追加申請を保存しました</p><p className="break-all">受付番号：{savedId}</p><p>下の申請一覧で「出番表へ反映」を押してください。</p></div>}
  </section>
}
