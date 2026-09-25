"use client"

import { useStore } from "@/lib/store"
import { calcSettlement } from "@/lib/settlement"
import { formatYen } from "@/lib/fees"
import { startEntries as seedEntries } from "@/lib/mock-data"

export function SettlementPanel() {
  const { organizations, horses, competitions, requests } = useStore()

  const rows = calcSettlement({
    organizations,
    seedEntries,
    horses,
    competitions,
    requests,
    payments: [],
  })

  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0)

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
        <p className="text-lg font-semibold text-muted-foreground">現在のエントリー・反映済み受付をもとにした請求予定額です。</p>
        <p className="mt-2 text-base text-muted-foreground">事前振込額の差引計算は後から追加します。現在はエントリー料金の合計確認を優先しています。</p>
      </div>

      {rows.map((r) => (
        <div key={r.orgId} className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
          <h3 className="text-2xl font-bold text-foreground">{r.orgName}</h3>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-3">
            <Cell label="通常エントリー料金" value={formatYen(r.normalEntry)} />
            <Cell label="追加料金" value={formatYen(r.additional)} />
            <Cell label="変更料金" value={formatYen(r.change)} />
            <Cell label="競技変更の差額" value={formatYen(r.competitionDiff)} />
            <Cell label="現在の合計金額" value={formatYen(r.total)} strong />
          </dl>
        </div>
      ))}

      <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
        <h3 className="text-2xl font-bold text-foreground">全団体 合計</h3>
        <p className="mt-3 text-4xl font-bold text-primary">{formatYen(grandTotal)}</p>
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
