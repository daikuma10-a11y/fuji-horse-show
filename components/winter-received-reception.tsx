"use client"
import {useEffect,useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {loadWinterInbox,inboxAction,resolveWinterInbox,type ReceivedReception,type InboxAction} from '@/lib/winter-reception-inbox'
import {winterDraftSummary,type WinterDraft} from '@/lib/winter-batch'
import type {WinterData,OfflineItem} from '@/lib/winter-offline'
import {OfflineItemEditor} from './winter-offline-reception'
export function WinterReceivedReception({session,onSession,data,active,revision,onChanged}:{session:AdminSession;onSession:(s:AdminSession)=>void;data:WinterData|null;active:boolean;revision:number;onChanged:()=>void}){
 const[rows,setRows]=useState<ReceivedReception[]>([]),[error,setError]=useState(''),[loadError,setLoadError]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState<InboxAction|null>(null),[reload,setReload]=useState(0)
 const lock=useRef(false),alive=useRef(true),selected=useRef(active),pendingRef=useRef<InboxAction|null>(null);selected.current=active
 useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
 useEffect(()=>{
  let live=true,running=false,timer:ReturnType<typeof setTimeout>|undefined
  async function read(){if(!active||running||document.hidden)return;if(lock.current){if(live)timer=setTimeout(()=>void read(),15000);return}running=true;try{const r=await loadWinterInbox(session.accessToken);if(live){setRows(r);setLoadError('')}}catch(e){if(live)setLoadError(e instanceof Error?e.message:'受信内容を確認できません')}finally{running=false;if(live)timer=setTimeout(()=>void read(),15000)}}
  const visible=()=>{if(!document.hidden){clearTimeout(timer);void read()}}
  void read();document.addEventListener('visibilitychange',visible)
  return()=>{live=false;clearTimeout(timer);document.removeEventListener('visibilitychange',visible)}
 },[active,session.accessToken,revision,reload])
 async function perform(action:InboxAction){
  if(lock.current||!active)return
  lock.current=true;setBusy(true);setError('');pendingRef.current=action;setPending(action)
  try{const s=await verifyAdminSession(session);if(!alive.current||!selected.current)return;onSession(s);await resolveWinterInbox(action,s.accessToken);if(alive.current){pendingRef.current=null;setPending(null);onChanged();setReload(v=>v+1)}}
  catch(e){if(alive.current){setError(e instanceof Error?e.message:'結果を確認できません');const status=(e as {status?:number})?.status;if(status&&status>=400&&status<500){pendingRef.current=null;setPending(null)}}}
  finally{lock.current=false;if(alive.current)setBusy(false)}
 }
 function resolve(row:ReceivedReception,draft:WinterDraft|null,reason:string){if(!data||pendingRef.current)return;try{void perform(inboxAction(row,draft,reason,data))}catch(e){setError(e instanceof Error?e.message:'確認内容を見直してください')}}
 if(!active)return null
 if(!rows.length&&!error&&!loadError&&!pending)return null
 return <section className="print-hide space-y-4 rounded-xl border-2 border-amber-600 bg-amber-50 p-4"><h2 className="text-2xl font-bold">本部に届いた要確認の受付</h2><p>受付端末の内容は本部に保存済みです。最新の人馬・競技・料金で内容を確認し、申請一覧に登録するか、本部で取下げを記録してください。</p>
 {pending&&<div role="status" className="space-y-2 rounded-xl border-2 p-3"><p>確認結果を照合しています。同じ内容・番号で再確認できます。</p><button type="button" disabled={busy} className="min-h-14 rounded-xl border-2 bg-white p-3 font-bold" onClick={()=>void perform(pending)}>同じ内容で確認結果を再確認</button></div>}
 {rows.map(row=>{const s=winterDraftSummary(row.source.draft),item:OfflineItem={draft:row.source.draft,context:row.source.context,status:'review',message:row.message,attempts:0,history:[]};return <article key={row.request_id} className="space-y-2 rounded-xl border-2 bg-white p-4"><h3 className="text-xl font-bold">{s.organizationName} ／ {s.type}</h3><p>{s.label}</p><p>受付に来た方：{s.visitorName} ／ ¥{s.total.toLocaleString('ja-JP')}</p><p className="font-bold">要確認：{row.message}</p><p className="break-all text-sm">受付番号：{row.receipt_id} ／ 申請ID：{row.request_id}</p>{data?<OfflineItemEditor key={row.request_id+':'+row.revision} item={item} data={data} disabled={busy||!!pending} destination="headquarters" onSave={(draft,reason)=>resolve(row,draft,reason)} onCancel={reason=>resolve(row,null,reason)}/>:<p>最新名簿を取得できると内容を確認・訂正できます。</p>}</article>})}
 {loadError&&<p role="alert" className="rounded-xl bg-red-100 p-3">{loadError} 前回の一覧と本部の保存記録は保持しています。</p>}
 {error&&<p role="alert" className="rounded-xl bg-red-100 p-3">{error} 本部に保存した受付は保持しています。</p>}
 </section>
}
