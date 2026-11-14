"use client"

import { useCallback, useEffect, useRef, useState } from 'react'

import {canPresent, connectPresentation, isPresentationDisplay, type MonitorPresentationConnection} from '@/lib/monitor-presentation'

const keyboardHint = '外部モニターの出番表をクリックして F11 を押すと、本部の操作中も全画面で表示できます。'
const unavailable = '外部モニター側の「全画面表示」を押してください。'
export const previewClick = 'monitor-preview-fullscreen'
export const displayClick = 'monitor-display-open'
export function requestMonitorDisplay(channel:string){
 return canPresent() && !window.dispatchEvent(new CustomEvent(displayClick,{detail:channel,cancelable:true}))
}

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

 const requestPopup = useCallback(() => {
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
 const [fallback,setFallback]=useState(false)
 const [connection,setConnection]=useState<MonitorPresentationConnection|null>(null)
 const mounted=useRef(true)
 useEffect(()=>{
  mounted.current=true
  if(token && displayPath)void connectPresentation(token,displayPath,true).then(c=>{
   if(c&&mounted.current)setConnection(c)
  }).catch(()=>{})
  return ()=>{mounted.current=false}
 },[token,displayPath])
 useEffect(()=>{
  if(!connection || !displayPath)return
  const connected=()=>{
   const previous=audience.current
   try{if(previous && !previous.closed && previous.opener===window && previous.location.href===new URL(displayPath,window.location.href).href)previous.close()}catch{}
   setFallback(false);setHint('')
  }
  const ended=()=>{setConnection(null);setHint('外部モニターへの全画面配信を終了しました。')}
  if(connection.state==='connected')connected()
  else if(connection.state!=='connecting'){ended();return}
  connection.addEventListener('connect',connected)
  connection.addEventListener('close',ended)
  connection.addEventListener('terminate',ended)
  return ()=>{
   connection.removeEventListener('connect',connected)
   connection.removeEventListener('close',ended)
   connection.removeEventListener('terminate',ended)
  }
 },[connection,displayPath])
 const request=useCallback(()=>{
  if(!token || !displayPath)return
  if(!canPresent()){requestPopup();return}
  if(connection?.state==='connected')return
  setHint('表示先の一覧から外部モニターを選んでください。')
  const started=connectPresentation(token,displayPath)
  void started.then(c=>{if(c&&mounted.current)setConnection(c)}).catch(()=>{
   if(!mounted.current)return
   setFallback(true)
   setHint('表示を開始できませんでした。もう一度表示先を選ぶか、別ウィンドウで開いてください。')
  })
 },[token,displayPath,requestPopup,connection])
 return { request, stop:connection?()=>connection.terminate():null, fallback, hint }
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
 if (fullscreen || (typeof window!=='undefined' && isPresentationDisplay())) return null
 async function enterFullscreen() {
  try { await document.documentElement.requestFullscreen() }
  catch { setHint(keyboardHint) }
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

