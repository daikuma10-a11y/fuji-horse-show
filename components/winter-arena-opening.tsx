"use client"
import {useEffect,useRef,useState} from 'react'
import {loadArenaOpening,saveArenaOpening} from '@/lib/winter-arena-opening'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
export function WinterArenaOpening({session,onSession,onChanged,revision}:{session:AdminSession;onSession:(s:AdminSession)=>void;onChanged:()=>void;revision:unknown}){
  const [time,setTime]=useState(''),[draft,setDraft]=useState(''),[base,setBase]=useState(''),[editing,setEditing]=useState(false)
  const [error,setError]=useState(''),[busy,setBusy]=useState(false),[retry,setRetry]=useState(0)
  const lock=useRef(false),alive=useRef(true)
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>{
    const controller=new AbortController()
    void loadArenaOpening(session.accessToken,controller.signal).then(value=>{if(!controller.signal.aborted){setTime(value);setError('')}})
      .catch(e=>{if(!controller.signal.aborted)setError(e instanceof Error?e.message:'時刻を確認できません。')})
    return()=>controller.abort()
  },[session.accessToken,revision,retry])
  async function save(){
    if(lock.current||!draft||base!==time)return
    lock.current=true;setBusy(true);setError('')
    try{const verified=await verifyAdminSession(session);if(!alive.current)return;onSession(verified)
      const t=await saveArenaOpening(verified.accessToken,base,draft)
      if(alive.current){setTime(t);setEditing(false);onChanged()}
    }catch(e){if(alive.current)setError(e instanceof Error?e.message:'保存できません。')}
    finally{lock.current=false;if(alive.current)setBusy(false)}
  }
  const btn='min-h-12 rounded-lg border-2 px-3 font-bold disabled:opacity-50'
  return <section className="space-y-2">
    <h4 className="font-bold">馬場馬術 ～Dressage～　第2競技場</h4>
    <div className="flex flex-wrap items-center gap-4 rounded-lg border p-3"><strong className="whitespace-nowrap">馬場開放　{time||(error?'時刻未取得':'読込中…')}</strong>
      {!editing&&time&&<button type="button" className={btn} onClick={()=>{setDraft(time);setBase(time);setEditing(true)}}>開放時間を編集</button>}
      {editing&&<><label>開放時間 <input type="time" value={draft} disabled={busy} onChange={e=>setDraft(e.target.value)}/></label>
        <button type="button" className={btn} disabled={busy||!draft||base!==time} onClick={()=>void save()}>開放時間を保存</button>
        <button type="button" className={btn} disabled={busy} onClick={()=>setEditing(false)}>閉じる</button></>}
    </div>
    {(error||editing&&base!==time)&&<div role="alert">{error||'編集中に開放時間が更新されました。'} <button className={btn} disabled={busy} onClick={()=>{setEditing(false);setRetry(v=>v+1)}}>最新の時間を読み込む</button></div>}
  </section>
}
