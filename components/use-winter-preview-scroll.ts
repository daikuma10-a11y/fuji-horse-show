"use client"
import {useEffect,useRef,useState} from 'react'
import {broadcastScroll,createScrollController,type ScrollPosition} from '@/lib/winter-monitor-scroll'
import {WINTER_PUBLIC_KEY,WINTER_PUBLIC_URL} from '@/lib/winter-live'

type Controller=Awaited<ReturnType<typeof createScrollController>>
export function useWinterPreviewScroll(active:boolean,view:string){
 const [control,setControl]=useState<Controller|null>(null),[error,setError]=useState('')
 const last=useRef<Omit<ScrollPosition,'sequence'>|null>(null)
 const schedule=useRef<()=>void>(()=>{})
 useEffect(()=>{
  let live=true
  createScrollController().then(c=>{if(live)setControl(c)}).catch(()=>{if(live)setError('別端末向けのスクロール連動を開始できません。')})
  return ()=>{live=false}
 },[])
 useEffect(()=>{
  if(!active||!control||!view)return
  const conn=new AbortController()
  let timer:ReturnType<typeof setTimeout>|undefined,running=false
  const send=async()=>{
   timer=undefined
   const position=last.current
   if(!position||running||conn.signal.aborted)return
   last.current=null;running=true
   try{
    const packet=await control.sign(view,position)
    await broadcastScroll(WINTER_PUBLIC_URL,WINTER_PUBLIC_KEY,AbortSignal.any([conn.signal,AbortSignal.timeout(4000)]),packet)
    if(!conn.signal.aborted)setError('')
   }catch{if(!conn.signal.aborted)setError('別端末へ位置を送れませんでした。通信復旧後に小窓をスクロールしてください。')}
   finally{running=false;if(last.current&&!conn.signal.aborted)schedule.current()}
  }
  schedule.current=()=>{if(!timer&&!running)timer=setTimeout(()=>void send(),100)}
  return ()=>{conn.abort();clearTimeout(timer);last.current=null;schedule.current=()=>{}}
 },[active,control,view])
 function scroll(raw:unknown){
  const m=raw as {view?:string;controller?:{x:string;y:string};position?:ScrollPosition}
  const p=m?.position
  if(!active||!control||m?.view!==view||m.controller?.x!==control.controller.x||m.controller.y!==control.controller.y||!p||!Number.isFinite(p.y)||!Number.isFinite(p.extent)||p.extent<=0||p.y<0||p.y>p.extent)return
  last.current={y:p.y,extent:p.extent,fraction:p.y/p.extent};schedule.current()
 }
 return {key:control?.controller,scroll,error}
}
