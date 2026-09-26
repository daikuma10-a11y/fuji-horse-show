"use client"

import { ArrowDown, ArrowUp, Check, GripVertical } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useStore } from "@/lib/store"
import { canonicalOrgId } from "@/lib/organization-aliases"
import type { StartEntry } from "@/lib/types"

export function StartList({ competitionId, selectedId, onSelect, readOnly = false, showAdminChanges = false, adminReorder = false, compact = false, organizationId, hideWithdrawn = false, orderedIds, onReorder }: { competitionId: string; selectedId?: string; onSelect?: (entry: StartEntry) => void; readOnly?: boolean; showAdminChanges?: boolean; adminReorder?: boolean; compact?: boolean; organizationId?: string; hideWithdrawn?: boolean; orderedIds?: string[]; onReorder?: (sourceId: string, targetId: string) => void }) {
  const { entriesByCompetition, getPlayer, getHorse, getOrg, moveEntry, reorderSaving } = useStore()
  const baseEntries = entriesByCompetition(competitionId).filter(entry => {
    if (hideWithdrawn && entry.withdrawn) return false
    if (!organizationId) return true
    const orgId = entry.organizationId ?? getHorse(entry.horseId)?.orgId
    return !!orgId && canonicalOrgId(orgId) === organizationId
  })
  const dragId = useRef<string | null>(null)
  const pointer = useRef<{ x: number; y: number } | null>(null)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  useEffect(() => {
    if (!draggingId || !onReorder) return
    const timer = window.setInterval(() => {
      const point = pointer.current
      if (!point) return
      if (point.y < 100) window.scrollBy(0, -18)
      if (point.y > window.innerHeight - 100) window.scrollBy(0, 18)
      const target = document.elementFromPoint(point.x, point.y)?.closest<HTMLElement>("[data-start-entry-id]")?.dataset.startEntryId
      if (target && target !== dragId.current) onReorder(draggingId, target)
    }, 70)
    return () => window.clearInterval(timer)
  }, [draggingId, onReorder])
  const orderIndex = new Map(orderedIds?.map((id, index) => [id, index]) ?? [])
  const entries = orderedIds
    ? [...baseEntries].sort((a, b) => (orderIndex.get(a.id) ?? Infinity) - (orderIndex.get(b.id) ?? Infinity) || a.order - b.order)
        .map((entry, index) => ({ ...entry, order: index + 1 }))
    : baseEntries
  const riderGaps = new Map<string, number>()
  const horseGaps = new Map<string, number>()
  const recordGap = (gaps: Map<string, number>, first: StartEntry, second: StartEntry) => {
    const between = Math.max(0, second.order - first.order - 1)
    for (const id of [first.id, second.id]) {
      gaps.set(id, Math.min(gaps.get(id) ?? Infinity, between))
    }
  }
  const activeEntries = entries.filter(entry => !entry.withdrawn)
  const previousByRider = new Map<string, StartEntry>()
  const previousByHorse = new Map<string, StartEntry>()
  for (const current of activeEntries) {
    const previousRider = previousByRider.get(current.playerId)
    // 間に別の選手が一組入っても、同じ選手の出番が近いことを知らせる。
    if (previousRider && current.order - previousRider.order <= 2) {
      recordGap(riderGaps, previousRider, current)
    }
    previousByRider.set(current.playerId, current)
    const previousHorse = previousByHorse.get(current.horseId)
    if (previousHorse && current.order - previousHorse.order <= 5) {
      recordGap(horseGaps, previousHorse, current)
    }
    previousByHorse.set(current.horseId, current)
  }
  if (!entries.length) return <p className={`rounded-2xl border-2 border-dashed border-border bg-card text-center text-muted-foreground ${compact?"px-3 py-4 text-base":"px-5 py-8 text-xl"}`}>この競技の出番はまだありません。</p>
  return <div className={`flex flex-col ${compact?"gap-1":"gap-3"}`}>{entries.map((e,index)=>{const displayOrder=e.order,player=getPlayer(e.playerId),horse=getHorse(e.horseId),org=e.organizationId?getOrg(e.organizationId):horse?getOrg(horse.orgId):undefined,selected=selectedId===e.id,Tag=readOnly?"div":"button";return <Tag key={e.id} data-start-entry-id={e.id} {...(readOnly?{}:{type:"button" as const,onClick:()=>onSelect?.(e),"aria-pressed":selected})} className={`flex items-center text-left transition ${readOnly?"":"active:scale-[0.99]"} ${compact?"min-h-12 gap-2 rounded-lg border px-2 py-1":"min-h-24 gap-4 rounded-2xl border-2 px-5 py-3 shadow-sm"} ${selected?"border-primary bg-primary/10 ring-4 ring-primary/25":"border-border bg-card"} ${readOnly?"":"hover:border-primary"}`}>
    <span className={`flex shrink-0 items-center justify-center bg-secondary font-bold text-secondary-foreground ${compact?"size-8 rounded-md text-base":"size-14 rounded-xl text-2xl"}`}>{displayOrder}</span>
    <span className={`flex min-w-0 flex-1 ${compact?"flex-col gap-1 sm:flex-row sm:items-center sm:gap-2":"flex-col"}`}><span className={`${compact?"flex min-w-0 flex-wrap items-center gap-1":"mb-1 flex flex-wrap items-center gap-2"}`}><span className={`font-bold ${compact?"truncate text-base":"text-2xl"} ${e.withdrawn?"text-destructive":"text-foreground"}`}>{player?.name??"—"} {e.withdrawn&&"【棄権】"}</span>{riderGaps.has(e.id)&&<span className={`shrink-0 rounded-md bg-amber-100 font-bold text-amber-950 ${compact?"px-1.5 py-0.5 text-xs":"px-2.5 py-1 text-base"}`}>選手：間に{riderGaps.get(e.id)}頭（要確認）</span>}{horseGaps.has(e.id)&&<span className={`shrink-0 rounded-md bg-sky-100 font-bold text-sky-950 ${compact?"px-1.5 py-0.5 text-xs":"px-2.5 py-1 text-base"}`}>馬：間に{horseGaps.get(e.id)}頭（要確認）</span>}{e.needsAffiliationReview&&<span className={`shrink-0 rounded-md bg-amber-100 font-bold text-amber-950 ${compact?"px-1.5 py-0.5 text-xs":"px-2.5 py-1 text-base"}`}>所属要確認</span>}{showAdminChanges&&e.adminChangeMark&&<span className={`shrink-0 rounded-md font-bold ${compact?"px-1.5 py-0.5 text-xs":"px-2.5 py-1 text-base"} ${e.adminChangeMark==="added"?"bg-primary text-primary-foreground":"bg-amber-100 text-amber-900"}`}>{e.adminChangeMark==="added"?"追加":"変更"}</span>}</span><span className={`${compact?"min-w-0 flex-1 truncate text-sm":"text-xl"} ${e.withdrawn?"text-destructive":"text-foreground"}`}>{compact?horse?.name??"—":`馬：${horse?.name??"—"}`}</span><span className={`${compact?"hidden xl:block max-w-48 truncate text-xs":"text-lg"} text-muted-foreground`}>{org?.name??"—"}</span></span>
    {adminReorder&&<span className={`flex shrink-0 items-center ${compact?"gap-1":"gap-2"}`}>
      {!e.withdrawn&&onReorder&&<button type="button" aria-label={`${displayOrder}番 ${player?.name??""}を長押しして移動`} title="ここを押して上下に動かす" onPointerDown={event=>{if(event.button!==0)return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);dragId.current=e.id;pointer.current={x:event.clientX,y:event.clientY};setDraggingId(e.id)}} onPointerMove={event=>{if(dragId.current===e.id)pointer.current={x:event.clientX,y:event.clientY}}} onPointerUp={()=>{dragId.current=null;pointer.current=null;setDraggingId(null)}} onPointerCancel={()=>{dragId.current=null;pointer.current=null;setDraggingId(null)}} className={`flex touch-none items-center justify-center rounded-md border-2 border-primary/50 bg-primary/10 text-primary ${draggingId===e.id?"ring-2 ring-primary":""} ${compact?"size-10":"size-12"}`}><GripVertical className="size-6"/></button>}
      <span className={`flex ${compact?"gap-1":"flex-col gap-2"}`}><button type="button" disabled={reorderSaving||e.withdrawn||index===0} onClick={()=>onReorder?onReorder(e.id,entries[index-1].id):void moveEntry(e.id,"up")} className={`flex items-center justify-center border-2 border-border bg-background disabled:opacity-25 ${compact?"size-8 rounded-md":"size-11 rounded-xl"}`} aria-label={`${displayOrder}番を上へ`}><ArrowUp className={compact?"size-4":"size-6"}/></button><button type="button" disabled={reorderSaving||e.withdrawn||index===activeEntries.length-1} onClick={()=>onReorder?onReorder(e.id,entries[index+1].id):void moveEntry(e.id,"down")} className={`flex items-center justify-center border-2 border-border bg-background disabled:opacity-25 ${compact?"size-8 rounded-md":"size-11 rounded-xl"}`} aria-label={`${displayOrder}番を下へ`}><ArrowDown className={compact?"size-4":"size-6"}/></button></span>
    </span>}
    {!readOnly&&<span className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${selected?"border-primary bg-primary text-primary-foreground":"border-border"}`} aria-hidden="true">{selected&&<Check className="size-6"/>}</span>}
  </Tag>})}</div>
}
