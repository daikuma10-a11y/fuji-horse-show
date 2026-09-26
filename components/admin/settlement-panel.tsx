"use client"

import { useState } from "react"
import { useStore } from "@/lib/store"
import { calcSettlement } from "@/lib/settlement"
import { formatYen } from "@/lib/fees"
import { startEntries as originalEntries } from "@/lib/mock-data"
import { players as sourcePlayers } from "@/lib/autumn-data"
import type { AppRequest } from "@/lib/types"

// Autumn原本の同一団体として確認済みの別表記。精算表示だけ集約し、元の人馬IDは維持する。
const confirmedOrgAliases: Record<string, string> = {
  "org-2": "org-4",   // Horse'sNewStage → Horses' New Stage
  "org-6": "org-8",   // RIDING TEAM REGROUP → riding team Regroup
  "org-23": "org-17", // 乗馬クラブリバーサイドステーブル浜北 → 乗馬クラブ リバーサイドステーブル浜北
  "org-24": "org-25", // 八王子乗馬俱楽部 → 八王子乗馬倶楽部
}
const settlementOrgId = (id: string) => confirmedOrgAliases[id] ?? id

export function SettlementPanel() {
  const { organizations, players, horses, competitions, startEntries, requests } = useStore()
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)

  const isUuid = (id: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
  const entryExists = (id: string) => startEntries.some((e) => e.id === id) || originalEntries.some((e) => e.id === id) || isUuid(id)
  const isResolvableRequest = (request: AppRequest) => {
    if (request.status !== "reflected") return false
    const orgExists = organizations.some((org) => org.id === request.orgId)
    if (!orgExists) return false
    if (request.add) {
      return competitions.some((c) => c.id === request.add!.competitionId) && players.some((p) => p.id === request.add!.playerId) && horses.some((h) => h.id === request.add!.horseId)
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
  })
  const grandTotal = rows.reduce((sum, row) => sum + row.total, 0)
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

  if (selected) {
    const normalDetails = originalEntries.filter((entry) => settlementOrgId(horses.find((h) => h.id === entry.horseId)?.orgId ?? "") === selected.orgId).map((entry) => ({ id: entry.id, rider: playerName(entry.playerId), horse: horseName(entry.horseId), competition: competition(entry.competitionId) }))
    const requestDetails = settlementRequests.filter((request) => settlementOrgId(request.orgId) === selected.orgId)

    return <div className="flex flex-col gap-5">
      <button type="button" onClick={() => setSelectedOrgId(null)} className="w-fit rounded-xl border-2 border-border bg-card px-5 py-3 text-xl font-bold">← 団体一覧へ</button>
      <div className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
        <h3 className="text-3xl font-bold text-foreground">{selected.orgName}</h3>
        <p className="mt-2 text-base font-semibold text-muted-foreground">棄権申請は0円です。申込済みの競技エントリー料金は返金せず、追加・変更の確定料金を加算しています。</p>
        <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-5"><Cell label="通常エントリー料金" value={formatYen(selected.normalEntry)} /><Cell label="追加料金" value={formatYen(selected.additional)} /><Cell label="変更料金" value={formatYen(selected.change)} /><Cell label="競技変更の差額" value={formatYen(selected.competitionDiff)} /></dl>
        <div className="mt-6 border-t-2 border-border pt-5"><p className="text-lg font-semibold text-muted-foreground">現在の合計金額</p><p className="mt-1 text-4xl font-bold text-primary">{formatYen(selected.total)}</p></div>
      </div>
      <div className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
        <h4 className="text-2xl font-bold">料金明細</h4><p className="mt-1 text-sm font-semibold text-muted-foreground">選手・馬・競技ごとに、合計金額の根拠を確認できます。</p>
        <div className="mt-5"><h5 className="mb-3 text-lg font-bold">通常エントリー</h5><div className="overflow-hidden rounded-xl border border-border">{normalDetails.map((detail,index)=><div key={detail.id} className={`p-4 ${index?"border-t border-border":""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold">{detail.rider} ／ {detail.horse}</p><p className="mt-1 text-sm font-semibold text-muted-foreground">競技{detail.competition?.number??"?"} {detail.competition?.name??"競技不明"}</p></div><span className="shrink-0 text-lg font-bold">{formatYen(detail.competition?.entryFee??0)}</span></div></div>)}</div></div>
        {requestDetails.length>0&&<div className="mt-6"><h5 className="mb-3 text-lg font-bold">受付反映分</h5><div className="overflow-hidden rounded-xl border border-border">{requestDetails.map((request,index)=>{const horseId=request.add?.horseId??request.change?.toHorseId??request.withdraw?.horseId??"";const competitionId=request.add?.competitionId??request.change?.toCompetitionId??request.withdraw?.competitionId??"";const comp=competition(competitionId);const label=request.type==="add"?"追加":request.type==="change"?"変更":"棄権";return <div key={request.id} className={`p-4 ${index?"border-t border-border":""}`}><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="font-bold"><span className="mr-2 rounded-md bg-primary/10 px-2 py-1 text-sm text-primary">{label}</span>{requestRiderName(request)} ／ {horseName(horseId)}</p><p className="mt-2 text-sm font-semibold text-muted-foreground">競技{comp?.number??"?"} {comp?.name??"競技不明"}</p>{request.type==="add"&&<p className="mt-1 text-xs text-muted-foreground">追加手数料 {formatYen(request.fee.addBase)} ＋ 競技料金 {formatYen(request.fee.addEntry)}</p>}{request.type==="change"&&<p className="mt-1 text-xs text-muted-foreground">変更手数料 {formatYen(request.fee.changeBase)} ＋ 競技差額 {formatYen(request.fee.competitionDiff)}</p>}{request.type==="withdraw"&&<p className="mt-1 text-xs text-muted-foreground">棄権申請 0円（元エントリー料金は返金なし）</p>}</div><span className="shrink-0 text-lg font-bold">{formatYen(request.type==="withdraw"?0:request.fee.total)}</span></div></div>})}</div></div>}
      </div>
    </div>
  }

  return <div className="flex flex-col gap-5"><div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5"><p className="text-lg font-semibold">団体を選ぶと、通常エントリー料金と反映済みの追加・変更料金を確認できます。</p>{excludedLegacyCount>0&&<p className="mt-2 text-sm font-semibold text-muted-foreground">旧テストデータ {excludedLegacyCount}件は正式データへ紐付けできないため、精算金額から除外しています。</p>}<div className="mt-4 flex items-end justify-between gap-4 border-t border-primary/20 pt-4"><span className="text-lg font-bold">全団体 合計</span><span className="text-3xl font-bold text-primary">{formatYen(grandTotal)}</span></div></div><div className="overflow-hidden rounded-2xl border-2 border-border bg-card shadow-sm">{rows.map((row,index)=><button key={row.orgId} type="button" onClick={()=>setSelectedOrgId(row.orgId)} className={`flex w-full items-center justify-between gap-4 px-5 py-5 text-left ${index?"border-t border-border":""}`}><span className="min-w-0 text-xl font-bold text-foreground">{row.orgName}</span><span className="flex shrink-0 items-center gap-3"><span className="text-xl font-bold text-primary">{formatYen(row.total)}</span><span className="text-2xl text-muted-foreground">›</span></span></button>)}</div></div>
}

function Cell({label,value}:{label:string;value:string}){return <div><dt className="text-base font-semibold text-muted-foreground">{label}</dt><dd className="mt-1 text-2xl font-bold text-foreground">{value}</dd></div>}
