"use client"

import { CalendarDays } from "lucide-react"
import { COMPETITION_DATES } from "@/lib/mock-data"
import type { CompetitionDate } from "@/lib/types"

export function DateSelect({ onSelect }: { onSelect: (date: CompetitionDate) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {COMPETITION_DATES.map((d) => (
        <button
          key={d.value}
          type="button"
          onClick={() => onSelect(d.value)}
          className="flex min-h-24 items-center gap-4 rounded-2xl border-2 border-border bg-card px-6 text-left shadow-sm transition active:scale-[0.99] active:border-primary hover:border-primary"
        >
          <CalendarDays className="size-10 shrink-0 text-primary" aria-hidden="true" />
          <span className="text-3xl font-bold text-foreground">{d.label}</span>
        </button>
      ))}
    </div>
  )
}
