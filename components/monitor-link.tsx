"use client"

import { useEffect, useRef } from 'react'
import { displayChannelName, isPresentationDisplay } from '@/lib/monitor-presentation'
import { isMonitorReport, type MonitorReport } from '@/lib/monitor-link'

// Local messages only: the preview and audience window share this PC and origin.
type DisplayLink = {
 competition: string; ready: boolean; pending: boolean
 fontSize?: number; setFontSize?: (size: number) => void
 onPreviewScroll?: (position:{y:number;extent:number;fraction:number})=>void
 onLocalCommand?: ()=>void
 channelName?: string; onAudienceReport?: (report: MonitorReport) => void
}
export function useMonitorLink(input: DisplayLink) {
 const latest = useRef(input)
 const channel = useRef<BroadcastChannel | null>(null)
 useEffect(() => { latest.current = input }, [input.competition,input.ready,input.pending,input.fontSize,input.setFontSize,input.onAudienceReport,input.onPreviewScroll,input.onLocalCommand])
 useEffect(() => {
  let dispose: (() => void) | undefined
  const connect = () => {
   dispose?.()
   const token = input.channelName ?? window.location.hash.slice(1)
   if ((!input.channelName && !/^fhs-(startlist|meeting)-[a-f0-9-]{36}$/.test(token)) || typeof BroadcastChannel === 'undefined') return
   const controller = new URLSearchParams(window.location.search).get('control') === '1' && window.parent !== window
   const client = crypto.randomUUID()
   const root=document.documentElement
   const oldOverscroll=root?.style.overscrollBehavior
   if(controller&&root)root.style.overscrollBehavior='contain'
   let sequence=0, waitingSince=0
   let applied: {x:number;y:number}|null=null
   let ack: {client:string;sequence:number}|null=null
   const link = new BroadcastChannel(displayChannelName(token)); channel.current = link
   const report = () => {
    const state = latest.current
    const visible = Array.from(document.querySelectorAll<HTMLElement>('[data-monitor-competition]')).filter(element => { const rect=element.getBoundingClientRect(); return rect.bottom > 80 && rect.top < window.innerHeight }).map(element => element.dataset.monitorCompetition)
    const status: MonitorReport = { kind:'monitor-status', competition: visible.length ? visible.join(' ／ ') : state.competition, pending:state.pending, ready:state.ready, fullscreen:isPresentationDisplay()||!!document.fullscreenElement||window.matchMedia?.('(display-mode: fullscreen)').matches===true, hidden:document.visibilityState==='hidden', width:window.innerWidth,height:window.innerHeight,x:window.scrollX,y:window.scrollY,fontSize:state.fontSize ?? 18 }
    link.postMessage({...status,ack})
   }
   const scroll = () => {
    if (!controller) {report();return}
    if (applied && Math.abs(window.scrollX-applied.x)<=1 && Math.abs(window.scrollY-applied.y)<=1) return
    applied=null
    const x=window.scrollX,y=Math.max(0,window.scrollY)
    sequence++;waitingSince=Date.now()
    link.postMessage({kind:'monitor-scroll',x,y,client,sequence})
    if(latest.current.onPreviewScroll){
     const extent=Math.max(0,(document.scrollingElement?.scrollHeight??0)-window.innerHeight)
     if(extent>0)latest.current.onPreviewScroll({y:Math.min(y,extent),extent,fraction:Math.min(1,y/extent)})
    }
   }
   link.onmessage = event => {
    const data=event.data
    if (controller && isMonitorReport(data)) {

     latest.current.onAudienceReport?.(data)
     latest.current.setFontSize?.(data.fontSize)
     const receipt=event.data.ack
     if(waitingSince && Date.now()-waitingSince<2000 && !(receipt?.client===client&&receipt.sequence===sequence))return
     waitingSince=0
     if (Math.abs(window.scrollY-data.y)>1 || Math.abs(window.scrollX-data.x)>1) {
      applied={x:data.x,y:data.y}
      window.scrollTo({left:data.x,top:data.y,behavior:'instant'})
      applied={x:window.scrollX,y:window.scrollY}
     }
    } else if (!controller && data?.kind==='monitor-query') {
     report()
    } else if (!controller && data?.kind==='monitor-scroll' && Number.isFinite(data.x) && Number.isFinite(data.y) && data.x>=0 && data.y>=0) {
     if(typeof data.client==='string'&&Number.isSafeInteger(data.sequence))ack={client:data.client,sequence:data.sequence}
     latest.current.onLocalCommand?.()
     window.scrollTo({left:data.x,top:data.y,behavior:'instant'}); report()
    } else if (!controller && data?.kind==='monitor-font' && Number.isFinite(data.size) && data.size>=12 && data.size<=24) latest.current.setFontSize?.(data.size)
   }
   const timer=window.setInterval(() => { if (!controller) report() },2000)
   const displayChanged = () => { if (!controller) report() }
   window.addEventListener('scroll',scroll,{passive:true}); window.addEventListener('resize',displayChanged); document.addEventListener('fullscreenchange',displayChanged); document.addEventListener('visibilitychange',displayChanged)
   if (controller) link.postMessage({kind:'monitor-query'}); else report()
   dispose=() => { if(controller&&root)root.style.overscrollBehavior=oldOverscroll??'';window.clearInterval(timer); window.removeEventListener('scroll',scroll); window.removeEventListener('resize',displayChanged); document.removeEventListener('fullscreenchange',displayChanged); document.removeEventListener('visibilitychange',displayChanged); link.close(); channel.current=null }
  }
  connect(); window.addEventListener('hashchange',connect)
  return () => { dispose?.();window.removeEventListener('hashchange',connect) }
 }, [input.channelName])
 return (size: number) => { input.setFontSize?.(size); if (window.parent!==window) channel.current?.postMessage({kind:'monitor-font',size}) }
}
