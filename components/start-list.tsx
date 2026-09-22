"use client"

import { Check } from "lucide-react"
import { useStore } from "@/lib/store"
import type { StartEntry } from "@/lib/types"

export function StartList({
  competitionId,
  selectedId,
  onSelect,
  readOnly = false,
}: {
  competitionId: string
  selectedId?: string
  onSelect?: (entry: StartEntry) => void
  readOnly?: boolean
}) {
  const { entriesByCompetition, getPlayer, getHorse, getOrg } = useStore()
  const entries = entriesByCompetition(competitionId)

  if (entries.length === 0) {
    return (
      <p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-8 text-center text-xl text-muted-foreground">
        この競技の出番はまだありません。
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {entries.map((e) => {
        const player = getPlayer(e.playerId)
        const horse = getHorse(e.horseId)
        const org = horse ? getOrg(horse.orgId) : undefined
        const selected = selectedId === e.id
        const Tag = readOnly ? "div" : "button"
        return (
          <Tag
            key={e.id}
            {...(readOnly
              ? {}
              : {
                  type: "button" as const,
                  onClick: () => onSelect?.(e),
                  "aria-pressed": selected,
                })}
            className={`flex min-h-24 items-center gap-4 rounded-2xl border-2 px-5 py-3 text-left shadow-sm transition ${
              readOnly ? "" : "active:scale-[0.99]"
            } ${
              selected
                ? "border-primary bg-primary/10 ring-4 ring-primary/25"
                : "border-border bg-card"
            } ${readOnly ? "" : "hover:border-primary"}`}
          >
            <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-2xl font-bold text-secondary-foreground">
              {e.order}
            </span>
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={`text-2xl font-bold ${e.withdrawn ? "text-destructive line-through" : "text-foreground"}`}>
  {player?.name ?? "—"} {e.withdrawn && "【棄権】"}
</span>
<span className={`text-xl ${e.withdrawn ? "text-destructive line-through" : "text-foreground"}`}>
  馬：{horse?.name ?? "—"}
</span>
<span className="text-lg text-muted-foreground">
  {org?.name ?? "—"}
</span>
            </span>
            {!readOnly && (
              <span
                className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${
                  selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
                }`}
                aria-hidden="true"
              >
                {selected && <Check className="size-6" />}
              </span>
            )}
          </Tag>
        )
      })}
    </div>
  )
}
