"use client"

import { useState } from "react"
import { useStore } from "@/lib/store"
import { calcSettlement } from "@/lib/settlement"
import { formatYen } from "@/lib/fees"
import { startEntries as originalEntries } from "@/lib/mock-data"

export function SettlementPanel() {
  const { organizations, players, horses, competitions, requests } = useStore()
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  const rows = calcSettlement({ organizations, seedEntries: originalEntries, horses, competitions, requests, payments: [] })
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0)
  const selected = rows.find((row) => row.orgId === selectedOrgId)
  const playerName = (id: string) => players.find((p) => p.id === id)?.name ?? "選手不明"
  const horseName = (id: string) => horses.find((h) => h.id === id)?.name ?? "馬匹不明"
  const competition = (id: string) => competitions.find((c) => c.id === id)

  if (selected) {
    const normalDetails = originalEntries
      .filter((entry) => horses.find((h) => h.id === entry.horseId)?.orgId === selected.orgId)
      .map((entry) => ({
        id: entry.id,
        rider: playerName(entry.playerId),
        horse: horseName(entry.horseId),
        competition: competition(entry.competitionId),
      }))
    const requestDetails = requests.filter((request) => request.orgId === selected.orgId && request.status === "reflected")

    return (
      <div className="flex flex-col gap-5">
        <button type="button" onClick={() => setSelectedOrgId(null)} className="w-fit rounded-xl border-2 border-border bg-card px-5 py-3 text-xl font-bold">← 団体一覧へ</button>
        <div className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
          <h3 className="text-3xl font-bold text-foreground">{selected.orgName}</h3>
          <p className="mt-2 text-base font-semibold text-muted-foreground">棄権申請は0円です。申込済みの競技エントリー料金は返金せず、追加・変更の確定料金を加算しています。</p>
          <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5">
            <Cell label="通常エントリー料金" value={formatYen(selected.normalEntry)} />
            <Cell label="追加料金" value={formatYen(selected.additional)} />
            <Cell label="変更料金" value={formatYen(selected.change)} />
            <Cell label="競技変更の差額" value={formatYen(selected.competitionDiff)} />
          </dl>
          <div className="mt-6 border-t-2 border-border pt-5"><p className="text-lg font-semibold text-muted-foreground">現在の合計金額</p><p className="mt-1 text-4xl font-bold text-primary">{formatYen(selected.total)}</p></div>
        </div>

        <div className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
          <h4 className="text-2xl font-bold">料金明細</h4>
          <p className="mt-1 text-sm font-semibold text-muted-foreground">選手・馬・競技ごとに、合計金額の根拠を確認できます。</p>
          <div className="mt-5">
            <h5 className="mb-3 text-lg font-bold">通常エントリー</h5>
            <div className="overflow-hidden rounded-xl border border-border">
              {normalDetails.map((detail, index) => <div key={detail.id} className={`p-4 ${index ? "border-t border-border" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold">{detail.rider} ／ {detail.horse}</p><p className="mt-1 text-sm font-semibold text-muted-foreground">競技{detail.competition?.number ?? "?"} {detail.competition?.name ?? "競技不明"}</p></div><span className="shrink-0 text-lg font-bold">{formatYen(detail.competition?.entryFee ?? 0)}</span></div></div>)}
            </div>
          </div>

          {requestDetails.length > 0 && <div className="mt-6"><h5 className="mb-3 text-lg font-bold">受付反映分</h5><div className="overflow-hidden rounded-xl border border-border">{requestDetails.map((request, index) => {
            const payload = request.add ?? request.change ?? request.withdraw
            const riderId = request.add?.playerId ?? request.change?.toPlayerId ?? request.withdraw?.playerId ?? ""
            const horseId = request.add?.horseId ?? request.change?.toHorseId ?? request.withdraw?.horseId ?? ""
            const competitionId = request.add?.competitionId ?? request.change?.toCompetitionId ?? request.withdraw?.competitionId ?? ""
            const comp = competition(competitionId)
            const label = request.type === "add" ? "追加" : request.type === "change" ? "変更" : "棄権"
            return <div key={request.id} className={`p-4 ${index ? "border-t border-border" : ""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold"><span className="mr-2 rounded-md bg-primary/10 px-2 py-1 text-sm text-primary">{label}</span>{playerName(riderId)} ／ {horseName(horseId)}</p><p className="mt-2 text-sm font-semibold text-muted-foreground">競技{comp?.number ?? "?"} {comp?.name ?? "競技不明"}</p>{request.type === "add" && <p className="mt-1 text-xs text-muted-foreground">追加手数料 {formatYen(request.fee.addBase)} ＋ 競技料金 {formatYen(request.fee.addEntry)}</p>}{request.type === "change" && <p className="mt-1 text-xs text-muted-foreground">変更手数料 {formatYen(request.fee.changeBase)} ＋ 競技差額 {formatYen(request.fee.competitionDiff)}</p>}{request.type === "withdraw" && <p className="mt-1 text-xs text-muted-foreground">棄権申請 0円（元エントリー料金は返金なし）</p>}</div><span className="shrink-0 text-lg font-bold">{formatYen(request.type === "withdraw" ? 0 : request.fee.total)}</span></div></div>
          })}</div></div>}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
        <p className="text-lg font-semibold">団体を選ぶと、通常エントリー料金と反映済みの追加・変更料金を確認できます。</p>
        <div className="mt-4 flex items-end justify-between gap-4 border-t border-primary/20 pt-4"><span className="text-lg font-bold">全団体 合計</span><span className="text-3xl font-bold text-primary">{formatYen(grandTotal)}</span></div>
      </div>
      <div className="overflow-hidden rounded-2xl border-2 border-border bg-card shadow-sm">
        {rows.map((row, index) => <button key={row.orgId} type="button" onClick={() => setSelectedOrgId(row.orgId)} className={`flex w-full items-center justify-between gap-4 px-5 py-5 text-left ${index ? "border-t border-border" : ""}`}><span className="min-w-0 text-xl font-bold text-foreground">{row.orgName}</span><span className="flex shrink-0 items-center gap-3"><span className="text-xl font-bold text-primary">{formatYen(row.total)}</span><span className="text-2xl text-muted-foreground">›</span></span></button>)}
      </div>
    </div>
  )
}

function Cell({ label, value }: { label: string; value: string }) { return <div><dt className="text-base font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-bold text-foreground">{value}</dd></div> }
