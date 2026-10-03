"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { useStore } from "@/lib/store"
import { canonicalOrgId } from "@/lib/organization-aliases"
import { calcAddFee, calcChangeFee, calcWithdrawAddFee, calcWithdrawFee, formatYen } from "@/lib/fees"
import { applyReceptionRequest, saveReceptionRequests, verifyAdminSession, type AdminSession } from "@/lib/supabase-rest"
import { registerPostDeadlineMaster } from "@/lib/post-deadline-masters"
import { compareOrganizations } from "@/lib/organization-order"
import { createManualRecord, loadManualRecords, type ManualRecord } from "@/lib/settlement-manual-records"
import { PlayerPicker, HorsePicker } from "@/components/entity-picker"
import { StartList } from "@/components/start-list"
import type { AppRequest, RequestType, StartEntry } from "@/lib/types"

import type { StagedRegistration } from "@/lib/meeting-drafts"

type MeetingInput = { competitionId: string; selectedEntry?: StartEntry; selectedAction?: "change" | "withdraw"; staged: StagedRegistration[]; onStage: (item: StagedRegistration) => void; disabled: boolean }
const stagedStorageKey = "fhs-autumn-post-deadline-staged-v1"

export function OnSiteReception({ session, meeting }: { session: AdminSession; meeting?: MeetingInput }) {
  const { organizations, players, horses, competitions, startEntries, getCompetition, getPlayer, getHorse, getOrg } = useStore()
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
  const pickerDialog = useRef<HTMLDialogElement>(null)
  const pickerScroll = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!picker) return
    const dialog = pickerDialog.current
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    dialog?.showModal()
    return () => { dialog?.close(); document.body.style.overflow = previousOverflow }
  }, [picker])
  const [operatorName, setOperatorName] = useState("")
  const [note, setNote] = useState("")
  const [saving, setSaving] = useState(false)
  const [localStaged, setStaged] = useState<StagedRegistration[]>([])
  const staged = meeting?.staged ?? localStaged
  const [draftReady, setDraftReady] = useState(false)
  useEffect(() => {
    if (meeting) { setDraftReady(true); return }
    try { setStaged(JSON.parse(sessionStorage.getItem(stagedStorageKey) ?? "[]") as StagedRegistration[]) } catch { setStaged([]) }
    setDraftReady(true)
  }, [!!meeting])
  useEffect(() => { if (draftReady && !meeting) sessionStorage.setItem(stagedStorageKey, JSON.stringify(localStaged)) }, [localStaged, draftReady, !!meeting])
  const [commitError, setCommitError] = useState("")
  const [error, setError] = useState("")
  const [newKind, setNewKind] = useState<"rider" | "horse" | null>(null)
  const [newName, setNewName] = useState("")
  const [newOrgId, setNewOrgId] = useState("")
  const [newJef, setNewJef] = useState("")
  const [newJefChecked, setNewJefChecked] = useState(false)
  const [newSaving, setNewSaving] = useState(false)
  const [newError, setNewError] = useState("")
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
  useEffect(() => {
    if (!meeting) return
    setCompetitionId(meeting.competitionId); setEntry(null); setToCompetitionId(""); setPlayerId(""); setHorseId(""); setIsOp(false)
  }, [meeting?.competitionId])
  useEffect(() => {
    if (meeting?.selectedEntry) { setType(meeting.selectedAction ?? "change"); chooseEntry(meeting.selectedEntry) }
  }, [meeting?.selectedEntry, meeting?.selectedAction])
  function selectType(next: RequestType) {
    if (meeting) { setType(next); setError(""); if (next !== "add" && meeting.selectedEntry) chooseEntry(meeting.selectedEntry); else { setEntry(null); setPlayerId(""); setHorseId(""); setIsOp(false) }; return }
    setType(next); setCompetitionId(""); setEntry(null); setToCompetitionId(""); setPlayerId(""); setHorseId(""); setIsOp(false); setOrganizationId(""); setError("")
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (saving || meeting?.disabled) return
    setError("")
    const recordedOperator = meeting ? session.email : operatorName.trim()
    if (!target || !rider || !horse || !selectedOrg || !recordedOperator || (type !== "add" && !entry)) { setError("競技・人馬・所属・担当者を確認してください"); return }
    if (type === "change" && !changedFields.length) { setError("変更する項目を選んでください"); return }
    if (type !== "withdraw" && target.official && (isOp || !rider.jefRegistered || !horse.jefRegistered || !rider.officialId || !horse.officialId)) { setError("公認競技は日馬連登録済みの選手・馬のみ、通常参加で登録できます"); return }
    if (period === "before_event" && type === "add" && startEntries.some(row => !row.withdrawn && row.competitionId === target.id && row.playerId === rider.id && row.horseId === horse.id)) { setError("同じ競技の同じ人馬が既に出番表にあります。二重登録を避けるため確認してください"); return }
    if (period === "before_event" && type === "add" && staged.some(item => item.record.period === "before_event" && item.record.action_type === "add" && item.record.competition_key === target.id && item.record.rider_key === rider.id && item.record.horse_key === horse.id)) { setError("この人馬・競技の追加は確認一覧にあります"); return }
    if (type !== "add" && period === "before_event" && staged.some(item => item.record.period === "before_event" && (item.request.change?.entryId === entry?.id || item.request.withdraw?.entryId === entry?.id))) { setError("この出番への変更・棄権は確認一覧にあります。確認一覧から外して入力し直してください"); return }
    const effectivePaymentPlan = meeting ? "pay_at_venue" : paymentPlan
    const amount = meeting ? 0 : Number(paidAmount)
    if ((!meeting && !/^\d+$/.test(paidAmount)) || !Number.isSafeInteger(amount) || amount > fee.total) { setError("入金済み金額は今回の料金以下で入力してください"); return }
    if (effectivePaymentPlan === "paid_before_event" && amount !== fee.total) { setError("支払い済みを選ぶ場合は今回の料金を全額入金済みにしてください"); return }
    if (effectivePaymentPlan !== "paid_before_event" && amount > 0) { setError("未払いの予定では入金済み金額を0円にしてください"); return }
    const id = crypto.randomUUID()
    const request: AppRequest = {
      id, type, status: "pending", onSiteAdmin: true, postDeadlinePeriod: period, createdAt: new Date().toISOString(),
      orgId: selectedOrg, visitorOrgId: selectedOrg, visitorName: recordedOperator, fee,
      ...(type === "add" ? { add: { competitionId: target.id, playerId: rider.id, horseId: horse.id, organizationId: selectedOrg, officialPlayerId: rider.officialId, officialHorseId: horse.officialId, playerName: rider.name, horseName: horse.name, isOp, note: note.trim() } } : {}),
      ...(type === "change" && entry ? { change: { entryId: entry.id, fromCompetitionId: entry.competitionId, fromPlayerId: entry.playerId, fromHorseId: entry.horseId, toCompetitionId: target.id, toPlayerId: rider.id, toHorseId: horse.id, fromIsOp: !!entry.isOp, toIsOp: isOp, organizationId: selectedOrg, officialPlayerId: rider.officialId, officialHorseId: horse.officialId, toPlayerName: rider.name, toHorseName: horse.name, changedFields, treatedAsWithdrawAdd } } : {}),
      ...(type === "withdraw" && entry ? { withdraw: { entryId: entry.id, competitionId: entry.competitionId, playerId: entry.playerId, horseId: entry.horseId, organizationId: selectedOrg } } : {}),
    }
    const record: StagedRegistration["record"] = {
        id: period === "at_venue" ? id : crypto.randomUUID(), request_id: period === "at_venue" ? null : id,
        period, action_type: type, organization_key: selectedOrg, competition_key: target.id,
        rider_key: rider.id, horse_key: horse.id,
        details: note.trim() || (type === "change" ? `変更前：${fromComp?.name ?? ""} ／ ${getPlayer(entry?.playerId ?? "")?.name ?? ""} ／ ${getHorse(entry?.horseId ?? "")?.name ?? ""}` : ""),
        bill_amount: period === "at_venue" ? fee.total : 0,
        paid_amount: amount, payment_plan: effectivePaymentPlan, operator_name: recordedOperator,
      }
    const item: StagedRegistration = { request, record, label: `${type === "add" ? "追加" : type === "change" ? "変更" : "棄権"} ／ 競技${target.number} ／ ${rider.name} ／ ${horse.name} ／ ${getOrg(selectedOrg)?.name ?? "所属不明"} ／ ${formatYen(fee.total)}${meeting ? "" : ` ／ ${paymentPlan === "paid_before_event" ? "振込済み" : paymentPlan === "pay_after_event" ? "大会後振込" : "当日支払い予定"}`}`, applyOrder: (type === "add" || treatedAsWithdrawAdd) && target.official ? 1 : undefined }
    if (meeting) meeting.onStage(item)
    else setStaged(previous => [...previous, item])
    setEntry(null); if (!meeting) setCompetitionId(""); setToCompetitionId(""); setPlayerId(""); setHorseId(""); setOrganizationId(""); setIsOp(false); setNote(""); setPaidAmount("0"); setPaymentPlan("pay_at_venue")
  }

  async function commitStaged() {
    if (saving || !staged.length || commitError) return
    setSaving(true)
    let completed = 0
    let step = ""
    try {
      const verified = await verifyAdminSession(session)
      for (const item of staged) {
        step = item.label
        if (item.record.period === "before_event") await saveReceptionRequests([item.request], verified.accessToken)
        await createManualRecord(verified, item.record)
        if (item.record.period === "before_event") await applyReceptionRequest(item.request.id, item.applyOrder, verified.accessToken)
        completed++
      }
      const confirmed = await loadManualRecords(verified)
      if (staged.some(item => !confirmed.some(row => row.id === item.record.id))) throw new Error("保存結果を確認できません")
      sessionStorage.removeItem(stagedStorageKey)
      window.location.reload()
    } catch (cause) {
      setCommitError(`${completed}件が完了しました。「${step}」の登録を確認してください。${cause instanceof Error ? cause.message : "登録に失敗しました"}。重複登録を避けるため、再読み込みして申請一覧・精算を確認してください。`)
    } finally { setSaving(false) }
  }

  async function registerMaster(event: FormEvent) {
    event.preventDefault()
    if (!newKind || newSaving || saving) return
    setNewError("")
    const name = newName.trim()
    const org = organizations.find(row => row.id === newOrgId)
    if (!name || !org || (newJef.trim() && !newJefChecked)) { setNewError("名前・所属と日馬連番号の確認状況を入力してください"); return }
    const norm = (value: string) => value.normalize("NFKC").replace(/[\s　]+/g, "").toLocaleLowerCase("ja-JP")
    if ((newKind === "rider" ? players : horses).some(row => canonicalOrgId(row.orgId) === canonicalOrgId(org.id) && norm(row.name) === norm(name))) { setNewError("同じ団体に同名の人馬がいます。既存候補を確認してください"); return }
    setNewSaving(true)
    try {
      await registerPostDeadlineMaster(session, { kind: newKind, name, orgName: org.name, jefNumber: newJef, jefChecked: newJefChecked })
      window.location.reload()
    } catch (cause) { setNewError(cause instanceof Error ? cause.message : "人馬を登録できませんでした") }
    finally { setNewSaving(false) }
  }

  return <div className="space-y-5">
    {!meeting && <div className="rounded-2xl border-2 border-border bg-card p-5"><h2 className="text-2xl font-bold">締切後の追加・変更・棄権を記録</h2><p className="mt-2 text-base text-muted-foreground">大会前の追加・変更・棄権は出番表と精算に反映します。現場受付で直接受けた分は精算だけに記録し、出番表には追加しません。</p></div>}
    {!meeting && <div className="grid grid-cols-2 gap-2"><button type="button" onClick={() => { setPeriod("before_event"); setPaymentPlan("pay_at_venue"); setPaidAmount("0"); setError("") }} className={`min-h-14 rounded-xl border-2 font-bold ${period === "before_event" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>締切後〜大会前</button><button type="button" onClick={() => { setPeriod("at_venue"); setPaymentPlan("pay_at_venue"); setPaidAmount("0"); setError("") }} className={`min-h-14 rounded-xl border-2 font-bold ${period === "at_venue" ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>現場受付（精算のみ）</button></div>}
    <details className="rounded-2xl border-2 border-border bg-card p-4"><summary className="min-h-8 cursor-pointer font-bold">一覧にいない人馬を先に登録</summary><p className="mt-1 text-sm text-muted-foreground">登録後に画面を更新します。追加・変更の候補に表示され、出番を作成すると棄権の対象にも表示されます。</p><div className="mt-3 flex gap-2"><button type="button" onClick={() => { setNewKind("rider"); setNewError("") }} className="min-h-12 rounded-lg border border-primary px-4 font-bold text-primary">新しい選手</button><button type="button" onClick={() => { setNewKind("horse"); setNewError("") }} className="min-h-12 rounded-lg border border-primary px-4 font-bold text-primary">新しい馬</button></div>{newKind && <form onSubmit={registerMaster} className="mt-4 space-y-3 rounded-xl bg-secondary p-4"><h3 className="font-bold">{newKind === "rider" ? "選手" : "馬"}の新規登録</h3><label className="block font-bold">{newKind === "rider" ? "選手名" : "馬名"}<input required maxLength={100} value={newName} onChange={e => setNewName(e.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3" /></label><label className="block font-bold">所属団体<select required value={newOrgId} onChange={e => setNewOrgId(e.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3"><option value="">団体を選択</option>{[...organizations].sort(compareOrganizations).map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label><label className="block font-bold">日馬連登録番号（任意）<input maxLength={40} value={newJef} onChange={e => { setNewJef(e.target.value); setNewJefChecked(false) }} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3" /></label>{newJef.trim() && <label className="flex items-center gap-2 font-semibold"><input type="checkbox" checked={newJefChecked} onChange={e => setNewJefChecked(e.target.checked)} className="size-6" />本部で日馬連登録番号を確認した</label>}{newError && <p role="alert" className="text-destructive">{newError}</p>}<div className="flex gap-2"><button type="submit" disabled={newSaving} className="min-h-12 flex-1 rounded-lg bg-primary px-3 font-bold text-primary-foreground">{newSaving ? "登録中…" : "人馬を登録"}</button><button type="button" onClick={() => setNewKind(null)} className="min-h-12 rounded-lg border px-3">閉じる</button></div></form>}</details>
    <div className="grid grid-cols-3 gap-2">{(["add", "change", "withdraw"] as const).map(value => <button key={value} type="button" onClick={() => selectType(value)} className={`min-h-14 rounded-xl border-2 font-bold ${type === value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card"}`}>{value === "add" ? "追加" : value === "change" ? "変更" : "棄権"}</button>)}</div>
    <form onSubmit={submit} className="space-y-4 rounded-2xl border-2 border-border bg-card p-5">
      <p className="rounded-xl bg-secondary p-3 font-bold">{meeting ? "打ち合わせ会の下書きへ追加します。正式出番表・精算への反映は最終確認後です。" : period === "at_venue" ? "出番表は変更せず、精算だけに記録します。再走行など同じ人馬・競技の追加も記録できます。" : "正式出番表と精算へ反映します。"}</p>
      {!meeting && <label className="block font-bold">{type === "add" ? "追加する競技" : "変更・棄権する元の競技"}<select required value={competitionId} onChange={event => { setCompetitionId(event.target.value); setEntry(null); setPlayerId(""); setHorseId(""); setToCompetitionId("") }} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3"><option value="">競技を選択</option>{competitions.map(comp => <option key={comp.id} value={comp.id}>競技{comp.number} {comp.name}{comp.official ? " ★公認" : ""}</option>)}</select></label>}
      {!meeting && type !== "add" && competitionId && <div><h3 className="mb-2 font-bold">出番表から対象を選択</h3><StartList competitionId={competitionId} hideWithdrawn selectedId={entry?.id} onSelect={chooseEntry} compact />{entry && <p className="mt-2 rounded-lg bg-primary/10 p-3 font-bold">選択：{entry.order}番 {getPlayer(entry.playerId)?.name} ／ {getHorse(entry.horseId)?.name}</p>}</div>}
      {meeting && type !== "add" && !entry && <p className="font-bold text-amber-800">上の打ち合わせ会用出番表で、変更・棄権する行を選んでください。</p>}
      {meeting && entry && type !== "add" && <p className="rounded-lg bg-primary/10 p-3 font-bold">対象：{getPlayer(entry.playerId)?.name} ／ {getHorse(entry.horseId)?.name}</p>}
      {type === "change" && entry && <label className="block font-bold">変更後の競技<select value={toCompetitionId} onChange={event => { setToCompetitionId(event.target.value); if (getCompetition(event.target.value)?.official) setIsOp(false) }} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3">{competitions.map(comp => <option key={comp.id} value={comp.id}>競技{comp.number} {comp.name}</option>)}</select></label>}
      {(type === "add" && competitionId || type === "change" && entry) && <>
        <button type="button" onClick={() => setPicker("player")} className="min-h-14 w-full rounded-xl border-2 border-border p-3 text-left font-bold">選手：{rider?.name ?? "選択してください"}　変更する</button>
        <button type="button" onClick={() => setPicker("horse")} className="min-h-14 w-full rounded-xl border-2 border-border p-3 text-left font-bold">馬：{horse?.name ?? "選択してください"}　変更する</button>
        {picker && <dialog ref={pickerDialog} aria-labelledby="post-deadline-picker-title" onCancel={() => setPicker(null)} className="m-auto h-[90dvh] max-h-[90dvh] w-[calc(100%-1rem)] max-w-3xl overflow-hidden rounded-2xl border-2 border-border bg-background p-0 text-foreground shadow-xl backdrop:bg-black/50">
          <div className="flex h-full flex-col">
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border bg-card p-4">
              <div><h3 id="post-deadline-picker-title" className="text-xl font-bold">{picker === "player" ? "選手を選択" : "馬を選択"}</h3><p className="mt-1 text-sm text-muted-foreground">団体を選ぶ → 人馬を選ぶ</p></div>
              <button type="button" autoFocus onClick={() => setPicker(null)} className="min-h-12 rounded-xl border-2 border-border px-5 font-bold">閉じる</button>
            </div>
            <div ref={pickerScroll} className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {picker === "player" ? <PlayerPicker onNavigate={() => { if (pickerScroll.current) pickerScroll.current.scrollTop = 0 }} registeredOnly={!!target?.official} selectedId={playerId} onSelect={id => { setPlayerId(id); setOrganizationId(""); setPicker(null) }} /> : <HorsePicker onNavigate={() => { if (pickerScroll.current) pickerScroll.current.scrollTop = 0 }} registeredOnly={!!target?.official} selectedId={horseId} onSelect={id => { setHorseId(id); setOrganizationId(""); setPicker(null) }} />}
            </div>
          </div>
        </dialog>}
        {target && !target.official && <label className="flex min-h-12 items-center gap-3 font-bold"><input type="checkbox" checked={isOp} onChange={event => setIsOp(event.target.checked)} className="size-6" />OP参加（正式成績の対象外）</label>}
      </>}
      {crossClub && <label className="block font-bold">エントリーと精算の所属<select required value={selectedOrg} onChange={event => setOrganizationId(event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3"><option value="">所属を選択</option><option value={riderOrg!.id}>{riderOrg!.name}（選手の所属）</option><option value={horseOrg!.id}>{horseOrg!.name}（馬の所属）</option></select></label>}
      {type === "add" && <label className="block font-bold">備考（任意）<input value={note} onChange={event => setNote(event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3" /></label>}
      {!meeting && <label className="block font-bold">今回分の支払い<select value={paymentPlan} onChange={event => { const next = event.target.value as ManualRecord["payment_plan"]; setPaymentPlan(next); setPaidAmount(next === "paid_before_event" ? String(fee.total) : "0") }} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3"><option value="paid_before_event">大会前に振込済み</option><option value="pay_at_venue">大会当日に支払い予定（振込・会場）</option><option value="pay_after_event">大会後に振込予定</option></select></label>}
      {!meeting && paymentPlan === "paid_before_event" && <label className="block font-bold">今回分の入金済み金額（円）<input type="number" min="0" step="1" required value={paidAmount} onChange={event => setPaidAmount(event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3" /></label>}
      {!meeting && <label className="block font-bold">本部で登録した担当者名<input required value={operatorName} onChange={event => setOperatorName(event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3" /></label>}
      {target && rider && horse && <div className="rounded-xl bg-secondary p-4 font-bold">{type === "add" ? "追加" : type === "change" ? "変更" : "棄権"}：{rider.name} ／ {horse.name} ／ {target.name}<br />所属：{getOrg(selectedOrg)?.name ?? "未選択"}　料金：{formatYen(fee.total)}</div>}
      {error && <p role="alert" className="rounded-xl bg-destructive/10 p-3 font-semibold text-destructive">{error}</p>}
      <button type="submit" disabled={saving || meeting?.disabled || !!commitError || !target || !rider || !horse || !selectedOrg || type === "change" && !changedFields.length} className="min-h-14 w-full rounded-xl bg-primary px-4 text-lg font-bold text-primary-foreground disabled:opacity-50">{saving ? "登録中…" : meeting ? "打ち合わせ会用出番表に追加" : "確認一覧に追加"}</button>
    </form>
    {!meeting && staged.length > 0 && <section className="rounded-2xl border-2 border-primary bg-card p-5"><h3 className="text-2xl font-bold">事後登録の確認一覧（{staged.length}件）</h3><p className="mt-2 text-sm">ここではまだ保存されていません。内容と支払い状況を確認し、まとめて登録してください。</p><div className="mt-3 divide-y rounded-xl border">{staged.map((item, index) => <div key={item.request.id} className="flex items-center justify-between gap-3 p-3"><div><p className="font-semibold">{index + 1}. {item.label}</p><p className="text-sm text-muted-foreground">{item.record.period === "before_event" ? "締切後〜大会前・出番表へ反映" : "現場受付・精算のみ"}</p></div><button type="button" disabled={saving || !!commitError} onClick={() => setStaged(previous => previous.filter(row => row.request.id !== item.request.id))} className="min-h-10 shrink-0 rounded-lg border border-destructive px-3 font-bold text-destructive">外す</button></div>)}</div>{commitError && <div role="alert" className="mt-3 rounded-xl bg-destructive/10 p-3 font-semibold text-destructive">{commitError}<button type="button" onClick={() => { sessionStorage.removeItem(stagedStorageKey); window.location.reload() }} className="mt-2 block min-h-10 rounded-lg border px-3">正式DBから再読み込み</button></div>}<button type="button" disabled={saving || !!commitError} onClick={() => void commitStaged()} className="mt-4 min-h-14 w-full rounded-xl bg-primary px-4 text-lg font-bold text-primary-foreground disabled:opacity-50">{saving ? "順番に登録中…" : `${staged.length}件をまとめて登録`}</button></section>}
  </div>
}
