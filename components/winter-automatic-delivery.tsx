"use client"
import {useEffect,useState} from 'react'
import {listOfflineReceipts} from '@/lib/winter-offline'
import {deliverWinterReceipts,needsWinterDelivery} from '@/lib/winter-automatic-delivery'
export function WinterAutomaticDelivery(){
 const[state,setState]=useState<{pending:number;busy:boolean;error:string}>({pending:0,busy:false,error:''})
 useEffect(()=>{
  let live=true,running=false,again=false,failures=0,timer:ReturnType<typeof setTimeout>|undefined
  const schedule=()=>{if(running){again=true;return}clearTimeout(timer);timer=setTimeout(()=>void run(),0)}
  async function run(){
   if(!live||running||document.hidden)return
   running=true;again=false
   try{
    const rows=await listOfflineReceipts(),pending=rows.reduce((n,r)=>n+r.items.filter(needsWinterDelivery).length,0)
    if(!live)return
    setState({pending,busy:pending>0&&navigator.onLine!==false,error:''})
    if(pending&&navigator.onLine!==false)await deliverWinterReceipts()
    const after=await listOfflineReceipts()
    if(live)setState({pending:after.reduce((n,r)=>n+r.items.filter(needsWinterDelivery).length,0),busy:false,error:''})
    failures=0
   }catch(e){failures++;if(live)setState(s=>({...s,busy:false,error:e instanceof Error?e.message:'本部への送信状況を確認できません'}))}
   finally{running=false;if(live){clearTimeout(timer);timer=setTimeout(()=>void run(),again?0:Math.min(60000,15000*2**Math.min(failures,2)))}}
  }
  const visible=()=>{if(!document.hidden)schedule()}
  window.addEventListener('online',schedule);window.addEventListener('winter-queue-changed',schedule);document.addEventListener('visibilitychange',visible);schedule()
  return()=>{live=false;clearTimeout(timer);window.removeEventListener('online',schedule);window.removeEventListener('winter-queue-changed',schedule);document.removeEventListener('visibilitychange',visible)}
 },[])
 if(!state.pending&&!state.error)return null
 return <aside role="status" className="print-hide mx-auto max-w-5xl space-y-1 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-lg"><p className="font-bold">{state.busy?`本部へ自動送信しています（${state.pending}件）`:state.pending?`本部への送信・結果確認待ちが${state.pending}件あります`:'本部への送信状況を確認できません'}</p><p>{state.error||'この端末の保存内容を保持しています。通信中に受付画面を開いていると自動で送信します。'}</p></aside>
}
