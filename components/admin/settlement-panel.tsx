"use client"

import { useState } from "react"
import { useStore } from "@/lib/store"
import { calcSettlement } from "@/lib/settlement"
import { formatYen } from "@/lib/fees"

export function SettlementPanel() {
  const { organizations, horses, competitions, startEntries, requests } = useStore()
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const rows = calcSettlement({ organizations, seedEntries: startEntries, horses, competitions, requests, payments: [] })
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0)
  const selected = rows.find((row) => row.orgId === selectedOrgId)

  if (selected) return (
    <div className="flex flex-col gap-5">
      <button type="button" onClick={() => setSelectedOrgId(null)} className="w-fit rounded-xl border-2 border-border bg-card px-5 py-3 text-xl font-bold">← 団体一覧へ</button>
      <div className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
        <h3 className="text-3xl font-bold text-foreground">{selected.orgName}</h3>
        <p className="mt-2 text-base font-semibold text-muted-foreground">棄権した出番は0円として現在の出番表から計算しています。</p>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
          <Cell label="現在の競技エントリー料金" value={formatYen(selected.normalEntry)} />
          <Cell label="追加申請手数料" value={formatYen(selected.additional)} />
          <Cell label="変更申請手数料" value={formatYen(selected.change)} />
          <Cell label="その他差額" value={formatYen(selected.competitionDiff)} />
        </dl>
        <div className="mt-6 border-t-2 border-border pt-5"><p className="text-lg font-semibold text-muted-foreground">現在の合計金額</p><p className="mt-1 text-4xl font-bold text-primary">{formatYen(selected.total)}</p></div>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
        <p className="text-lg font-semibold">団体を選ぶと、現在の正式出番表を基準にした精算内訳を確認できます。</p>
        <div className="mt-4 flex items-end justify-between gap-4 border-t border-primary/20 pt-4"><span className="text-lg font-bold">全団体 合計</span><span className="text-3xl font-bold text-primary">{formatYen(grandTotal)}</span></div>
      </div>
      <div className="overflow-hidden rounded-2xl border-2 border-border bg-card shadow-sm">
        {rows.map((row, index) => <button key={row.orgId} type="button" onClick={() => setSelectedOrgId(row.orgId)} className={`flex w-full items-center justify-between gap-4 px-5 py-5 text-left ${index ? "border-t border-border" : ""}`}><span className="min-w-0 text-xl font-bold text-foreground">{row.orgName}</span><span className="flex shrink-0 items-center gap-3"><span className="text-xl font-bold text-primary">{formatYen(row.total)}</span><span className="text-2xl text-muted-foreground">›</span></span></button>)}
      </div>
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) { return <div><dt className="text-base font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-bold text-foreground">{value}</dd></div> }
