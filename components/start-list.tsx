"use client"

import { ArrowDown, ArrowUp, Check } from "lucide-react"
import { useStore } from "@/lib/store"
import type { StartEntry } from "@/lib/types"

export function StartList({ competitionId, selectedId, onSelect, readOnly = false, showAdminChanges = false, adminReorder = false }: { competitionId: string; selectedId?: string; onSelect?: (entry: StartEntry) => void; readOnly?: boolean; showAdminChanges?: boolean; adminReorder?: boolean }) {
  const { entriesByCompetition, getPlayer, getHorse, getOrg, moveEntry } = useStore()
  const entries = entriesByCompetition(competitionId)
  if (!entries.length) return <p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-8 text-center text-xl text-muted-foreground">この競技の出番はまだありません。</p>
  return <div className="flex flex-col gap-3">{entries.map((e,index)=>{const player=getPlayer(e.playerId),horse=getHorse(e.horseId),org=horse?getOrg(horse.orgId):undefined,selected=selectedId===e.id,Tag=readOnly?"div":"button";return <Tag key={e.id} {...(readOnly?{}:{type:"button" as const,onClick:()=>onSelect?.(e),"aria-pressed":selected})} className={`flex min-h-24 items-center gap-4 rounded-2xl border-2 px-5 py-3 text-left shadow-sm transition ${readOnly?"":"active:scale-[0.99]"} ${selected?"border-primary bg-primary/10 ring-4 ring-primary/25":"border-border bg-card"} ${readOnly?"":"hover:border-primary"}`}>
    <span className="flex size-14 shrink-0 items-center justify-center rounded-xl bg-secondary text-2xl font-bold text-secondary-foreground">{e.order}</span>
    <span className="flex min-w-0 flex-1 flex-col"><span className="mb-1 flex flex-wrap items-center gap-2"><span className={`text-2xl font-bold ${e.withdrawn?"text-destructive line-through":"text-foreground"}`}>{player?.name??"—"} {e.withdrawn&&"【棄権】"}</span>{showAdminChanges&&e.adminChangeMark&&<span className={`rounded-lg px-2.5 py-1 text-base font-bold ${e.adminChangeMark==="added"?"bg-primary text-primary-foreground":"bg-amber-100 text-amber-900"}`}>{e.adminChangeMark==="added"?"追加":"変更"}</span>}</span><span className={`text-xl ${e.withdrawn?"text-destructive line-through":"text-foreground"}`}>馬：{horse?.name??"—"}</span><span className="text-lg text-muted-foreground">{org?.name??"—"}</span></span>
    {adminReorder&&<span className="flex shrink-0 flex-col gap-2"><button type="button" disabled={index===0} onClick={()=>moveEntry(e.id,"up")} className="flex size-11 items-center justify-center rounded-xl border-2 border-border bg-background disabled:opacity-25" aria-label={`${e.order}番を上へ`}><ArrowUp className="size-6"/></button><button type="button" disabled={index===entries.length-1} onClick={()=>moveEntry(e.id,"down")} className="flex size-11 items-center justify-center rounded-xl border-2 border-border bg-background disabled:opacity-25" aria-label={`${e.order}番を下へ`}><ArrowDown className="size-6"/></button></span>}
    {!readOnly&&<span className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${selected?"border-primary bg-primary text-primary-foreground":"border-border"}`} aria-hidden="true">{selected&&<Check className="size-6"/>}</span>}
  </Tag>})}</div>
}
