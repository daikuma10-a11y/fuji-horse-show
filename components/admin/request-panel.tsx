"use client"

import { CheckCircle2, Clock } from "lucide-react"
import { useStore } from "@/lib/store"
import { formatYen } from "@/lib/fees"
import { ActionButton } from "@/components/action-button"
import type { AppRequest } from "@/lib/types"

const typeLabel: Record<AppRequest["type"], { text: string; cls: string }> = {
  add: { text: "追加", cls: "bg-primary text-primary-foreground" },
  change: { text: "変更", cls: "bg-accent text-accent-foreground" },
  withdraw: { text: "棄権", cls: "bg-destructive text-white" },
}

export function RequestPanel() {
  const { requests, reflectRequest, getCompetition, getPlayer, getHorse, getOrg } = useStore()

  if (requests.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-10 text-center text-xl text-muted-foreground">
        まだ受付された申請はありません。受付タブレットから追加・変更・棄権を申請すると、ここに表示されます。
      </p>
    )
  }

  function compText(id: string) {
    const c = getCompetition(id)
    return c ? `競技${c.number}. ${c.name}${c.official ? "（★公認）" : ""}` : "―"
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-lg text-muted-foreground">
        受付された申請の一覧です。「出番表へ反映」を押すと、内容が出番表に反映されます。
      </p>

      {requests.map((r) => {
        const label = typeLabel[r.type]
        const org = getOrg(r.orgId)
        return (
          <div key={r.id} className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className={`rounded-lg px-3 py-1 text-xl font-bold ${label.cls}`}>{label.text}</span>
              <span className="text-xl font-bold text-foreground">{org?.name ?? "―"}</span>
              <span className="ml-auto flex items-center gap-2 text-lg font-semibold">
                {r.status === "reflected" ? (
                  <span className="flex items-center gap-1 text-primary">
                    <CheckCircle2 className="size-6" aria-hidden="true" />
                    反映済み
                  </span>
                ) : (
                  <span className="flex items-center gap-1 text-muted-foreground">
                    <Clock className="size-6" aria-hidden="true" />
                    未反映
                  </span>
                )}
              </span>
            </div>

            <div className="mt-3 space-y-1 text-xl text-foreground">
              {r.type === "add" && r.add && (
                <>
                  <p>{compText(r.add.competitionId)}</p>
                  <p>
                    選手：{getPlayer(r.add.playerId)?.name ?? "―"} ／ 馬：{getHorse(r.add.horseId)?.name ?? "―"}
                  </p>
                  {r.add.note.trim() && <p className="text-lg text-muted-foreground">要望：{r.add.note}</p>}
                </>
              )}

              {r.type === "withdraw" && r.withdraw && (
                <>
                  <p>{compText(r.withdraw.competitionId)}</p>
                  <p>
                    選手：{getPlayer(r.withdraw.playerId)?.name ?? "―"} ／ 馬：{getHorse(r.withdraw.horseId)?.name ?? "―"}
                  </p>
                </>
              )}

              {r.type === "change" && r.change && (
                <>
                  {r.change.treatedAsWithdrawAdd && (
                    <p className="font-bold text-accent-foreground">※棄権＋追加として扱う</p>
                  )}
                  <p className="text-lg text-muted-foreground">変更前</p>
                  <p>
                    {compText(r.change.fromCompetitionId)}／{getPlayer(r.change.fromPlayerId)?.name ?? "―"}／
                    {getHorse(r.change.fromHorseId)?.name ?? "―"}
                  </p>
                  <p className="text-lg text-muted-foreground">変更後</p>
                  <p>
                    {compText(r.change.toCompetitionId)}／{getPlayer(r.change.toPlayerId)?.name ?? "―"}／
                    {getHorse(r.change.toHorseId)?.name ?? "―"}
                  </p>
                </>
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t-2 border-border pt-4">
              <span className="text-xl font-bold text-foreground">
                料金：<span className="text-primary">{formatYen(r.fee.total)}</span>
              </span>
              {r.status === "pending" && (
                <div className="w-full sm:w-auto sm:min-w-64">
                  <ActionButton onClick={() => reflectRequest(r.id)}>出番表へ反映</ActionButton>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
