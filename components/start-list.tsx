"use client"

import { ArrowDown, ArrowUp, Check, GripVertical } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useStore } from "@/lib/store"
import { canonicalOrgId } from "@/lib/organization-aliases"
import type { StartEntry } from "@/lib/types"

type DragPreview = { top: number; left: number; width: number; height: number; order: number; player: string; horse: string }

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
  const hoverId = useRef<string | null>(null)
  const [hoveringId, setHoveringId] = useState<string | null>(null)
  const [dragPreview, setDragPreview] = useState<DragPreview | null>(null)
  const previewElement = useRef<HTMLDivElement | null>(null)
  const dragStartY = useRef(0)
  const holdTimer = useRef<number | null>(null)
  const touchOrigin = useRef<{ x: number; y: number } | null>(null)
  const cancelHold = () => {
    if (holdTimer.current !== null) window.clearTimeout(holdTimer.current)
    holdTimer.current = null
    touchOrigin.current = null
  }
  const beginDrag = (entry: StartEntry, row: HTMLElement | null, x: number, y: number) => {
    if (!row) return
    const bounds = row.getBoundingClientRect()
    dragId.current = entry.id
    dragStartY.current = y
    pointer.current = { x, y }
    setDragPreview({ top: bounds.top, left: bounds.left, width: bounds.width, height: bounds.height, order: entry.order, player: getPlayer(entry.playerId)?.name ?? "—", horse: getHorse(entry.horseId)?.name ?? "—" })
    setDraggingId(entry.id)
  }
  useEffect(() => {
    if (!draggingId || !onReorder) return
    // iPhone では行の入れ替え時にボタンの pointer capture が外れるため、移動は画面全体で追跡する。
    const updateTarget = (x: number, y: number) => {
      const row = document.elementFromPoint(x, y)?.closest<HTMLElement>("[data-start-entry-id]")
      const target = row?.dataset.startEntryId
      const next = row?.dataset.startReorderable === "true" && target !== dragId.current ? target ?? null : null
      if (next !== hoverId.current) { hoverId.current = next; setHoveringId(next) }
    }
    const movePreview = (y: number) => { if (previewElement.current) previewElement.current.style.transform = "translate3d(0, " + (y - dragStartY.current) + "px, 0)" }
    const moveTouch = (event: TouchEvent) => {
      if (event.cancelable) event.preventDefault()
      const touch = event.touches[0]
      if (touch) { pointer.current = { x: touch.clientX, y: touch.clientY }; movePreview(touch.clientY); updateTarget(touch.clientX, touch.clientY) }
    }
    const movePointer = (event: PointerEvent) => {
      if (event.pointerType !== "touch") { pointer.current = { x: event.clientX, y: event.clientY }; movePreview(event.clientY); updateTarget(event.clientX, event.clientY) }
    }
    const finish = () => { const source = dragId.current, target = hoverId.current; dragId.current = null; hoverId.current = null; pointer.current = null; setDraggingId(null); setHoveringId(null); setDragPreview(null); cancelHold(); if (source && target) onReorder(source, target) }
    window.addEventListener("touchmove", moveTouch, { passive: false })
    window.addEventListener("touchend", finish)
    window.addEventListener("touchcancel", finish)
    window.addEventListener("pointermove", movePointer)
    const finishPointer = (event: PointerEvent) => { if (event.pointerType !== "touch") finish() }
    window.addEventListener("pointerup", finishPointer)
    window.addEventListener("pointercancel", finishPointer)
    const timer = window.setInterval(() => {
      const point = pointer.current
      if (!point) return
      if (point.y < 48) window.scrollBy(0, -6)
      if (point.y > window.innerHeight - 48) window.scrollBy(0, 6)
      updateTarget(point.x, point.y)
    }, 70)
    return () => {
      window.clearInterval(timer)
      window.removeEventListener("touchmove", moveTouch)
      window.removeEventListener("touchend", finish)
      window.removeEventListener("touchcancel", finish)
      window.removeEventListener("pointermove", movePointer)
      window.removeEventListener("pointerup", finishPointer)
      window.removeEventListener("pointercancel", finishPointer)
    }
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
  return <div className={`flex flex-col ${compact?"gap-1":"gap-3"}`}>{entries.map((e,index)=>{const displayOrder=e.order,player=getPlayer(e.playerId),horse=getHorse(e.horseId),org=e.organizationId?getOrg(e.organizationId):horse?getOrg(horse.orgId):undefined,selected=selectedId===e.id,Tag=readOnly?"div":"button";return <Tag key={e.id} data-start-entry-id={e.id} data-start-reorderable={adminReorder&&!e.withdrawn?"true":undefined} {...(readOnly?{}:{type:"button" as const,onClick:()=>onSelect?.(e),"aria-pressed":selected})} onTouchStart={adminReorder&&onReorder&&!e.withdrawn?event=>{if((event.target as Element).closest("button")||event.touches.length!==1)return;const touch=event.touches[0],row=event.currentTarget;touchOrigin.current={x:touch.clientX,y:touch.clientY};holdTimer.current=window.setTimeout(()=>{holdTimer.current=null;beginDrag(e,row,touch.clientX,touch.clientY)},180)}:undefined} onTouchMove={adminReorder&&onReorder?event=>{const origin=touchOrigin.current,touch=event.touches[0];if(origin&&touch&&Math.hypot(touch.clientX-origin.x,touch.clientY-origin.y)>8)cancelHold()}:undefined} onTouchEnd={adminReorder&&onReorder?cancelHold:undefined} onPointerDown={adminReorder&&onReorder&&!e.withdrawn?event=>{if(event.pointerType==="touch"||event.button!==0||(event.target as Element).closest("button"))return;event.preventDefault();beginDrag(e,event.currentTarget,event.clientX,event.clientY)}:undefined} onContextMenu={adminReorder&&onReorder?event=>event.preventDefault():undefined} className={`flex items-center text-left transition ${readOnly?"":"active:scale-[0.99]"} ${compact?"min-h-12 gap-2 rounded-lg border px-2 py-1":"min-h-24 gap-4 rounded-2xl border-2 px-5 py-3 shadow-sm"} ${selected?"border-primary bg-primary/10 ring-4 ring-primary/25":"border-border bg-card"} ${draggingId===e.id?"border-primary border-dashed bg-primary/10 opacity-40":""} ${hoveringId===e.id?"border-primary bg-blue-50 ring-2 ring-primary/50":""} ${adminReorder&&onReorder&&!e.withdrawn?"select-none cursor-grab":""} ${readOnly?"":"hover:border-primary"}`}>
    <span className={`flex shrink-0 items-center justify-center bg-secondary font-bold text-secondary-foreground ${compact?"size-8 rounded-md text-base":"size-14 rounded-xl text-2xl"}`}>{displayOrder}</span>
    <span className={`flex min-w-0 flex-1 ${compact?"flex-col gap-1 sm:flex-row sm:items-center sm:gap-2":"flex-col"}`}><span className={`${compact?"flex min-w-0 flex-wrap items-center gap-1":"mb-1 flex flex-wrap items-center gap-2"}`}><span className={`font-bold ${compact?"truncate text-base":"text-2xl"} ${e.withdrawn?"text-destructive":"text-foreground"}`}>{player?.name??"—"} {e.withdrawn&&"【棄権】"}</span>{riderGaps.has(e.id)&&<span className={`shrink-0 rounded-md bg-amber-100 font-bold text-amber-950 ${compact?"px-1.5 py-0.5 text-xs":"px-2.5 py-1 text-base"}`}>選手：間に{riderGaps.get(e.id)}頭（要確認）</span>}{e.needsAffiliationReview&&<span className={`shrink-0 rounded-md bg-amber-100 font-bold text-amber-950 ${compact?"px-1.5 py-0.5 text-xs":"px-2.5 py-1 text-base"}`}>所属要確認</span>}{showAdminChanges&&e.adminChangeMark&&<span className={`shrink-0 rounded-md font-bold ${compact?"px-1.5 py-0.5 text-xs":"px-2.5 py-1 text-base"} ${e.adminChangeMark==="added"?"bg-primary text-primary-foreground":"bg-violet-700 text-white"}`}>{e.adminChangeMark==="added"?"追加":"変更反映"}</span>}</span><span className={`flex min-w-0 flex-1 flex-wrap items-center gap-1 ${compact?"text-sm":"text-xl"} ${e.withdrawn?"text-destructive":"text-foreground"}`}><span className="min-w-0 truncate">{compact?horse?.name??"—":`馬：${horse?.name??"—"}`}</span>{horseGaps.has(e.id)&&<span className={`shrink-0 rounded-md bg-sky-100 font-bold text-sky-950 ${compact?"px-1.5 py-0.5 text-xs":"px-2.5 py-1 text-base"}`}>馬：間に{horseGaps.get(e.id)}頭（要確認）</span>}</span><span className={`${compact?"hidden xl:block max-w-48 truncate text-xs":"text-lg"} text-muted-foreground`}>{org?.name??"—"}</span></span>
    {adminReorder&&<span className={`flex shrink-0 items-center ${compact?"gap-1":"gap-2"}`}>
      {!e.withdrawn&&onReorder&&<button type="button" aria-label={`${displayOrder}番 ${player?.name??""}を押したまま移動`} title="押したまま上下に動かす" onTouchStart={event=>{event.stopPropagation();const touch=event.touches[0];if(!touch)return;beginDrag(e,event.currentTarget.closest<HTMLElement>("[data-start-entry-id]"),touch.clientX,touch.clientY)}} onPointerDown={event=>{event.stopPropagation();if(event.pointerType==="touch"||event.button!==0)return;event.preventDefault();beginDrag(e,event.currentTarget.closest<HTMLElement>("[data-start-entry-id]"),event.clientX,event.clientY)}} onContextMenu={event=>event.preventDefault()} className={`flex touch-none select-none items-center justify-center rounded-md border-2 border-primary/50 bg-primary/10 text-primary ${draggingId===e.id?"ring-2 ring-primary":""} ${compact?"size-11":"size-12"}`}><GripVertical className="size-6"/></button>}
      <span className={`flex ${compact?"gap-1":"flex-col gap-2"}`}><button type="button" disabled={reorderSaving||e.withdrawn||index===0} onClick={()=>onReorder?onReorder(e.id,entries[index-1].id):void moveEntry(e.id,"up")} className={`flex items-center justify-center border-2 border-border bg-background disabled:opacity-25 ${compact?"size-8 rounded-md":"size-11 rounded-xl"}`} aria-label={`${displayOrder}番を上へ`}><ArrowUp className={compact?"size-4":"size-6"}/></button><button type="button" disabled={reorderSaving||e.withdrawn||index===activeEntries.length-1} onClick={()=>onReorder?onReorder(e.id,entries[index+1].id):void moveEntry(e.id,"down")} className={`flex items-center justify-center border-2 border-border bg-background disabled:opacity-25 ${compact?"size-8 rounded-md":"size-11 rounded-xl"}`} aria-label={`${displayOrder}番を下へ`}><ArrowDown className={compact?"size-4":"size-6"}/></button></span>
    </span>}
    {!readOnly&&<span className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${selected?"border-primary bg-primary text-primary-foreground":"border-border"}`} aria-hidden="true">{selected&&<Check className="size-6"/>}</span>}
  </Tag>})}
    {dragPreview && <div ref={previewElement} data-drag-preview aria-hidden="true" className="pointer-events-none fixed z-50 flex items-center gap-3 rounded-xl border-2 border-primary bg-card px-3 py-2 text-foreground shadow-2xl" style={{ top: dragPreview.top, left: dragPreview.left, width: dragPreview.width, minHeight: dragPreview.height }}>
      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary text-lg font-bold text-primary-foreground">{dragPreview.order}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-lg font-bold">{dragPreview.player}</span><span className="block truncate text-sm">{dragPreview.horse}</span></span>
      <GripVertical className="size-6 shrink-0 text-primary" />
    </div>}
  </div>
}
