"use client"
import {useRef,useEffect} from "react"
import type {StartEntry} from "@/lib/types"
export function MeetingActionDialog({entry,rider,horse,onClose,onChoose}:{entry?:StartEntry;rider?:string;horse?:string;onClose:()=>void;onChoose:(action:"change"|"withdraw")=>void}){
 const actionDialog=useRef<HTMLDialogElement>(null)
 useEffect(()=>{
  const dialog=actionDialog.current
  if(!entry||!dialog)return
  if(!dialog.open)dialog.showModal()
  return ()=>{if(dialog.open)dialog.close()}
 },[entry])
 return (
    <dialog ref={actionDialog} onCancel={() => onClose()} aria-labelledby="meeting-action-title" className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border-2 border-primary bg-card p-5 text-foreground shadow-xl backdrop:bg-black/40">
      <h3 id="meeting-action-title" className="text-xl font-bold">変更・棄権する人馬</h3>
      <p className="mt-3 font-bold">{entry?.order}番　{rider} ／ {horse}</p>
      <p className="mt-2 text-sm">内容は下書きに登録し、最終確認後に反映します。</p>
      <div className="mt-4 grid grid-cols-2 gap-3"><button type="button" onClick={() => onChoose("change")} className="min-h-14 rounded-xl bg-violet-700 px-4 font-bold text-white">変更する</button><button type="button" onClick={() => onChoose("withdraw")} className="min-h-14 rounded-xl bg-destructive px-4 font-bold text-white">棄権する</button></div>
      <button type="button" onClick={() => onClose()} className="mt-3 min-h-12 w-full rounded-xl border-2 font-bold">閉じる</button>
    </dialog>
 )
}
