"use client"

import Link from "next/link"
import { useEffect, useState } from "react"
import { loadWinterData } from "@/lib/winter-data"
import { WINTER_EVENT_NAME, winterCompetition, winterEntryPrice, type WinterFeeSelection } from "@/lib/winter-event"
import { WinterAddSavePanel } from "@/components/winter-add-save-panel"
import { WinterQueueLink } from '@/components/winter-queue-link'

type Data = Awaited<ReturnType<typeof loadWinterData>>
const fieldClass = "mt-2 min-h-16 w-full rounded-xl border-2 border-slate-300 bg-white p-3 text-xl"

export function WinterReceptionWorkspace({ mode = "admin" }: { mode?: "admin" | "add" | "withdraw" }) {
  const [data, setData] = useState<Data | null>(null)
  const [error, setError] = useState("")
  const [orgId, setOrgId] = useState("")
  const [competitionId, setCompetitionId] = useState("")
  const [riderId, setRiderId] = useState("")
  const [horseId, setHorseId] = useState("")
  const [selection, setSelection] = useState<WinterFeeSelection>({})
  const [reload, setReload] = useState(0)
  useEffect(() => { setOrgId(new URLSearchParams(window.location.search).get("org") ?? "") }, [])

  useEffect(() => {
    const controller = new AbortController()
    setError("")
    loadWinterData(controller.signal).then(value => { if (!controller.signal.aborted) setData(value) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : "読み込めませんでした") })
    return () => controller.abort()
  }, [reload])

  const competition = data?.competitions.find(row => row.id === competitionId)
  let fee: number | null = null, feeMessage = "競技を選択してください"
  if (competition) {
    try {
      const source = winterCompetition(competition.competition_no)
      fee = winterEntryPrice({ ...source, fee: competition.fee, opFee: competition.op_fee, memberFee: competition.member_fee, nonmemberFee: competition.nonmember_fee, official: competition.official }, selection)
      feeMessage = ""
    } catch (reason) { feeMessage = reason instanceof Error ? reason.message : "料金を確認してください" }
  }
  const instructorRequired = competition ? winterCompetition(competition.competition_no).instructorRequired : false
  const canUseOp = !!competition && !competition.official && competition.op_fee !== null
  const riders = data?.riders.filter(row => row.organization_id === orgId) ?? []
  const horses = data?.horses.filter(row => row.organization_id === orgId) ?? []
  const sortedCompetitions = [...(data?.competitions ?? [])].sort((a, b) => a.competition_date.localeCompare(b.competition_date) ||
    (['①','②','③','④'].includes(a.competition_no) ? ['①','②','③','④'].indexOf(a.competition_no) - ['①','②','③','④'].indexOf(b.competition_no) : Number(a.competition_no) - Number(b.competition_no)))

  return <main className="mx-auto min-h-dvh max-w-3xl space-y-6 bg-slate-50 p-5 text-slate-900">
    <h1 className="text-3xl font-bold">{WINTER_EVENT_NAME}</h1>
    <Link href="/winter" className="inline-flex min-h-14 items-center rounded-xl border-2 px-5 text-xl font-bold">受付トップに戻る</Link>
    {mode !== 'admin' && <WinterQueueLink />}
    <div className="rounded-xl bg-blue-100 p-4 text-3xl font-bold">{mode === "admin" ? "大会本部" : mode === "add" ? "追加受付" : "棄権受付"}</div>
    {mode === 'admin' && <Link href="/winter/prepare" className="inline-flex min-h-16 items-center rounded-xl border-2 border-blue-800 bg-white px-5 text-xl font-bold">締切前の準備：名簿・出番表・事前精算を確認</Link>}
    <p className="text-lg">{mode === "admin" ? "団体・人馬の登録、申請確認、出番表への反映を行います。" : "現在は操作テスト版のため、保存には本部アカウントのログインが必要です。"}</p>
    {error ? <div role="alert" className="rounded-xl bg-red-100 p-4 text-xl">{error}<button className={fieldClass} onClick={() => setReload(value => value + 1)}>再読み込み</button></div> : !data ? <p role="status" className="text-xl">Winterのデータを読み込んでいます…</p> : <>
      <p className="text-lg">競技 {data.competitions.length}件 ／ 団体 {data.organizations.length}件 ／ 選手 {data.riders.length}名 ／ 馬 {data.horses.length}頭</p>
      {!data.organizations.length && <p className="rounded-xl bg-blue-100 p-4 text-xl">Winterの団体・人馬は未登録です。{mode === 'admin' ? '画面下部の本部ログイン後に団体・人馬を登録できます。' : <Link className="underline font-bold" href="/winter/admin">「大会本部」でログインして団体・人馬を登録してください。</Link>}</p>}
      <label className="block text-xl font-bold">団体<select className={fieldClass} value={orgId} onChange={e => { setOrgId(e.target.value); setRiderId(""); setHorseId("") }}><option value="">団体を選択</option>{data.organizations.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      {mode !== "withdraw" && <>
      <label className="block text-xl font-bold">競技<select className={fieldClass} value={competitionId} onChange={e => { setCompetitionId(e.target.value); setSelection({}) }}><option value="">競技を選択</option>{sortedCompetitions.map(row => <option key={row.id} value={row.id}>{new Date(`${row.competition_date}T00:00:00+09:00`).toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", weekday: "short" })}　第{row.competition_no}競技 {row.name}</option>)}</select></label>
      <label className="block text-xl font-bold">選手<select className={fieldClass} value={riderId} onChange={e => setRiderId(e.target.value)}><option value="">選手を選択</option>{riders.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      <label className="block text-xl font-bold">馬<select className={fieldClass} value={horseId} onChange={e => setHorseId(e.target.value)}><option value="">馬を選択</option>{horses.map(row => <option key={row.id} value={row.id}>{row.name}</option>)}</select></label>
      {competition && (competition.member_fee !== null || competition.nonmember_fee !== null) && <label className="block text-xl font-bold">料金区分<select className={fieldClass} value={selection.membership ?? ""} onChange={e => setSelection(value => ({ ...value, membership: e.target.value === "member" ? "member" : e.target.value === "nonmember" ? "nonmember" : undefined }))}><option value="">区分を選択してください</option><option value="member">会員</option><option value="nonmember">非会員</option></select></label>}
      {instructorRequired && <label className="flex min-h-16 items-center gap-4 text-xl"><input type="checkbox" className="size-7" checked={!!selection.instructorConfirmed} onChange={e => setSelection(value => ({ ...value, instructorConfirmed: e.target.checked }))} />地域乗馬指導者資格を確認しました</label>}
      {canUseOp && <label className="flex min-h-16 items-center gap-4 text-xl"><input type="checkbox" className="size-7" checked={!!selection.isOp} onChange={e => setSelection(value => ({ ...value, isOp: e.target.checked }))} />OP参加</label>}
      <div role="status" className="rounded-xl bg-white p-5 text-2xl font-bold">{fee === null ? feeMessage : `競技エントリー料　¥${fee.toLocaleString('ja-JP')}`}<p className="mt-3 text-base font-normal">追加申請は、この料金に追加手数料3,000円を加算します。内容確認画面で合計をご確認ください。</p></div>
      </>}
      <WinterAddSavePanel mode={mode} data={data} organizations={data.organizations} onRegistered={() => setReload(value => value + 1)} organization={data.organizations.find(row => row.id === orgId)} competition={competition} rider={data.riders.find(row => row.id === riderId)} horse={data.horses.find(row => row.id === horseId)} selection={selection} />
    </>}
  </main>
}
