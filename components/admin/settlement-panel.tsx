"use client"

import { useEffect, useMemo, useState } from "react"
import { useStore } from "@/lib/store"
import { calcSettlement } from "@/lib/settlement"
import { formatYen } from "@/lib/fees"
import { loadReceptionPayments, persistPayment } from "@/lib/payment-api"
import { loadReceptionRequests, type PersistedReceptionRequest } from "@/lib/reception-api"
import type { AppRequest, FeeBreakdown } from "@/lib/types"

const emptyFee: FeeBreakdown = { addBase: 0, addEntry: 0, changeBase: 0, competitionDiff: 0, total: 0 }

export function SettlementPanel() {
  const { organizations, horses, competitions, startEntries, payments, setPayment } = useStore()
  const [dbRequests, setDbRequests] = useState<PersistedReceptionRequest[]>([])
  const [savingOrg, setSavingOrg] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => {
    Promise.all([loadReceptionPayments(), loadReceptionRequests()])
      .then(([paymentRows, requestRows]) => { paymentRows.forEach(r => setPayment(r.organization_id, r.paid)); setDbRequests(requestRows) })
      .catch(e => setError(e instanceof Error ? e.message : "精算情報を読み込めませんでした"))
  }, [setPayment])

  const settlementRequests = useMemo<AppRequest[]>(() => dbRequests
    .filter(r => r.status !== "cancelled" && r.organization_id)
    .map(r => ({
      id: r.id,
      type: r.request_type ?? "add",
      status: r.status === "reflected" ? "reflected" : "pending",
      createdAt: r.created_at,
      orgId: r.organization_id!,
      fee: feeBreakdown(r, competitions),
    })), [dbRequests, competitions])

  const rows = calcSettlement({ organizations, seedEntries: startEntries.filter(e => !e.withdrawn), horses, competitions, requests: settlementRequests, payments })
  const grand = rows.reduce((acc, r) => ({ total: acc.total + r.total, paid: acc.paid + r.paid, shortage: acc.shortage + r.shortage, excess: acc.excess + r.excess }), { total: 0, paid: 0, shortage: 0, excess: 0 })

  async function save(orgId: string, paid: number) {
    setSavingOrg(orgId); setError("")
    try { await persistPayment(orgId, paid) }
    catch (e) { setError(e instanceof Error ? e.message : "入金情報を保存できませんでした") }
    finally { setSavingOrg(null) }
  }

  return <div className="flex flex-col gap-5">
    <p className="text-lg text-muted-foreground">精算は選手個人ではなく「所属団体ごと」にまとめて計算します。振込済み金額を入力すると、未精算額・振込不足・振込過多を自動計算します。</p>
    {error && <p className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-3 font-semibold text-destructive">{error}</p>}
    {rows.map(r => <div key={r.orgId} className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
      <h3 className="text-2xl font-bold text-foreground">{r.orgName}</h3>
      <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3"><Cell label="通常エントリー料金" value={formatYen(r.normalEntry)} /><Cell label="追加料金" value={formatYen(r.additional)} /><Cell label="変更料金" value={formatYen(r.change)} /><Cell label="競技変更の差額" value={formatYen(r.competitionDiff)} /><Cell label="請求合計（最終精算金額）" value={formatYen(r.total)} strong /></dl>
      <div className="mt-4 flex flex-wrap items-center gap-4 border-t-2 border-border pt-4"><label className="flex items-center gap-3 text-lg font-semibold text-muted-foreground">振込済み金額<span className="flex items-center gap-1"><span className="text-2xl font-bold text-foreground">¥</span><input type="number" inputMode="numeric" min={0} value={r.paid || ""} onChange={e => setPayment(r.orgId, Number(e.target.value) || 0)} onBlur={() => save(r.orgId, r.paid)} className="w-40 rounded-xl border-2 border-border bg-background px-3 py-2 text-right text-2xl font-bold text-foreground focus:border-primary focus:outline-none" placeholder="0" /></span>{savingOrg === r.orgId && <span>保存中...</span>}</label></div>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3"><StatusCell label="未精算額" value={formatYen(r.unsettled)} tone={r.unsettled === 0 ? "ok" : "warn"} /><StatusCell label="振込不足" value={formatYen(r.shortage)} tone={r.shortage > 0 ? "danger" : "ok"} /><StatusCell label="振込過多" value={formatYen(r.excess)} tone={r.excess > 0 ? "warn" : "ok"} /></div>
    </div>)}
    <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5"><h3 className="text-2xl font-bold text-foreground">全団体 合計</h3><dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4"><Cell label="請求合計" value={formatYen(grand.total)} strong /><Cell label="振込済み合計" value={formatYen(grand.paid)} /><Cell label="振込不足 合計" value={formatYen(grand.shortage)} /><Cell label="振込過多 合計" value={formatYen(grand.excess)} /></dl></div>
  </div>
}

function feeBreakdown(r: PersistedReceptionRequest, competitions: ReturnType<typeof useStore>["competitions"]): FeeBreakdown {
  const total = r.fee ?? 0
  if (r.request_type === "add" || r.treated_as_withdraw_add) return { ...emptyFee, addBase: Math.min(3000, total), addEntry: Math.max(0, total - 3000), total }
  if (r.request_type === "change") {
    const from = competitions.find(c => c.id === r.from_competition_id)?.entryFee ?? 0
    const to = competitions.find(c => c.id === r.to_competition_id)?.entryFee ?? 0
    const diff = Math.max(0, to - from)
    return { ...emptyFee, changeBase: Math.max(0, total - diff), competitionDiff: diff, total }
  }
  return { ...emptyFee, total }
}
function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) { return <div><dt className="text-base font-semibold text-muted-foreground">{label}</dt><dd className={`mt-0.5 font-bold ${strong ? "text-3xl text-primary" : "text-2xl text-foreground"}`}>{value}</dd></div> }
function StatusCell({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "danger" }) { const cls = tone === "danger" ? "border-destructive/40 bg-destructive/5 text-destructive" : tone === "warn" ? "border-accent bg-accent/10 text-accent-foreground" : "border-border bg-secondary text-foreground"; return <div className={`rounded-xl border-2 p-3 text-center ${cls}`}><p className="text-base font-semibold">{label}</p><p className="mt-0.5 text-2xl font-bold">{value}</p></div> }
