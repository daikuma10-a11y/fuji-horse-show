"use client"

import { useStore } from "@/lib/store"
import { calcSettlement } from "@/lib/settlement"
import { formatYen } from "@/lib/fees"
import { startEntries as seedEntries } from "@/lib/mock-data"

export function SettlementPanel() {
  const { organizations, horses, competitions, requests, payments, setPayment } = useStore()

  const rows = calcSettlement({
    organizations,
    seedEntries,
    horses,
    competitions,
    requests,
    payments,
  })

  const grand = rows.reduce(
    (acc, r) => ({
      total: acc.total + r.total,
      paid: acc.paid + r.paid,
      shortage: acc.shortage + r.shortage,
      excess: acc.excess + r.excess,
    }),
    { total: 0, paid: 0, shortage: 0, excess: 0 },
  )

  return (
    <div className="flex flex-col gap-5">
      <p className="text-lg text-muted-foreground">
        精算は選手個人ではなく「所属団体ごと」にまとめて計算します。振込済み金額を入力すると、未精算額・振込不足・振込過多を自動計算します。
      </p>

      {rows.map((r) => (
        <div key={r.orgId} className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
          <h3 className="text-2xl font-bold text-foreground">{r.orgName}</h3>

          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Cell label="通常エントリー料金" value={formatYen(r.normalEntry)} />
            <Cell label="追加料金" value={formatYen(r.additional)} />
            <Cell label="変更料金" value={formatYen(r.change)} />
            <Cell label="競技変更の差額" value={formatYen(r.competitionDiff)} />
            <Cell label="請求合計（最終精算金額）" value={formatYen(r.total)} strong />
          </dl>

          <div className="mt-4 flex flex-wrap items-center gap-4 border-t-2 border-border pt-4">
            <label className="flex items-center gap-3 text-lg font-semibold text-muted-foreground">
              振込済み金額
              <span className="flex items-center gap-1">
                <span className="text-2xl font-bold text-foreground">¥</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min={0}
                  value={r.paid || ""}
                  onChange={(e) => setPayment(r.orgId, Number(e.target.value) || 0)}
                  className="w-40 rounded-xl border-2 border-border bg-background px-3 py-2 text-right text-2xl font-bold text-foreground focus:border-primary focus:outline-none"
                  placeholder="0"
                />
              </span>
            </label>
          </div>

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatusCell label="未精算額" value={formatYen(r.unsettled)} tone={r.unsettled === 0 ? "ok" : "warn"} />
            <StatusCell label="振込不足" value={formatYen(r.shortage)} tone={r.shortage > 0 ? "danger" : "ok"} />
            <StatusCell label="振込過多" value={formatYen(r.excess)} tone={r.excess > 0 ? "warn" : "ok"} />
          </div>
        </div>
      ))}

      <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
        <h3 className="text-2xl font-bold text-foreground">全団体 合計</h3>
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <Cell label="請求合計" value={formatYen(grand.total)} strong />
          <Cell label="振込済み合計" value={formatYen(grand.paid)} />
          <Cell label="振込不足 合計" value={formatYen(grand.shortage)} />
          <Cell label="振込過多 合計" value={formatYen(grand.excess)} />
        </dl>
      </div>
    </div>
  )
}

function Cell({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div>
      <dt className="text-base font-semibold text-muted-foreground">{label}</dt>
      <dd className={`mt-0.5 font-bold ${strong ? "text-3xl text-primary" : "text-2xl text-foreground"}`}>{value}</dd>
    </div>
  )
}

function StatusCell({ label, value, tone }: { label: string; value: string; tone: "ok" | "warn" | "danger" }) {
  const cls =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/5 text-destructive"
      : tone === "warn"
        ? "border-accent bg-accent/10 text-accent-foreground"
        : "border-border bg-secondary text-foreground"
  return (
    <div className={`rounded-xl border-2 p-3 text-center ${cls}`}>
      <p className="text-base font-semibold">{label}</p>
      <p className="mt-0.5 text-2xl font-bold">{value}</p>
    </div>
  )
}
