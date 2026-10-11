"use client"

import { useEffect, useRef } from 'react'
import { isMonitorReport, type MonitorReport } from '@/lib/monitor-link'

// Local messages only: the preview and audience window share this PC and origin.
export function useMonitorLink(input: { competition: string; ready: boolean; pending: boolean; fontSize: number; setFontSize: (size: number) => void }) {
 const latest = useRef(input)
 const channel = useRef<BroadcastChannel | null>(null)
 const applyingUntil = useRef(0)
 useEffect(() => { latest.current = input }, [input.competition,input.ready,input.pending,input.fontSize,input.setFontSize])
 useEffect(() => {
  let dispose: (() => void) | undefined
  const connect = () => {
   dispose?.()
   const token = window.location.hash.slice(1)
   if (!/^fhs-(startlist|meeting)-[a-f0-9-]{36}$/.test(token) || typeof BroadcastChannel === 'undefined') return
   const controller = new URLSearchParams(window.location.search).get('control') === '1' && window.parent !== window
   const link = new BroadcastChannel(token); channel.current = link
   const report = () => {
    const state = latest.current
    const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-monitor-competition]')).filter(element => { const rect=element.getBoundingClientRect(); return rect.bottom > 80 && rect.top < window.innerHeight }).map(element => element.dataset.monitorCompetition)
    const status: MonitorReport = { kind:'monitor-status', competition: visible.length ? visible.join(' ／ ') : state.competition, pending:state.pending, ready:state.ready, fullscreen:!!document.fullscreenElement, hidden:document.visibilityState==='hidden', width:window.innerWidth,height:window.innerHeight,x:window.scrollX,y:window.scrollY,fontSize:state.fontSize }
    link.postMessage(status)
   }
   const scroll = () => {
    if (controller) { if (Date.now() >= applyingUntil.current) link.postMessage({ kind:'monitor-scroll',x:window.scrollX,y:window.scrollY }) }
    else report()
   }
   link.onmessage = event => {
    const data=event.data
    if (controller && isMonitorReport(data)) {
     latest.current.setFontSize(data.fontSize)
     if (Math.abs(window.scrollY-data.y)>1 || Math.abs(window.scrollX-data.x)>1) { applyingUntil.current=Date.now()+250; window.scrollTo({left:data.x,top:data.y,behavior:'instant'}) }
    } else if (!controller && data?.kind==='monitor-scroll' && Number.isFinite(data.x) && Number.isFinite(data.y) && data.x>=0 && data.y>=0) {
     window.scrollTo({left:data.x,top:data.y,behavior:'instant'}); report()
    } else if (!controller && data?.kind==='monitor-font' && Number.isFinite(data.size) && data.size>=12 && data.size<=24) latest.current.setFontSize(data.size)
   }
   const timer=window.setInterval(() => { if (!controller) report() },2000)
   window.addEventListener('scroll',scroll,{passive:true}); window.addEventListener('resize',scroll); document.addEventListener('fullscreenchange',scroll)
   if (!controller) report()
   dispose=() => { window.clearInterval(timer); window.removeEventListener('scroll',scroll); window.removeEventListener('resize',scroll); document.removeEventListener('fullscreenchange',scroll); link.close(); channel.current=null }
  }
  connect(); window.addEventListener('hashchange',connect)
  return () => { dispose?.();window.removeEventListener('hashchange',connect) }
 }, [])
 return (size: number) => { input.setFontSize(size); if (window.parent!==window) channel.current?.postMessage({kind:'monitor-font',size}) }
}
