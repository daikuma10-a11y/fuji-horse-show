"use client"

import { ChevronRight } from "lucide-react"
import { useStore } from "@/lib/store"
import { formatYen } from "@/lib/fees"
import type { Competition, CompetitionDate } from "@/lib/types"
import { OfficialBadge } from "./official-badge"

export function CompetitionList({
  date,
  onSelect,
}: {
  date: CompetitionDate
  onSelect: (competition: Competition) => void
}) {
  const { competitionsByDate } = useStore()
  const list = competitionsByDate(date)

  return (
    <div className="flex flex-col gap-3">
      {list.map((c) => (
        <button
          key={c.id}
          type="button"
          onClick={() => onSelect(c)}
          className="flex min-h-20 items-center gap-4 rounded-2xl border-2 border-border bg-card px-5 py-3 text-left shadow-sm transition active:scale-[0.99] active:border-primary hover:border-primary"
        >
          <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-2xl font-bold text-primary">
            {c.number}
          </span>
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-3 gap-y-1">
            <span className="text-2xl font-bold text-foreground">{c.name}</span>
            {c.official && <OfficialBadge />}
            <span className="basis-full text-lg text-muted-foreground">
              エントリー料金 {formatYen(c.entryFee)}
            </span>
          </span>
          <ChevronRight className="size-8 shrink-0 text-muted-foreground" aria-hidden="true" />
        </button>
      ))}
    </div>
  )
}
