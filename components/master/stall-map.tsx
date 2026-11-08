"use client"

import {useEffect, useMemo, useRef, type PointerEvent} from 'react'
import {stallLocation, type StallPlan} from '@/lib/master/stall-allocation'
import {stallPlanLegendHtml, stallPlanSvg} from '@/lib/master/stall-allocation-print'

type Props = {
  plan: StallPlan
  eventName: string
  disabled: boolean
  onSelect: (id: string) => void
  onMove: (from: string, to: string) => void
}
type Gesture = {
  pointer: number; plan: StallPlan; source: Element; x: number; y: number
  dragging: boolean; target: Element | null
}
function slotAt(element: EventTarget | null) {
  return element instanceof Element ? element.closest<SVGElement>('[data-slot]') : null
}

export function StallMap({plan, eventName, disabled, onSelect, onMove}: Props) {
  const markup = useMemo(() => ({__html: stallPlanSvg(plan, eventName) + stallPlanLegendHtml(plan)}), [plan, eventName])
  const gesture = useRef<Gesture | null>(null)
  const skipClick = useRef(false)
  const ghost = useRef<HTMLSpanElement>(null)

  function finish() {
    const g = gesture.current
    gesture.current = null
    g?.source.removeAttribute('data-dragging')
    g?.target?.removeAttribute('data-drop-target')
    if (ghost.current) ghost.current.hidden = true
    if (g?.source.hasPointerCapture(g.pointer)) g.source.releasePointerCapture(g.pointer)
  }
  useEffect(() => finish, [plan, disabled])

  function targetAt(e: PointerEvent<HTMLDivElement>) {
    const target = slotAt(document.elementFromPoint(e.clientX, e.clientY))
    return target && e.currentTarget.contains(target) ? target : null
  }
  function start(e: PointerEvent<HTMLDivElement>) {
    if (!e.isPrimary || e.button !== 0) return
    skipClick.current = false
    const source = slotAt(e.target)
    if (!source?.hasAttribute('data-movable') || disabled) return
    source.focus({preventScroll:true})
    source.setPointerCapture(e.pointerId)
    gesture.current = {pointer:e.pointerId, plan, source, x:e.clientX, y:e.clientY, dragging:false, target:null}
  }
  function move(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointer !== e.pointerId || disabled || g.plan !== plan) return
    if (!g.dragging && Math.hypot(g.x - e.clientX, g.y - e.clientY) < 5) return
    g.dragging = true
    skipClick.current = true
    g.source.setAttribute('data-dragging','')
    const target = targetAt(e)
    g.target?.removeAttribute('data-drop-target')
    g.target = target
    if (target !== g.source) target?.setAttribute('data-drop-target','')
    if (ghost.current) {
      ghost.current.textContent = target ? stallLocation(target.dataset.slot) : '移動先の馬房を選択'
      ghost.current.style.left = (e.clientX + 12) + 'px'
      ghost.current.style.top = (e.clientY + 12) + 'px'
      ghost.current.hidden = false
    }
  }
  function drop(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current
    if (!g || g.pointer !== e.pointerId) return
    const from = g.source.getAttribute('data-slot'), to = targetAt(e)?.dataset.slot
    finish()
    if (g.dragging && from && to && from !== to && !disabled && g.plan === plan) onMove(from, to)
  }
  return <>
    <div className="stall-map rounded-lg border bg-white" onPointerDown={start} onPointerMove={move} onPointerUp={drop}
      onPointerCancel={finish} onLostPointerCapture={finish}
      onClick={e => {const id=slotAt(e.target)?.dataset.slot; if (id && !disabled && !skipClick.current) onSelect(id)}}
      onKeyDown={e => {
        if (e.key === 'Escape') {finish(); return}
        const id=slotAt(e.target)?.dataset.slot
        if (id && !disabled && (e.key === 'Enter' || e.key === ' ')) {e.preventDefault(); onSelect(id)}
      }} dangerouslySetInnerHTML={markup}/>
    <span ref={ghost} hidden aria-hidden="true" className="pointer-events-none fixed z-50 rounded bg-slate-900 px-2 py-1 text-sm text-white"/>
  </>
}
