"use client"

import { useState } from "react"
import { COMPETITION_DATES } from "@/lib/mock-data"
import { useStore } from "@/lib/store"
import { StartList } from "@/components/start-list"
import { OfficialBadge } from "@/components/official-badge"
import type { CompetitionDate } from "@/lib/types"

export function StartListViewer() {
  const { competitionsByDate } = useStore()
  const [date, setDate] = useState<CompetitionDate>(COMPETITION_DATES[0].value)
  const [compId, setCompId] = useState<string | null>(null)

  const comps = competitionsByDate(date)
  const selected = comps.find((c) => c.id === compId) ?? null

  return (
    <div className="flex flex-col gap-5">
      <p className="text-lg text-muted-foreground">
        申請を反映した最新の出番表です。日付と競技を選ぶと確認できます。
      </p>

      <div className="flex flex-wrap gap-3">
        {COMPETITION_DATES.map((d) => (
          <button
            key={d.value}
            type="button"
            onClick={() => {
              setDate(d.value)
              setCompId(null)
            }}
            className={`min-h-14 rounded-xl border-2 px-5 text-xl font-bold transition ${
              date === d.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"
            }`}
          >
            {d.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        {comps.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCompId(c.id)}
            className={`flex min-h-14 items-center gap-2 rounded-xl border-2 px-4 text-lg font-bold transition ${
              compId === c.id ? "border-primary bg-primary/10" : "border-border bg-card"
            }`}
          >
            <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-secondary-foreground">
              {c.number}
            </span>
            {c.name}
            {c.official && <OfficialBadge />}
          </button>
        ))}
      </div>

      {selected ? (
        <div>
          <h3 className="mb-3 flex flex-wrap items-center gap-2 text-2xl font-bold text-foreground">
            競技{selected.number}. {selected.name}
            {selected.official && <OfficialBadge />}
          </h3>
          <StartList competitionId={selected.id} readOnly />
        </div>
      ) : (
        <p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-8 text-center text-xl text-muted-foreground">
          競技を選んでください。
        </p>
      )}
    </div>
  )
}
