"use client"

import { useState, type FormEvent } from "react"
import { useStore } from "@/lib/store"
import { canonicalOrgId } from "@/lib/organization-aliases"
import { calcAddFee, calcChangeFee, calcWithdrawAddFee, calcWithdrawFee, formatYen } from "@/lib/fees"
import { applyReceptionRequest, saveReceptionRequests, verifyAdminSession, type AdminSession } from "@/lib/supabase-rest"
import { createManualRecord, loadManualRecords, type ManualRecord } from "@/lib/settlement-manual-records"
import { PlayerPicker, HorsePicker } from "@/components/entity-picker"
import { StartList } from "@/components/start-list"
import type { AppRequest, RequestType, StartEntry } from "@/lib/types"

export function OnSiteReception({ session }: { session: AdminSession }) {
  const { competitions, startEntries, getCompetition, getPlayer, getHorse, getOrg } = useStore()
  const [type, setType] = useState<RequestType>("add")
  const [period, setPeriod] = useState<ManualRecord["period"]>("before_event")
  const [paymentPlan, setPaymentPlan] = useState<ManualRecord["payment_plan"]>("pay_at_venue")
  const [paidAmount, setPaidAmount] = useState("0")
  const [competitionId, setCompetitionId] = useState("")
  const [entry, setEntry] = useState<StartEntry | null>(null)
  const [toCompetitionId, setToCompetitionId] = useState("")
  const [playerId, setPlayerId] = useState("")
  const [horseId, setHorseId] = useState("")
  const [isOp, setIsOp] = useState(false)
  const [organizationId, setOrganizationId] = useState("")
  const [picker, setPicker] = useState<"player" | "horse" | null>(null)
  const [operatorName, setOperatorName] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [savedId, setSavedId] = useState<string | null>(null)
  const [error, setError] = useState("")
  const target = getCompetition(type === "change" ? toCompetitionId : competitionId)
  const rider = getPlayer(type === "withdraw" ? entry?.playerId ?? "" : playerId)
  const horse = getHorse(type === "withdraw" ? entry?.horseId ?? "" : horseId)
  const riderOrg = rider ? getOrg(canonicalOrgId(rider.orgId)) : undefined
  const horseOrg = horse ? getOrg(canonicalOrgId(horse.orgId)) : undefined
  const crossClub = !!riderOrg && !!horseOrg && riderOrg.id !== horseOrg.id
  const selectedOrg = crossClub ? organizationId : riderOrg?.id ?? entry?.organizationId ?? ""
  const fromComp = entry ? getCompetition(entry.competitionId) : undefined
  const changedFields: Array<"competition" | "player" | "horse" | "op"> = []
  if (type === "change" && entry) {
    if (toCompetitionId !== entry.competitionId) changedFields.push("competition")
    if (playerId !== entry.playerId) changedFields.push("player")
    if (horseId !== entry.horseId) changedFields.push("horse")
    if (isOp !== !!entry.isOp) changedFields.push("op")
  }
  const treatedAsWithdrawAdd = changedFields.filter(field => field !== "op").length >= 2
  const fee = type === "add" && target ? calcAddFee(target, isOp)
    : type === "change" && fromComp && target ? treatedAsWithdrawAdd ? calcWithdrawAddFee(target, isOp) : calcChangeFee(fromComp, target, !!entry?.isOp, isOp)
      : calcWithdrawFee()

  function chooseEntry(next: StartEntry) {
    setEntry(next)
    setPlayerId(next.playerId)
    setHorseId(next.horseId)
    setToCompetitionId(next.competitionId)
    setIsOp(!!next.isOp)
    setOrganizationId(next.organizationId ?? "")
  }
  function selectType(next: RequestType) {
    setType(next); setCompetitionId(""); setEntry(null); setToCompetitionId(""); setPlayerId(""); setHorseId(""); setIsOp(false); setOrganizationId(""); setError("")
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving || savedId) return
    setError("")
    if (!target || !rider || !horse || !selectedOrg || !operatorName.trim() || (type !== "add" && !entry)) { setError("競技・人馬・所属・担当者を確認してください"); return }
    if (type === "change" && !changedFields.length) { setError("変更する項目を選んでください"); return }
    if (target.official && (isOp || !rider.jefRegistered || !horse.jefRegistered || !rider.officialId || !horse.officialId)) { setError("公認競技は日馬連登録済みの選手・馬のみ、通常参加で登録できます"); return }
    if (period === "before_event" && type === "add" && startEntries.some(row => !row.withdrawn && row.competitionId === target.id && row.playerId === rider.id && row.horseId === horse.id)) { setError("同じ競技の同じ人馬が既に出番表にあります。二重登録を避けるため確認してください"); return }
    const amount = Number(paidAmount)
    if (!/^\d+$/.test(paidAmount) || !Number.isSafeInteger(amount) || amount > fee.total) { setError("入金済み金額は今回の料金以下で入力してください"); return }
    if (paymentPlan === "paid_before_event" && amount !== fee.total) { setError("支払い済みを選ぶ場合は今回の料金を全額入金済みにしてください"); return }
    if (paymentPlan !== "paid_before_event" && amount > 0) { setError("未払いの予定では入金済み金額を0円にしてください"); return }
    const id = crypto.randomUUID()
    const request: AppRequest = {
      id, type, status: "pending", onSiteAdmin: true, postDeadlinePeriod: period, createdAt: new Date().toISOString(),
      orgId: selectedOrg, visitorOrgId: selectedOrg, visitorName: operatorName.trim(), fee,
      ...(type === "add" ? { add: { competitionId: target.id, playerId: rider.id, horseId: horse.id, organizationId: selectedOrg, officialPlayerId: rider.officialId, officialHorseId: horse.officialId, isOp, note: note.trim() } } : {}),
      ...(type === "change" && entry ? { change: { entryId: entry.id, fromCompetitionId: entry.competitionId, fromPlayerId: entry.playerId, fromHorseId: entry.horseId, toCompetitionId: target.id, toPlayerId: rider.id, toHorseId: horse.id, fromIsOp: !!entry.isOp, toIsOp: isOp, organizationId: selectedOrg, officialPlayerId: rider.officialId, officialHorseId: horse.officialId, changedFields, treatedAsWithdrawAdd } } : {}),
      ...(type === "withdraw" && entry ? { withdraw: { entryId: entry.id, competitionId: entry.competitionId, playerId: entry.playerId, horseId: entry.horseId, organizationId: selectedOrg } } : {}),
    }
    setSaving(true)
    try {
      const verified = await verifyAdminSession(session)
      const record = {
        id: period === "at_venue" ? id : crypto.randomUUID(), request_id: period === "at_venue" ? null : id,
        period, action_type: type, organization_key: selectedOrg, competition_key: target.id,
        rider_key: rider.id, horse_key: horse.id,
        details: note.trim() || (type === "change" ? `変更前：${fromComp?.name ?? ""} ／ ${getPlayer(entry?.playerId ?? "")?.name ?? ""} ／ ${getHorse(entry?.horseId ?? "")?.name ?? ""}` : ""),
        bill_amount: period === "at_venue" ? fee.total : 0,
        paid_amount: amount, payment_plan: paymentPlan, operator_name: operatorName.trim(),
      }
      if (period === "at_venue") {
        await createManualRecord(verified, record)
        const confirmed = await loadManualRecords(verified)
        if (!confirmed.some(row => row.id === id)) throw new Error("保存結果を確認できません。精算画面を再読み込みしてください")
        setSavedId(id)
        setError("")
      } else {
        await saveReceptionRequests([request], verified.accessToken)
        setSavedId(id)
        try {
          await createManualRecord(verified, record)
          await applyReceptionRequest(id, type === "add" && target.official ? 1 : undefined, verified.accessToken)
          window.location.reload()
        } catch (cause) {
          setError(`申請は保存されましたが、精算情報または出番表への反映が未完了です。申請一覧を確認してください。${cause instanceof Error ? ` ${cause.message}` : ""}`)
        }
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "登録できませんでした") }
    finally { setSaving(false) }
  }

  return <div className="space-y-5">
    <div className="rounded-2xl border-2 border-border bg-card p-5"><h2 className="text-2xl font-bold">締切後の追加・変更・棄権を記録</h2><p className="mt-2 text-base text-muted-foreground">大会前の追加・変更・棄権は出番表と精算に反映します。当日会場で直接受けた分は精算だけに記録し、出番表には追加しません。</p></div>
    <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setPeriod("before_event"); setPaymentPlan("pay_at_venue"); setPaidAmount("0"); setSavedId(null); setError("") }} className={`min-h-14 rounded-xl border-2 font-bold ${period === "before_event" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>締切後〜大会前</button><button type="button" onClick={() => { setPeriod("at_venue"); setPaymentPlan("pay_at_venue"); setPaidAmount("0"); setSavedId(null); setError("") }} className={`min-h-14 rounded-xl border-2 font-bold ${period === "at_venue" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>当日会場（精算のみ）</button></div>
    <div className="grid grid-cols-3 gap-2">{(["add", "change", "withdraw"] as const).map(value => <button key={value} type="button" onClick={() => selectType(value)} className={`min-h-14 rounded-xl border-2 font-bold ${type === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{value === "add" ? "追加" : value === "change" ? "変更" : "棄権"}</button>)}</div>
    <form onSubmit={submit} className="space-y-4 rounded-2xl border-2 border-border bg-card p-5">
      <p className="rounded-xl bg-secondary p-3 font-bold">{period === "at_venue" ? "出番表は変更せず、精算だけに記録します。再走行など同じ人馬・競技の追加も記録できます。" : "正式出番表と精算へ反映します。"}</p>
      <label className="block font-bold">{type === "add" ? "追加する競技" : "変更・棄権する元の競技"}<select required value={competitionId} onChange={event => { setCompetitionId(event.target.value); setEntry(null); setPlayerId(""); setHorseId(""); setToCompetitionId("") }} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3"><option value="">競技を選択</option>{competitions.map(comp => <option key={comp.id} value={comp.id}>競技{comp.number} {comp.name}{comp.official ? " ★公認" : ""}</option>)}</select></label>
      {type !== "add" && competitionId && <div><h3 className="mb-2 font-bold">出番表から対象を選択</h3><StartList competitionId={competitionId} hideWithdrawn selectedId={entry?.id} onSelect={chooseEntry} compact />{entry && <p className="mt-2 rounded-lg bg-primary/10 p-3 font-bold">選択：{entry.order}番 {getPlayer(entry.playerId)?.name} ／ {getHorse(entry.horseId)?.name}</p>}</div>}
      {type === "change" && entry && <label className="block font-bold">変更後の競技<select value={toCompetitionId} onChange={event => { setToCompetitionId(event.target.value); if (getCompetition(event.target.value)?.official) setIsOp(false) }} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3">{competitions.map(comp => <option key={comp.id} value={comp.id}>競技{comp.number} {comp.name}</option>)}</select></label>}
      {(type === "add" && competitionId || type === "change" && entry) && <>
        <button type="button" onClick={() => setPicker("player")} className="min-h-14 w-full rounded-xl border-2 border-border p-3 text-left font-bold">選手：{rider?.name ?? "選択してください"}　変更する</button>
        <button type="button" onClick={() => setPicker("horse")} className="min-h-14 w-full rounded-xl border-2 border-border p-3 text-left font-bold">馬：{horse?.name ?? "選択してください"}　変更する</button>
        {picker && <div className="rounded-xl border border-border p-3"><button type="button" onClick={() => setPicker(null)} className="mb-3 min-h-12 rounded-lg border px-4 font-bold">← 戻る</button>{picker === "player" ? <PlayerPicker registeredOnly={!!target?.official} selectedId={playerId} onSelect={id => { setPlayerId(id); setOrganizationId(""); setPicker(null) }} /> : <HorsePicker registeredOnly={!!target?.official} selectedId={horseId} onSelect={id => { setHorseId(id); setOrganizationId(""); setPicker(null) }} />}</div>}
        {target && !target.official && <label className="flex min-h-12 items-center gap-3 font-bold"><input type="checkbox" checked={isOp} onChange={event => setIsOp(event.target.checked)} className="size-6" />OP参加（正式成績の対象外）</label>}
      </>}
      {crossClub && <label className="block font-bold">エントリーと精算の所属<select required value={selectedOrg} onChange={event => setOrganizationId(event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3"><option value="">所属を選択</option><option value={riderOrg!.id}>{riderOrg!.name}（選手の所属）</option><option value={horseOrg!.id}>{horseOrg!.name}（馬の所属）</option></select></label>}
      {type === "add" && <label className="block font-bold">備考（任意）<input value={note} onChange={event => setNote(event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3" /></label>}
      <label className="block font-bold">今回分の支払い<select value={paymentPlan} onChange={event => { const next = event.target.value as ManualRecord["payment_plan"]; setPaymentPlan(next); setPaidAmount(next === "paid_before_event" ? String(fee.total) : "0") }} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3"><option value="paid_before_event">大会前に振込済み</option><option value="pay_at_venue">大会当日に支払い予定（振込・会場）</option><option value="pay_after_event">大会後に振込予定</option></select></label>
      {paymentPlan === "paid_before_event" && <label className="block font-bold">今回分の入金済み金額（円）<input type="number" min="0" step="1" required value={paidAmount} onChange={event => setPaidAmount(event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3" /></label>}
      <label className="block font-bold">本部で登録した担当者名<input required value={operatorName} onChange={event => setOperatorName(event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3" /></label>
      {target && rider && horse && <div className="rounded-xl bg-secondary p-4 font-bold">{type === "add" ? "追加" : type === "change" ? "変更" : "棄権"}：{rider.name} ／ {horse.name} ／ {target.name}<br />所属：{getOrg(selectedOrg)?.name ?? "未選択"}　料金：{formatYen(fee.total)}</div>}
      {savedId && period === "at_venue" && <p role="status" className="rounded-xl bg-primary/10 p-3 font-bold">精算へ記録しました。出番表は変更していません。</p>}
      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 font-semibold text-destructive">{error}</p>}
      <button type="submit" disabled={saving || !!savedId || !target || !rider || !horse || !selectedOrg || type === "change" && !changedFields.length} className="min-h-14 w-full rounded-xl bg-primary px-4 text-lg font-bold text-primary-foreground disabled:opacity-50">{saving ? "保存中…" : savedId ? period === "at_venue" ? "精算へ記録済み" : "申請一覧を確認してください" : period === "at_venue" ? "精算のみに記録" : "出番表と精算へ反映"}</button>
    </form>
  </div>
}
