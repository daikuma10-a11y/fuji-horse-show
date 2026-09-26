"use client"

import { ArrowDown, ArrowUp, Check, GripVertical } from "lucide-react"
import { useEffect, useRef, useState } from "react"
import { useStore } from "@/lib/store"
import { canonicalOrgId } from "@/lib/organization-aliases"
import type { StartEntry } from "@/lib/types"

type DragPreview = { top: number; left: number; width: number; height: number; order: number; player: string; horse: string }

export function StartList({ competitionId, selectedId, onSelect, readOnly = false, showAdminChanges = false, adminReorder = false, compact = false, dense = false, organizationId, hideWithdrawn = false, orderedIds, onReorder }: { competitionId: string; selectedId?: string; onSelect?: (entry: StartEntry) => void; readOnly?: boolean; showAdminChanges?: boolean; adminReorder?: boolean; compact?: boolean; dense?: boolean; organizationId?: string; hideWithdrawn?: boolean; orderedIds?: string[]; onReorder?: (sourceId: string, targetId: string) => void }) {
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
    setDragPreview({ top: bounds.top, left: bounds.left, width: Math.min(bounds.width, Math.max(220, bounds.width * 0.55), 360), height: Math.min(bounds.height, 40), order: entry.order, player: getPlayer(entry.playerId)?.name ?? "—", horse: getHorse(entry.horseId)?.name ?? "—" })
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
  return <div className={`flex flex-col ${compact?(dense?"gap-1 lg:gap-0.5":"gap-1"):"gap-3"}`}>{dense&&<div className={"hidden lg:grid lg:items-center lg:gap-1 border-b-2 border-primary/30 px-1.5 text-[11px] font-bold text-muted-foreground lg:grid-cols-[2rem_minmax(8rem,1.1fr)_9rem_minmax(9rem,1.4fr)_minmax(8rem,1.1fr)_minmax(9rem,1.4fr)_minmax(9rem,1.2fr)_6rem]"}><span>番号</span><span>選手名</span><span>受付</span><span>選手の確認</span><span>馬名</span><span>馬の確認</span><span>所属</span><span>移動</span></div>}{entries.map((e,index)=>{const displayOrder=e.order,player=getPlayer(e.playerId),horse=getHorse(e.horseId),changeLabel=e.adminChangeFields?.length?e.adminChangeFields.map(field=>field==="competition"?"競技":field==="player"?"選手":"馬名").join("・")+"変更":"変更内容要確認",org=e.organizationId?getOrg(e.organizationId):horse?getOrg(horse.orgId):undefined,selected=selectedId===e.id,Tag=readOnly?"div":"button";return <Tag key={e.id} data-start-entry-id={e.id} data-start-reorderable={adminReorder&&!e.withdrawn?"true":undefined} {...(readOnly?{}:{type:"button" as const,onClick:()=>onSelect?.(e),"aria-pressed":selected})} onTouchStart={adminReorder&&onReorder&&!e.withdrawn?event=>{if((event.target as Element).closest("button")||event.touches.length!==1)return;const touch=event.touches[0],row=event.currentTarget;touchOrigin.current={x:touch.clientX,y:touch.clientY};holdTimer.current=window.setTimeout(()=>{holdTimer.current=null;beginDrag(e,row,touch.clientX,touch.clientY)},180)}:undefined} onTouchMove={adminReorder&&onReorder?event=>{const origin=touchOrigin.current,touch=event.touches[0];if(origin&&touch&&Math.hypot(touch.clientX-origin.x,touch.clientY-origin.y)>8)cancelHold()}:undefined} onTouchEnd={adminReorder&&onReorder?cancelHold:undefined} onPointerDown={adminReorder&&onReorder&&!e.withdrawn?event=>{if(event.pointerType==="touch"||event.button!==0||(event.target as Element).closest("button"))return;event.preventDefault();beginDrag(e,event.currentTarget,event.clientX,event.clientY)}:undefined} onContextMenu={adminReorder&&onReorder?event=>event.preventDefault():undefined} className={`flex items-center text-left transition ${dense?"lg:grid lg:gap-1 lg:grid-cols-[2rem_minmax(8rem,1.1fr)_9rem_minmax(9rem,1.4fr)_minmax(8rem,1.1fr)_minmax(9rem,1.4fr)_minmax(9rem,1.2fr)_6rem]":""} ${readOnly?"":"active:scale-[0.99]"} ${compact?(dense?"min-h-12 gap-2 rounded-lg border px-2 py-1 lg:min-h-5 lg:gap-1 lg:rounded-md lg:px-1.5 lg:py-0":"min-h-12 gap-2 rounded-lg border px-2 py-1"):"min-h-24 gap-4 rounded-2xl border-2 px-5 py-3 shadow-sm"} ${selected?"border-primary bg-primary/10 ring-4 ring-primary/25":"border-border bg-card"} ${draggingId===e.id?"border-primary border-dashed bg-primary/10 opacity-70":""} ${hoveringId===e.id?"border-primary bg-blue-50 ring-2 ring-primary/50":""} ${adminReorder&&onReorder&&!e.withdrawn?"select-none cursor-grab":""} ${readOnly?"":"hover:border-primary"} ${dense?"lg:even:bg-blue-50/40":""}`}>
    <span className={`flex shrink-0 items-center justify-center bg-secondary font-bold text-secondary-foreground ${compact?(dense?"size-8 rounded-md text-base lg:size-5 lg:rounded-sm lg:text-xs":"size-8 rounded-md text-base"):"size-14 rounded-xl text-2xl"}`}>{displayOrder}</span>
    <span className={`flex min-w-0 flex-1 ${dense?"lg:contents":""} ${compact?"flex-col gap-1 sm:flex-row sm:items-center sm:gap-2":"flex-col"}`}>
      <span className={`flex min-w-0 flex-wrap items-center gap-1 ${dense?"lg:contents":""}`}>
        <span className={`min-w-0 truncate font-bold ${compact?(dense?"text-base lg:text-xs":"text-base"):"text-2xl"} ${e.withdrawn?"text-destructive":"text-foreground"}`}>{player?.name??"—"}</span>
        <span className={dense?"min-w-0 truncate lg:flex lg:h-5 lg:items-center lg:leading-none":"min-w-0 truncate"}>{e.withdrawn?<span className="rounded-md bg-destructive px-1 font-bold text-white lg:text-[10px]">棄権</span>:showAdminChanges&&e.adminChangeMark&&<span className={`rounded-md px-1 font-bold ${e.adminChangeMark==="added"?"bg-primary text-primary-foreground":"bg-violet-700 text-white"} ${dense?"text-xs lg:text-[10px]":"text-base"}`}>{e.adminChangeMark==="added"?"追加":changeLabel}</span>}</span>
        <span className={`flex min-w-0 flex-wrap items-center gap-1 ${dense?"lg:flex-nowrap lg:overflow-hidden":""}`}>
          {riderGaps.has(e.id)&&<span className={`rounded-md bg-amber-100 font-bold text-amber-950 ${dense?"px-1 text-xs lg:truncate lg:text-[10px]":"px-2 py-1 text-base"}`}>選手：間に{riderGaps.get(e.id)}頭（要確認）</span>}
          {e.needsAffiliationReview&&<span className={`rounded-md bg-amber-100 font-bold text-amber-950 ${dense?"px-1 text-xs lg:truncate lg:text-[10px]":"px-2 py-1 text-base"}`}>所属要確認</span>}
        </span>
      </span>
      <span className={`flex min-w-0 flex-wrap items-center gap-1 ${dense?"lg:contents":""} ${compact?"text-sm lg:text-xs":"text-xl"} ${e.withdrawn?"text-destructive":"text-foreground"}`}>
        <span className="min-w-0 truncate">{compact?horse?.name??"—":`馬：${horse?.name??"—"}`}</span>
        <span className="min-w-0 truncate">{horseGaps.has(e.id)&&<span className={`rounded-md bg-sky-100 px-1 font-bold text-sky-950 ${dense?"text-xs lg:text-[10px]":"text-base"}`}>馬：間に{horseGaps.get(e.id)}頭（要確認）</span>}</span>
      </span>
      <span className={`${dense?"hidden lg:block":"hidden xl:block"} min-w-0 truncate text-muted-foreground ${dense?"lg:text-[11px]":"text-xs"}`}>{org?.name??"—"}</span>
    </span>
    {adminReorder&&<span className={`flex shrink-0 items-center ${compact?"gap-1":"gap-2"}`}>
      {!e.withdrawn&&onReorder&&<button type="button" aria-label={`${displayOrder}番 ${player?.name??""}を押したまま移動`} title="押したまま上下に動かす" onTouchStart={event=>{event.stopPropagation();const touch=event.touches[0];if(!touch)return;beginDrag(e,event.currentTarget.closest<HTMLElement>("[data-start-entry-id]"),touch.clientX,touch.clientY)}} onPointerDown={event=>{event.stopPropagation();if(event.pointerType==="touch"||event.button!==0)return;event.preventDefault();beginDrag(e,event.currentTarget.closest<HTMLElement>("[data-start-entry-id]"),event.clientX,event.clientY)}} onContextMenu={event=>event.preventDefault()} className={`flex touch-none select-none items-center justify-center rounded-md border-2 border-primary/50 bg-primary/10 text-primary ${draggingId===e.id?"ring-2 ring-primary":""} ${compact?(dense?"size-11 lg:size-5":"size-11"):"size-12"}`}><GripVertical className={dense?"size-6 lg:size-3":"size-6"}/></button>}
      <span className={`flex ${compact?"gap-1":"flex-col gap-2"}`}><button type="button" disabled={reorderSaving||e.withdrawn||index===0} onClick={()=>onReorder?onReorder(e.id,entries[index-1].id):void moveEntry(e.id,"up")} className={`flex items-center justify-center border-2 border-border bg-background disabled:opacity-25 ${compact?(dense?"size-8 rounded-md lg:size-5 lg:rounded-sm":"size-8 rounded-md"):"size-11 rounded-xl"}`} aria-label={`${displayOrder}番を上へ`}><ArrowUp className={compact?(dense?"size-4 lg:size-3":"size-4"):"size-6"}/></button><button type="button" disabled={reorderSaving||e.withdrawn||index===activeEntries.length-1} onClick={()=>onReorder?onReorder(e.id,entries[index+1].id):void moveEntry(e.id,"down")} className={`flex items-center justify-center border-2 border-border bg-background disabled:opacity-25 ${compact?(dense?"size-8 rounded-md lg:size-5 lg:rounded-sm":"size-8 rounded-md"):"size-11 rounded-xl"}`} aria-label={`${displayOrder}番を下へ`}><ArrowDown className={compact?"size-4":"size-6"}/></button></span>
    </span>}
    {!readOnly&&<span className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${selected?"border-primary bg-primary text-primary-foreground":"border-border"}`} aria-hidden="true">{selected&&<Check className="size-6"/>}</span>}
  </Tag>})}
    {dragPreview && <div ref={previewElement} data-drag-preview aria-hidden="true" className="pointer-events-none fixed z-50 flex items-center gap-2 rounded-lg border-2 border-primary bg-card/95 px-2 py-1 text-foreground shadow-lg" style={{ top: dragPreview.top, left: dragPreview.left, width: dragPreview.width, minHeight: dragPreview.height }}>
      <span className="flex size-7 shrink-0 items-center justify-center rounded bg-primary text-xs font-bold text-primary-foreground">{dragPreview.order}</span>
      <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold leading-tight">{dragPreview.player}</span><span className="block truncate text-xs leading-tight">{dragPreview.horse}</span></span>
      <GripVertical className="size-4 shrink-0 text-primary" />
    </div>}
  </div>
}
