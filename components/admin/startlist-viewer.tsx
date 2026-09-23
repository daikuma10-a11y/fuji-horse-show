"use client"

import { useState } from "react"
import { COMPETITION_DATES } from "@/lib/mock-data"
import { useStore } from "@/lib/store"
import { StartList } from "@/components/start-list"
import { OfficialBadge } from "@/components/official-badge"
import type { CompetitionDate } from "@/lib/types"

export function StartListViewer() {
  const { competitionsByDate, reconciliation } = useStore()
  const [date, setDate] = useState<CompetitionDate>(COMPETITION_DATES[0].value)
  const [compId, setCompId] = useState<string | null>(null)
  const comps = competitionsByDate(date)
  const selected = comps.find(c=>c.id===compId)??null
  const verificationClass=reconciliation.state==="verified"?"border-green-300 bg-green-50 text-green-900":reconciliation.state==="loading"?"border-border bg-muted text-muted-foreground":"border-amber-300 bg-amber-50 text-amber-950"
  return <div className="flex flex-col gap-3">
    <div className={`rounded-lg border px-3 py-2 text-sm font-bold ${verificationClass}`}>DB照合状況：{reconciliation.message}</div>
    <p className="text-sm text-muted-foreground">本部用コンパクト表示です。追加・変更の印を確認しながら、右側の↑↓で出番順を調整できます。</p>
    <div className="flex flex-wrap gap-2">{COMPETITION_DATES.map(d=><button key={d.value} type="button" onClick={()=>{setDate(d.value);setCompId(null)}} className={`min-h-10 rounded-lg border-2 px-3 text-base font-bold transition ${date===d.value?"border-primary bg-primary text-primary-foreground":"border-border bg-card text-foreground"}`}>{d.label}</button>)}</div>
    <div className="flex flex-wrap gap-1.5">{comps.map(c=><button key={c.id} type="button" onClick={()=>setCompId(c.id)} className={`flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-bold transition ${compId===c.id?"border-primary bg-primary/10":"border-border bg-card"}`}><span className="flex size-6 items-center justify-center rounded bg-secondary text-xs text-secondary-foreground">{c.number}</span><span className="max-w-48 truncate">{c.name}</span>{c.official&&<OfficialBadge/>}</button>)}</div>
    {selected?<div><h3 className="mb-2 flex flex-wrap items-center gap-2 text-lg font-bold text-foreground">競技{selected.number}. {selected.name}{selected.official&&<OfficialBadge/>}</h3><StartList competitionId={selected.id} readOnly showAdminChanges adminReorder compact /></div>:<p className="rounded-xl border-2 border-dashed border-border bg-card px-4 py-5 text-center text-base text-muted-foreground">競技を選んでください。</p>}
  </div>
}
