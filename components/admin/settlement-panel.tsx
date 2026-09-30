"use client"

import { useEffect, useState, type FormEvent } from "react"
import { useStore } from "@/lib/store"
import { calcSettlement } from "@/lib/settlement"
import { formatYen } from "@/lib/fees"
import { startEntries as originalEntries } from "@/lib/mock-data"
import { players as sourcePlayers } from "@/lib/autumn-data"
import type { AppRequest } from "@/lib/types"
import { compareOrganizations } from "@/lib/organization-order"
import { feeOverrideKey, loadFeeOverrides, loadPrepayments, saveFeeOverride, savePrepayment, type FeeOverride, type Prepayment } from "@/lib/settlement-fee-overrides"
import type { AdminSession } from "@/lib/supabase-rest"
import { loadManualRecords, type ManualRecord } from "@/lib/settlement-manual-records"
import { loadPaymentInstructions, savePaymentInstruction, type PaymentInstruction } from "@/lib/settlement-payment-instructions"
import { loadSettlementReceipts, type SettlementReceipt } from '@/lib/settlement-receipts'
import { SettlementDocuments } from './settlement-documents'
import type { SettlementDocument, SettlementDocumentLine } from '@/lib/settlement-document'

// Autumn原本の同一団体として確認済みの別表記。精算表示だけ集約し、元の人馬IDは維持する。
const confirmedOrgAliases: Record<string, string> = {
  "org-2": "org-4",   // Horse'sNewStage → Horses' New Stage
  "org-6": "org-8",   // RIDING TEAM REGROUP → riding team Regroup
  "org-23": "org-17", // 乗馬クラブリバーサイドステーブル浜北 → 乗馬クラブ リバーサイドステーブル浜北
  "org-24": "org-25", // 八王子乗馬俱楽部 → 八王子乗馬倶楽部
}
const settlementOrgId = (id: string) => confirmedOrgAliases[id] ?? id

export function SettlementPanel({ session }: { session: AdminSession }) {
  const { organizations, players, horses, competitions, startEntries, requests } = useStore()
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const [feeOverrides, setFeeOverrides] = useState<FeeOverride[]>([])
  const [prepayments, setPrepayments] = useState<Prepayment[]>([])
  const [receipts, setReceipts] = useState<SettlementReceipt[]>([])
  const [manualRecords, setManualRecords] = useState<ManualRecord[]>([])
  const [paymentInstructions, setPaymentInstructions] = useState<PaymentInstruction[]>([])
  const [instructionDraft, setInstructionDraft] = useState<{ orgId: string; method: PaymentInstruction["payment_method"] | ""; bankDetails: string } | null>(null)
  const [instructionSaving, setInstructionSaving] = useState(false)
  const [instructionError, setInstructionError] = useState("")
  const [paymentEditing, setPaymentEditing] = useState(false)
  const [paymentAmount, setPaymentAmount] = useState("")
  const [paymentNote, setPaymentNote] = useState("")
  const [loading, setLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState<{ type: "normal" | "add"; id: string; original: number } | null>(null)
  const [amount, setAmount] = useState("")
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)
  useEffect(() => {
    let active = true
    Promise.all([loadFeeOverrides(session), loadPrepayments(session), loadManualRecords(session), loadPaymentInstructions(session), loadSettlementReceipts(session)]).then(([rows, payments, manual, instructions, receiptRows]) => { if (active) { setFeeOverrides(rows); setPrepayments(payments); setManualRecords(manual); setPaymentInstructions(instructions); setReceipts(receiptRows); setError(""); setLoadFailed(false) } })
      .catch(err => { if (active) { setLoadFailed(true); setError(err instanceof Error ? err.message : "料金修正の読み込みに失敗しました") } })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [session])
  const overrideFor = (type: "normal" | "add", id: string) => feeOverrides.find(row => feeOverrideKey(row.source_type, row.source_id) === feeOverrideKey(type, id))
  function startEditing(type: "normal" | "add", id: string, original: number) {
    const existing = overrideFor(type, id)
    setEditing({ type, id, original })
    setAmount(String(existing?.corrected_fee ?? original))
    setReason(existing?.reason ?? "")
    setError("")
  }
  async function submitCorrection(event: FormEvent) {
    event.preventDefault()
    if (!editing || saving) return
    const correctedFee = Number(amount)
    if (!/^\d+$/.test(amount) || !Number.isSafeInteger(correctedFee) || !reason.trim()) { setError("0円以上の整数と修正理由を入力してください"); return }
    setSaving(true)
    setError("")
    try {
      await saveFeeOverride(session, { type: editing.type, id: editing.id, originalFee: editing.original, correctedFee, reason })
      const confirmed = await loadFeeOverrides(session)
      if (!confirmed.some(row => row.source_type === editing.type && row.source_id === editing.id && row.corrected_fee === correctedFee)) throw new Error("保存結果を確認できません。画面を再読み込みしてください")
      setFeeOverrides(confirmed)
      setEditing(null)
    } catch (err) { setError(err instanceof Error ? err.message : "料金修正を保存できませんでした") }
    finally { setSaving(false) }
  }
  async function submitPrepayment(event: FormEvent) {
    event.preventDefault()
    if (!selectedOrgId || saving) return
    if (!/^\d+$/.test(paymentAmount)) { setError("入金済み金額を0円以上で入力してください"); return }
    const paid = Number(paymentAmount)
    setSaving(true); setError("")
    try {
      await savePrepayment(session, selectedOrgId, paid, paymentNote)
      const confirmed = await loadPrepayments(session)
      if (!confirmed.some(row => row.organization_key === selectedOrgId && row.paid_amount === paid)) throw new Error("保存結果を確認できません。再読み込みしてください")
      setPrepayments(confirmed)
      setPaymentEditing(false)
    } catch (err) { setError(err instanceof Error ? err.message : "事前支払いの保存に失敗しました") }
    finally { setSaving(false) }
  }
  async function submitPaymentInstruction(event: FormEvent) {
    event.preventDefault()
    if (!selectedOrgId || !instructionDraft || instructionDraft.orgId !== selectedOrgId || instructionSaving) return
    if (!instructionDraft.method || (instructionDraft.method === "bank_transfer" && !instructionDraft.bankDetails.trim())) {
      setInstructionError("支払方法と振込先を入力してください"); return
    }
    setInstructionSaving(true); setInstructionError("")
    try {
      await savePaymentInstruction(session, selectedOrgId, instructionDraft.method, instructionDraft.bankDetails)
      const confirmed = await loadPaymentInstructions(session)
      if (!confirmed.some(row => row.organization_key === selectedOrgId && row.payment_method === instructionDraft.method && row.bank_details === instructionDraft.bankDetails.trim())) throw new Error("保存結果を確認できません。再読み込みしてください")
      setPaymentInstructions(confirmed)
      setInstructionDraft(null)
    } catch (err) { setInstructionError(err instanceof Error ? err.message : "支払案内を保存できませんでした") }
    finally { setInstructionSaving(false) }
  }

  const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  const entryExists = (id: string) => startEntries.some((e) => e.id === id) || originalEntries.some((e) => e.id === id) || isUuid(id)
  const isResolvableRequest = (request: AppRequest) => {
    if (request.status !== "reflected") return false
    const orgExists = organizations.some((org) => org.id === request.orgId)
    if (!orgExists) return false
    if (request.add) {
      // Legacy requests can say "reflected" without ever creating an official
      // entry. Do not charge for an addition that cannot be linked to the
      // current official start list.
      return !!request.officialEntryId && startEntries.some((entry) => entry.id === request.officialEntryId)
        && competitions.some((c) => c.id === request.add!.competitionId) && players.some((p) => p.id === request.add!.playerId) && horses.some((h) => h.id === request.add!.horseId)
    }
    if (request.withdraw) {
      return entryExists(request.withdraw.entryId) && competitions.some((c) => c.id === request.withdraw!.competitionId) && horses.some((h) => h.id === request.withdraw!.horseId)
    }
    if (request.change) {
      return entryExists(request.change.entryId) && competitions.some((c) => c.id === request.change!.fromCompetitionId) && competitions.some((c) => c.id === request.change!.toCompetitionId) && horses.some((h) => h.id === request.change!.fromHorseId) && horses.some((h) => h.id === request.change!.toHorseId)
    }
    return false
  }

  const settlementRequests = requests.filter(isResolvableRequest)
  const excludedLegacyCount = requests.filter((request) => request.status === "reflected" && !isResolvableRequest(request)).length
  const rows = calcSettlement({
    organizations: organizations.filter((org) => !confirmedOrgAliases[org.id]),
    seedEntries: originalEntries,
    horses: horses.map((horse) => ({ ...horse, orgId: settlementOrgId(horse.orgId) })),
    competitions,
    requests: settlementRequests.map((request) => ({ ...request, orgId: settlementOrgId(request.orgId) })),
    payments: [],
    feeOverrides,
    manualRecords: manualRecords.map(record => ({ ...record, organization_key: settlementOrgId(record.organization_key) })),
  }).sort((a, b) => compareOrganizations(
    organizations.find(org => org.id === a.orgId) ?? { id: a.orgId, name: a.orgName },
    organizations.find(org => org.id === b.orgId) ?? { id: b.orgId, name: b.orgName },
  ))
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0)
  const receptionTotal = rows.reduce((sum, row) => sum + row.additional + row.change + row.competitionDiff, 0)
  const selected = rows.find((row) => row.orgId === selectedOrgId)
  const playerName = (id: string) => {
    const direct = players.find((p) => p.id === id)?.name
    if (direct) return direct
    const source = sourcePlayers.find((p) => p.id === id)
    if (!source) return "選手不明"
    const normalize = (name: string) => name.normalize("NFKC").replace(/[\s　]+/g, "").toLocaleLowerCase("ja-JP")
    const canonical = players.filter((p) => p.orgId === source.orgId && normalize(p.name) === normalize(source.name))
    return canonical.length === 1 ? source.name : "選手不明"
  }
  const horseName = (id: string) => horses.find((h) => h.id === id)?.name ?? "馬匹不明"
  const competition = (id: string) => competitions.find((c) => c.id === id)
  const requestRiderName = (request: AppRequest) => {
    if (request.change?.toPlayerName) return request.change.toPlayerName
    if (request.add?.playerName) return request.add.playerName
    const riderId = request.add?.playerId ?? request.change?.toPlayerId ?? request.withdraw?.playerId ?? ""
    const direct = players.find((p) => p.id === riderId)?.name
    if (direct) return direct
    if (request.change) {
      const reflectedEntry = startEntries.find((entry) => entry.id === request.change!.entryId)
        ?? startEntries.find((entry) => entry.competitionId === request.change!.toCompetitionId && entry.horseId === request.change!.toHorseId)
      const reflectedPlayer = reflectedEntry ? players.find((p) => p.id === reflectedEntry.playerId)?.name : undefined
      if (reflectedPlayer) return reflectedPlayer
    }
    return "選手不明"
  }

  if (loading) return <p className="p-5 text-lg font-semibold">料金修正を読み込んでいます…</p>
  if (loadFailed) return <div role="alert" className="rounded-xl border border-destructive p-5 font-semibold text-destructive">{error}。精算額の表示を停止しました。再読み込みしてください。</div>

  if (selected) {
    const paymentInstruction = paymentInstructions.find(row => row.organization_key === selected.orgId)
    const currentInstruction = instructionDraft?.orgId === selected.orgId ? instructionDraft : { orgId: selected.orgId, method: paymentInstruction?.payment_method ?? "" as const, bankDetails: paymentInstruction?.bank_details ?? "" }
    const advance = prepayments.find(row => row.organization_key === selected.orgId)
    const manualDetails = manualRecords.filter(record => settlementOrgId(record.organization_key) === selected.orgId).sort((a, b) => (competition(a.competition_key)?.number ?? Infinity) - (competition(b.competition_key)?.number ?? Infinity))
    const orgReceipts = receipts.filter(row => settlementOrgId(row.organization_key) === selected.orgId)
    const paidItems = orgReceipts.flatMap(row => row.selected_items ?? [])
    const itemPaid = (key: string) => paidItems.filter(item => item.key === key).reduce((sum, item) => sum + item.amount, 0)
    const normalReceiptPaid = itemPaid('normal')
    const extraReceiptPaid = paidItems.filter(item => item.key !== 'normal').reduce((sum, item) => sum + item.amount, 0)
    const manualPaid = extraReceiptPaid + manualDetails.reduce((sum, record) => sum + record.paid_amount, 0)
    const due = selected.total - (advance?.paid_amount ?? 0) - normalReceiptPaid - manualPaid
    const normalDetails = originalEntries.filter((entry) => settlementOrgId(horses.find((h) => h.id === entry.horseId)?.orgId ?? "") === selected.orgId).map((entry) => ({ id: entry.id, rider: playerName(entry.playerId), horse: horseName(entry.horseId), competition: competition(entry.competitionId) })).sort((a, b) => (a.competition?.number ?? Infinity) - (b.competition?.number ?? Infinity))
    const requestCompetitionNumber = (request: AppRequest) => competition(request.add?.competitionId ?? request.change?.toCompetitionId ?? request.withdraw?.competitionId ?? "")?.number ?? Infinity
    const requestDetails = settlementRequests.filter((request) => settlementOrgId(request.orgId) === selected.orgId).sort((a, b) => requestCompetitionNumber(a) - requestCompetitionNumber(b))
    const documentLines: SettlementDocumentLine[] = requestDetails.map(request => {
      const linked = manualDetails.find(record => record.request_id === request.id)
      const comp = competition(request.add?.competitionId ?? request.change?.toCompetitionId ?? request.withdraw?.competitionId ?? '')
      const change = request.change
      const compLabel = (id: string) => { const value = competition(id); return `競技${value?.number ?? '?'} ${value?.name ?? '要確認'}` }
      const changed = (before: string, after: string) => before === after ? after : `${before} → ${after}`
      const rider = change ? changed(playerName(change.fromPlayerId), requestRiderName(request)) : requestRiderName(request)
      const horse = change ? changed(horseName(change.fromHorseId), change.toHorseName || horseName(change.toHorseId)) : horseName(request.add?.horseId ?? request.withdraw?.horseId ?? '')
      const compText = change ? changed(compLabel(change.fromCompetitionId), compLabel(change.toCompetitionId)) : compLabel(request.add?.competitionId ?? request.withdraw?.competitionId ?? '')
      const opNote = change && !!change.fromIsOp !== !!change.toIsOp ? `参加区分：${change.fromIsOp ? 'OP' : '通常'} → ${change.toIsOp ? 'OP' : '通常'}` : ''
      const parts = request.fee.addBase + request.fee.addEntry + request.fee.changeBase + request.fee.competitionDiff
      const addCharge = request.type === 'add' || request.type === 'change' && request.change?.treatedAsWithdrawAdd
      const entryFee = addCharge ? overrideFor('add', request.id)?.corrected_fee ?? (parts ? request.fee.addEntry : request.fee.total) : 0
      const serviceFee = request.type === 'withdraw' ? 0 : addCharge ? (parts ? request.fee.addBase : 0) : parts ? request.fee.changeBase : request.fee.total
      const difference = addCharge || request.type === 'withdraw' ? 0 : request.fee.competitionDiff
      return { key: `request:${request.id}`, period: linked?.period === 'before_event' ? '締切後〜大会前' : '大会期間中', action: request.type === 'add' ? '追加' : request.type === 'change' ? '変更' : '棄権', competitionNumber: comp?.number, competition: compText, rider, horse, entryFee, serviceFee, difference, amount: entryFee + serviceFee + difference, paid: manualDetails.filter(record => record.request_id === request.id).reduce((sum, record) => sum + record.paid_amount, 0) + itemPaid(`request:${request.id}`), note: request.type === 'withdraw' ? '' : [opNote, linked?.details, addCharge && overrideFor('add',request.id) ? `運営修正：${overrideFor('add',request.id)!.reason}` : ''].filter(Boolean).join(' ／ ') }
    })
    for (const record of manualDetails.filter(record => !requestDetails.some(request => request.id === record.request_id))) {
      const comp = competition(record.competition_key), linked = requests.find(request => request.id === record.request_id)
      const charge = record.request_id === null && record.action_type !== 'withdraw' ? record.bill_amount : 0
      documentLines.push({ key: record.request_id ? `request:${record.request_id}` : `manual:${record.id}`, period: record.period === 'before_event' ? '締切後〜大会前' : '大会期間中', action: `${record.action_type === 'add' ? '追加' : record.action_type === 'change' ? '変更' : '棄権'}${linked?.status === 'cancelled' ? '取消済み' : record.request_id ? '未計上' : ''}`, competitionNumber: comp?.number, competition: `競技${comp?.number ?? '?'} ${comp?.name ?? '要確認'}`, rider: playerName(record.rider_key), horse: horseName(record.horse_key), entryFee: charge, serviceFee: 0, difference: 0, amount: charge, paid: record.paid_amount + itemPaid(record.request_id ? `request:${record.request_id}` : `manual:${record.id}`), note: record.action_type === 'withdraw' ? '' : [record.request_id === null ? '会場からの事後連絡・精算のみ（手数料込み）' : linked?.status === 'cancelled' ? '取消済み・入金記録は維持。返金・充当を確認' : '申請未反映のため請求未計上', record.details].filter(Boolean).join(' ／ ') })
    }
    documentLines.sort((a, b) => (a.competitionNumber ?? Number.MAX_SAFE_INTEGER) - (b.competitionNumber ?? Number.MAX_SAFE_INTEGER))
    const printDocument: SettlementDocument = { organization: selected.orgName, organizationKey: selected.orgId, issuedDate: new Date().toLocaleDateString('ja-JP', { timeZone: 'Asia/Tokyo' }), normalTotal: selected.normalEntry, normalRemaining: Math.max(0, selected.normalEntry - (advance?.paid_amount ?? 0)), advancePaid: (advance?.paid_amount ?? 0) + normalReceiptPaid, advanceRecorded: !!advance || normalReceiptPaid > 0, extraTotal: selected.additional + selected.change + selected.competitionDiff, extraPaid: manualPaid, due, method: paymentInstruction?.payment_method === 'bank_transfer' ? '後日振込' : paymentInstruction?.payment_method === 'cash_at_venue' ? '当日現金' : '未設定', bankDetails: paymentInstruction?.payment_method === 'bank_transfer' ? paymentInstruction.bank_details : '', lines: documentLines }

    const verifyFinancialSnapshot = async () => {
      const [latestFees, latestPrepayments, latestManual, latestReceipts] = await Promise.all([loadFeeOverrides(session), loadPrepayments(session), loadManualRecords(session), loadSettlementReceipts(session)])
      const stable = (rows: unknown[]) => JSON.stringify(rows.map(row => Object.entries(row as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))))
      if (stable(latestFees) !== stable(feeOverrides) || stable(latestPrepayments) !== stable(prepayments) || stable(latestManual) !== stable(manualRecords) || stable(latestReceipts) !== stable(receipts)) throw new Error('別の操作で入金・料金が更新されています。再読み込みし、対象と残額を確認してください')
    }
    return <div className="flex flex-col gap-5">

      <div className="flex flex-col gap-5">
      <button type="button" onClick={() => { setSelectedOrgId(null); setPaymentEditing(false); setEditing(null); setError("") }} className="print-hide w-fit rounded-xl border-2 border-border bg-card px-5 py-3 text-xl font-bold">← 団体一覧へ</button>
      <div className="print-hide rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
        <div className="hidden print:block"><h2 className="text-2xl font-bold">Fuji Horse Show 精算書</h2><p className="mt-1 text-sm">発行日：{new Date().toLocaleDateString("ja-JP", { timeZone: "Asia/Tokyo" })}</p></div>
        <h3 className="text-3xl font-bold text-foreground">{selected.orgName}</h3><div className="mt-4 rounded-xl bg-primary/10 p-4"><p className="text-lg font-bold">差引残額（お支払いいただく金額）</p><p className="mt-1 text-5xl font-bold text-primary">{formatYen(due)}</p></div>
        <p className="print-hide mt-2 text-base font-semibold text-muted-foreground">変更・棄権の取り消しでは変更前のエントリーと通常料金を維持します。追加の取り消しは出番と追加料金から除外します。</p>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5"><Cell label="通常エントリー料金（原則事前払い）" value={formatYen(selected.normalEntry)} /><Cell label="追加料金" value={formatYen(selected.additional)} /><Cell label="変更料金" value={formatYen(selected.change)} /><Cell label="競技変更の差額" value={formatYen(selected.competitionDiff)} /></dl>
        <div className="mt-6 border-t-2 border-border pt-5"><p className="text-lg font-semibold text-muted-foreground">受付・締切後・大会期間中の料金</p><p className="mt-1 text-lg font-semibold">{formatYen(selected.additional + selected.change + selected.competitionDiff)}</p><p className="mt-3 text-base font-semibold">大会費用の合計（通常分を含む）：{formatYen(selected.total)}</p><p className="mt-2 text-base font-semibold">事前エントリー入金済み：{advance || normalReceiptPaid ? formatYen((advance?.paid_amount ?? 0) + normalReceiptPaid) : "未登録"}</p><p className="mt-2 text-base font-semibold">締切後・大会期間中の入金済み：{formatYen(manualPaid)}</p>{due < 0 && <p className="text-sm text-muted-foreground">入金額が大会費用を上回っています。返金・充当を確認してください。</p>}{advance && <p className="mt-1 text-sm text-muted-foreground">{new Date(advance.updated_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} 記録{advance.note ? ` ／ ${advance.note}` : ""}</p>}
          {paymentEditing ? <form onSubmit={submitPrepayment} className="mt-4 space-y-3 rounded-xl border border-border p-4"><label className="block font-bold">事前エントリー入金済み金額（円）<input type="number" required min="0" step="1" inputMode="numeric" value={paymentAmount} onChange={e => setPaymentAmount(e.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3" /></label><label className="block font-bold">メモ（任意）<input maxLength={500} value={paymentNote} onChange={e => setPaymentNote(e.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3" /></label>{error && <p role="alert" className="text-destructive">{error}</p>}<div className="flex gap-2"><button disabled={saving} type="submit" className="min-h-12 flex-1 rounded-lg bg-primary px-4 font-bold text-primary-foreground">入金状況を保存</button><button type="button" onClick={() => { setPaymentEditing(false); setError("") }} className="min-h-12 rounded-lg border border-border px-4">やめる</button></div></form> : <button type="button" onClick={() => { setPaymentAmount(String(advance?.paid_amount ?? selected.normalEntry)); setPaymentNote(advance?.note ?? ""); setPaymentEditing(true); setError("") }} className="mt-4 min-h-12 rounded-lg border border-primary px-4 font-bold text-primary">事前エントリーの支払いを記録・修正</button>}</div>
      </div>
      <SettlementDocuments key={selected.orgId} document={printDocument} session={session} onBeforeIssue={verifyFinancialSnapshot} receipts={orgReceipts} onReceiptSaved={row => setReceipts(previous => [row, ...previous.filter(item => item.id !== row.id)])} ready={!!paymentInstruction && instructionDraft?.orgId !== selected.orgId} />
      <div className="print-hide rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
        <h4 className="text-2xl font-bold">料金明細</h4><p className="mt-1 text-sm font-semibold text-muted-foreground">選手・馬・競技ごとに、合計金額の根拠を確認できます。</p>
        <details className="mt-5"><summary className="cursor-pointer py-3 text-lg font-bold">通常エントリー（{normalDetails.length}件）</summary><div className="overflow-hidden rounded-xl border border-border">{normalDetails.map((detail,index)=><div key={detail.id} className={`settlement-detail-row p-4 ${index?"border-t border-border":""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold">{detail.rider} ／ {detail.horse}</p><p className="mt-1 text-sm font-semibold text-muted-foreground">競技{detail.competition?.number??"?"} {detail.competition?.name??"競技不明"}</p></div><div className="shrink-0 text-right"><span className="text-lg font-bold">{formatYen(overrideFor("normal",detail.id)?.corrected_fee??detail.competition?.entryFee??0)}</span><button type="button" onClick={()=>startEditing("normal",detail.id,detail.competition?.entryFee??0)} className="mt-1 block min-h-10 rounded-lg border border-primary px-3 text-sm font-bold text-primary">料金を修正</button></div></div>{overrideFor("normal",detail.id)&&<CorrectionInfo row={overrideFor("normal",detail.id)!} />}{editing?.type==="normal"&&editing.id===detail.id&&<FeeEditor amount={amount} setAmount={setAmount} reason={reason} setReason={setReason} saving={saving} error={error} onSubmit={submitCorrection} onCancel={()=>{setEditing(null);setError("")}} />}</div>)}</div></details>
        {manualDetails.length > 0 && <details className="mt-6"><summary className="cursor-pointer py-3 text-lg font-bold">締切後・大会期間中の記録（{manualDetails.length}件）</summary><div className="overflow-hidden rounded-xl border border-border">{manualDetails.map((record, index) => <div key={record.id} className={`settlement-detail-row p-4 ${index ? "border-t border-border" : ""}`}><p className="font-bold">{record.period === "at_venue" ? "大会期間中・精算のみ" : "締切後〜大会前・出番表反映"} ／ {record.action_type === "add" ? "追加" : record.action_type === "change" ? "変更" : "棄権"}</p><p className="mt-1">{playerName(record.rider_key)} ／ {horseName(record.horse_key)} ／ 競技{competition(record.competition_key)?.number ?? "?"} {competition(record.competition_key)?.name ?? "競技不明"}</p>{record.details && <p className="mt-1 text-sm text-muted-foreground">{record.details}</p>}<p className="mt-1 font-semibold">{record.request_id === null ? `請求 ${formatYen(record.bill_amount)}` : requests.find(req => req.id === record.request_id)?.status === "cancelled" ? "申請取消済み・入金記録は維持（返金・充当を確認）" : requests.find(req => req.id === record.request_id)?.status === "reflected" ? "請求額は受付反映分に計上" : "申請未反映・請求は未計上"} ／ 入金済み {formatYen(record.paid_amount)} ／ {record.payment_plan === "paid_before_event" ? "大会前に振込済み" : record.payment_plan === "pay_at_venue" ? "大会当日に支払い予定（振込・会場）" : "大会後に振込予定"}</p><p className="mt-1 text-xs text-muted-foreground">担当：{record.operator_name} ／ {new Date(record.created_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })}</p></div>)}</div></details>}
        {requestDetails.length>0&&<details className="mt-6"><summary className="cursor-pointer py-3 text-lg font-bold">追加・変更・棄権の明細（{requestDetails.length}件）</summary><div className="overflow-hidden rounded-xl border border-border">{requestDetails.map((request,index)=>{const horseId=request.add?.horseId??request.change?.toHorseId??request.withdraw?.horseId??"";const competitionId=request.add?.competitionId??request.change?.toCompetitionId??request.withdraw?.competitionId??"";const comp=competition(competitionId);const label=request.type==="add"?"追加":request.type==="change"?"変更":"棄権";const currentEntry=startEntries.find(entry=>entry.id===request.officialEntryId);const currentHorse=currentEntry?horseName(currentEntry.horseId):undefined;const requestedHorse=horseName(horseId);const mismatch=request.type==="change"&&currentHorse&&currentHorse.normalize("NFKC").replace(/[\s　]+/g,"")!==requestedHorse.normalize("NFKC").replace(/[\s　]+/g,"");return <div key={request.id} className={`settlement-detail-row p-4 ${index?"border-t border-border":""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold"><span className="mr-2 rounded-md bg-primary/10 px-2 py-1 text-sm text-primary">{label}</span>{(request.add?.isOp||request.change?.toIsOp)&&<span className="mr-2 rounded-md bg-sky-100 px-2 py-1 text-sm text-sky-900">OP</span>}{requestRiderName(request)} ／ {mismatch?currentHorse:requestedHorse}</p>{mismatch&&<p className="mt-1 text-sm font-bold text-amber-800">要確認：申請の変更後馬は {requestedHorse}、現在の正式出番表は {currentHorse} です。</p>}<p className="mt-2 text-sm font-semibold text-muted-foreground">競技{comp?.number??"?"} {comp?.name??"競技不明"}</p>{request.type==="add"&&<p className="mt-1 text-xs text-muted-foreground">追加手数料 {formatYen(request.fee.addBase)} ＋ {request.add?.isOp?"OP競技料金（1,000円引き）":"競技料金"} {formatYen(overrideFor("add",request.id)?.corrected_fee??request.fee.addEntry)}</p>}{request.type==="change"&&<p className="mt-1 text-xs text-muted-foreground">変更手数料 {formatYen(request.fee.changeBase)} ＋ 競技・参加区分の差額 {formatYen(request.fee.competitionDiff)}</p>}{request.type==="withdraw"&&<p className="mt-1 text-xs text-muted-foreground">棄権申請 0円（元エントリー料金は返金なし）</p>}</div><div className="shrink-0 text-right"><span className="text-lg font-bold">{formatYen(request.type==="add"?(request.fee.addBase+(overrideFor("add",request.id)?.corrected_fee??request.fee.addEntry)):request.type==="withdraw"?0:request.fee.total)}</span>{request.type==="add"&&<button type="button" onClick={()=>startEditing("add",request.id,request.fee.addEntry)} className="mt-1 block min-h-10 rounded-lg border border-primary px-3 text-sm font-bold text-primary">競技料金を修正</button>}</div></div>{request.type==="add"&&overrideFor("add",request.id)&&<CorrectionInfo row={overrideFor("add",request.id)!} />}{editing?.type==="add"&&editing.id===request.id&&<FeeEditor amount={amount} setAmount={setAmount} reason={reason} setReason={setReason} saving={saving} error={error} onSubmit={submitCorrection} onCancel={()=>{setEditing(null);setError("")}} />}</div>})}</div></details>}
      </div>
      <div className="print-hide rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
        <h4 className="text-xl font-bold">差引残額の支払方法</h4>
        <p className="mt-2 font-bold">{paymentInstruction?.payment_method === "bank_transfer" ? "後日振込" : paymentInstruction?.payment_method === "cash_at_venue" ? "当日現金" : "未設定"}</p>
        {paymentInstruction?.payment_method === "bank_transfer" && <div className="mt-2"><p className="font-semibold">振込先</p><p className="whitespace-pre-wrap break-words">{paymentInstruction.bank_details}</p></div>}
        <form onSubmit={submitPaymentInstruction} className="print-hide mt-4 space-y-3 border-t border-border pt-4">
          <label className="block font-bold">お支払い方法<select value={currentInstruction.method} onChange={event => { setInstructionDraft({ ...currentInstruction, method: event.target.value as PaymentInstruction["payment_method"], bankDetails: currentInstruction.bankDetails }); setInstructionError("") }} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3"><option value="">選択してください</option><option value="bank_transfer">後日振込</option><option value="cash_at_venue">当日現金</option></select></label>
          {currentInstruction.method === "bank_transfer" && <label className="block font-bold">印刷する振込先<textarea required maxLength={2000} value={currentInstruction.bankDetails} onChange={event => setInstructionDraft({ ...currentInstruction, bankDetails: event.target.value })} placeholder="銀行名・支店名・口座種別・口座番号・口座名義を入力" className="mt-1 min-h-28 w-full rounded-lg border border-border bg-background p-3" /></label>}
          {instructionError && <p role="alert" className="font-semibold text-destructive">{instructionError}</p>}
          <button type="submit" disabled={instructionSaving || !currentInstruction.method || (currentInstruction.method === "bank_transfer" && !currentInstruction.bankDetails.trim())} className="min-h-12 rounded-lg bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50">{instructionSaving ? "保存中…" : "支払案内を保存"}</button>
        </form>
      </div>
      </div>
    </div>
  }

  return <div className="flex flex-col gap-5"><div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5"><p className="text-lg font-semibold">通常エントリー料金は原則事前払いです。団体を選ぶと通常分と今回の受付分を分けて確認できます。</p>{excludedLegacyCount>0&&<p className="mt-2 text-sm font-semibold text-muted-foreground">旧テストデータ {excludedLegacyCount}件は正式データへ紐付けできないため、精算金額から除外しています。</p>}<div className="mt-4 flex items-end justify-between gap-4 border-t border-primary/20 pt-4"><span className="text-lg font-bold">全団体 追加・変更分</span><span className="text-3xl font-bold text-primary">{formatYen(receptionTotal)}</span></div><p className="mt-2 text-sm text-muted-foreground">大会費用の合計（通常分を含む）：{formatYen(grandTotal)}。支払い済みかどうかは未反映です。</p></div><div className="overflow-hidden rounded-2xl border-2 border-border bg-card shadow-sm">{rows.map((row,index)=><button key={row.orgId} type="button" onClick={()=>setSelectedOrgId(row.orgId)} className={`flex w-full items-center justify-between gap-4 px-5 py-5 text-left ${index?"border-t border-border":""}`}><span className="min-w-0 text-xl font-bold text-foreground">{row.orgName}</span><span className="flex shrink-0 items-center gap-3"><span className="flex flex-col items-end"><span className="text-xl font-bold text-primary">{formatYen(row.additional + row.change + row.competitionDiff)}</span>{prepayments.some(payment => payment.organization_key === row.orgId) && <span className="text-xs font-bold text-primary">事前入金記録あり</span>}</span><span className="text-2xl text-muted-foreground">›</span></span></button>)}</div></div>
}

function Cell({label,value}:{label:string;value:string}){return <div><dt className="text-base font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 text-lg font-semibold text-foreground">{value}</dd></div>}

function CorrectionInfo({ row }: { row: FeeOverride }) {
  return <p className="mt-2 rounded-lg bg-amber-50 p-2 text-sm text-amber-950">
    運営修正：標準 {formatYen(row.original_fee)} → {formatYen(row.corrected_fee)} ／ 理由：{row.reason}<br />
    {new Date(row.updated_at).toLocaleString("ja-JP", { timeZone: "Asia/Tokyo" })} 保存
  </p>
}

function FeeEditor({ amount, setAmount, reason, setReason, saving, error, onSubmit, onCancel }: {
  amount: string; setAmount: (value: string) => void; reason: string; setReason: (value: string) => void;
  saving: boolean; error: string; onSubmit: (event: FormEvent) => void; onCancel: () => void
}) {
  return <form onSubmit={onSubmit} className="mt-3 rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
    <label className="block font-bold">修正後のエントリー料金（円）
      <input required type="number" min="0" step="1" inputMode="numeric" value={amount} onChange={event => setAmount(event.target.value)} className="mt-1 min-h-12 w-full rounded-lg border border-border bg-background px-3 text-lg" />
    </label>
    <label className="mt-3 block font-bold">修正理由
      <textarea required maxLength={500} value={reason} onChange={event => setReason(event.target.value)} className="mt-1 min-h-20 w-full rounded-lg border border-border bg-background p-3 text-base" placeholder="例：事前申込の料金訂正" />
    </label>
    {error && <p role="alert" className="mt-2 font-semibold text-destructive">{error}</p>}
    <div className="mt-3 flex gap-2">
      <button disabled={saving} type="submit" className="min-h-12 flex-1 rounded-lg bg-primary px-3 font-bold text-primary-foreground disabled:opacity-50">{saving ? "保存中…" : "修正を保存"}</button>
      <button disabled={saving} type="button" onClick={onCancel} className="min-h-12 rounded-lg border border-border bg-card px-3 font-bold">やめる</button>
    </div>
  </form>
}
