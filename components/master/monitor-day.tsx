"use client"
import {useEffect,useState,type ReactNode} from 'react'

/** An unattended display visits the whole day's list and pauses at both ends. */
export function MasterMonitorDay({title,children,compact=false}:{title:string;children:ReactNode;compact?:boolean}){
 const [running,setRunning]=useState(true)
 useEffect(()=>{
  if(!compact) window.scrollTo(0,0)
 },[title,compact])
 useEffect(()=>{
  if(compact||!running)return
  let holdUntil=performance.now()+4000,atBottom=false
  const timer=window.setInterval(()=>{
   if(document.hidden||performance.now()<holdUntil)return
   const root=document.scrollingElement
   if(!root||root.scrollHeight<=root.clientHeight+1)return
   if(root.scrollTop+root.clientHeight>=root.scrollHeight-1){
    if(atBottom)root.scrollTop=0
    atBottom=!atBottom
    holdUntil=performance.now()+4000
   }else{
    atBottom=false
    root.scrollTop+=2
   }
  },60)
  return ()=>window.clearInterval(timer)
 },[title,running,compact])
 return <div className={compact?'p-2':'p-3'}>
  <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b-2 border-primary bg-white py-1">
   <h1 className={compact?'font-bold':'text-xl font-bold'}>{title}</h1>
   {!compact&&<button type="button" className="rounded border px-3 py-1 text-sm" onClick={()=>setRunning(value=>!value)}>{running?'自動スクロールを停止':'自動スクロールを再開'}</button>}
  </header>
  <div className={compact?'grid gap-2':'grid items-start gap-4 xl:grid-cols-2'}>{children}</div>
 </div>
}
