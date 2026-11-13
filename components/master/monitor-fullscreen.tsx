"use client"

import { useCallback, useEffect, useRef, useState } from 'react'

const unavailable = '外部モニター側の「全画面表示」を押してください。'
export const previewClick = 'monitor-preview-fullscreen'

// Send directly to the audience Window while the preview click is still active.
// BroadcastChannel is used for scrolling, but cannot delegate a fullscreen gesture.
export function useAudienceFullscreen(token: string | null, displayPath: string | undefined) {
 const audience = useRef<Window | null>(null)
 const timeout = useRef<number | undefined>(undefined)
 const [hint, setHint] = useState('')

 useEffect(() => {
  if (!token || !displayPath) return
  const url = new URL(displayPath, window.location.href)
  setHint('')
  const receive = (event: MessageEvent) => {
   if (event.origin !== url.origin || event.data?.channel !== token || !event.source) return
   if (event.data.kind === 'monitor-fullscreen-ready') {
    const source = event.source as Window
    try {
     if (source.opener !== window || source.top !== source || source.location.href !== url.href) return
     if (audience.current !== source) setHint('')
     audience.current = source
    } catch { /* A previously connected window may have navigated away. */ }
   } else if (event.data.kind === 'monitor-fullscreen-result' && event.source === audience.current) {
    window.clearTimeout(timeout.current)
    setHint(event.data.fullscreen === true ? '' : unavailable)
   }
  }
  window.addEventListener('message', receive)
  return () => {
   window.removeEventListener('message', receive)
   window.clearTimeout(timeout.current)
   audience.current = null
  }
 }, [token, displayPath])

 const request = useCallback(() => {
  const target = audience.current
  window.clearTimeout(timeout.current)
  if (!target || target.closed) {
   setHint('同じパソコンの「モニター表示」から外部画面を開いてください。別端末では、その端末で「全画面表示」を押してください。')
   return
  }
  try {
   const options = { targetOrigin: window.location.origin, delegate: 'fullscreen' }
   target.postMessage({ kind: 'monitor-fullscreen-request', channel: token }, options)
   setHint('外部モニターの全画面表示を確認中…')
   timeout.current = window.setTimeout(() => setHint(unavailable), 4000)
  } catch { setHint(unavailable) }
 }, [token])
 return { request, hint }
}

export function MonitorFullscreenButton({ channel, fullscreen, preview }: { channel: string; fullscreen: boolean; preview: boolean }) {
 const [hint, setHint] = useState('')
 useEffect(() => {
  if (window.parent !== window || !window.opener) return
  const opener: Window = window.opener
  const origin = window.location.origin
  const ready = () => opener.postMessage({ kind: 'monitor-fullscreen-ready', channel }, origin)
  async function receive(event: MessageEvent) {
   if (event.origin !== origin || event.source !== opener || event.data?.kind !== 'monitor-fullscreen-request' || event.data.channel !== channel) return
   try {
    if (!document.fullscreenElement) await document.documentElement.requestFullscreen()
   } catch { setHint(unavailable) }
   opener.postMessage({ kind: 'monitor-fullscreen-result', channel, fullscreen: !!document.fullscreenElement }, origin)
  }
  window.addEventListener('message', receive)
  ready()
  // The admin may reload or reopen the preview after the audience window.
  const timer = window.setInterval(ready, 2000)
  return () => { window.removeEventListener('message', receive); window.clearInterval(timer) }
 }, [channel])
 if (fullscreen) return null
 async function enterFullscreen() {
  try { await document.documentElement.requestFullscreen() }
  catch { setHint('全画面表示を開始できません。ブラウザーの全画面操作をお使いください。') }
 }
 function click() {
  if (window.parent !== window) {
   // The parent gets the original click synchronously without fullscreening the iframe.
   window.frameElement?.dispatchEvent(new Event(previewClick, { bubbles: true }))
  } else {
   setHint('')
   void enterFullscreen()
  }
 }
 return <><button type="button" className="m-3 min-h-14 rounded-xl border-2 p-3 text-xl" onClick={click} aria-label={preview?'外部モニターを全画面表示':'全画面表示'}>全画面表示</button>{hint&&<p role="status">{hint}</p>}</>
}

