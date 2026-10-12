"use client"
import {useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {loadWinterData} from '@/lib/winter-data'
import {exportWinterCsv,type WinterExportKind} from '@/lib/winter-export'

export function WinterExportPanel({session,onSession}:{session:AdminSession;onSession:(session:AdminSession)=>void}){
 const lock=useRef(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('')
 async function download(kind:WinterExportKind){
  if(lock.current)return
  lock.current=true;setBusy(true);setMessage('')
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),30000)
  try{
   onSession(await verifyAdminSession(session))
   const data=await loadWinterData(controller.signal),csv=exportWinterCsv(data,kind)
   const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'})),a=document.createElement('a')
   const stamp=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo'}).format(new Date())
   a.href=url;a.download=`Winter_${kind}_${stamp}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000)
   setMessage('保存済みの最新データからCSVを作成しました。Excelで開くことができます。')
  }catch(e){setMessage(e instanceof Error?e.message:'書き出せませんでした')}finally{clearTimeout(timeout);lock.current=false;setBusy(false)}
 }
 return <details className="print-hide mb-5 rounded-xl border-2 p-4"><summary className="cursor-pointer text-xl font-bold">参加名簿・出番表を書き出す</summary><p className="my-3">保存済みのWinter参加選手・参加馬と出番表をExcelで開けるCSVにします。編集中で未保存の並び順や、参加チェックのない共通名簿は含みません。日馬連番号の先頭の0を保つ場合は、Excelの「テキスト/CSVから」で番号列を文字列として取り込んでください。</p><div className="flex flex-wrap gap-3">{([['riders','参加選手名簿'],['horses','参加馬名簿'],['entries','保存済み出番表']] as const).map(([kind,label])=><button type="button" key={kind} disabled={busy} onClick={()=>void download(kind)} className="min-h-14 rounded-xl border-2 px-4 text-lg font-semibold disabled:opacity-50">{label} CSV</button>)}</div>{busy&&<p role="status">最新データを取得しています…</p>}{message&&<p role="status" className="mt-3">{message}</p>}</details>
}
