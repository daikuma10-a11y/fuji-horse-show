"use client"
import {useEffect,useState} from 'react'
import {loadWinterInboxSummary,type InboxSummary} from '@/lib/winter-reception-inbox'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
export function WinterReceptionNotice({session,onSession,revision,onOpen}:{session:AdminSession;onSession:(s:AdminSession)=>void;revision:number;onOpen:()=>void}){
 const[summary,setSummary]=useState<InboxSummary|null>(null),[error,setError]=useState('')
 useEffect(()=>{
  let live=true,busy=false,timer:ReturnType<typeof setTimeout>|undefined
  async function read(){
   if(!live||busy||document.hidden)return
   busy=true
   try{const current=session.expiresAt<=Date.now()+60000?await verifyAdminSession(session):session;if(!live)return;if(current!==session)onSession(current);const r=await loadWinterInboxSummary(current.accessToken);if(live){setSummary(r);setError('')}}catch{if(live)setError('受付の最新件数を確認できません。通信復旧後に再確認します')}
   finally{busy=false;if(live){clearTimeout(timer);timer=setTimeout(()=>void read(),15000)}}
  }
  const resume=()=>{clearTimeout(timer);void read()}
  const visible=()=>{if(!document.hidden)resume()}
  window.addEventListener('online',resume);window.addEventListener('winter-delivery-changed',resume);document.addEventListener('visibilitychange',visible);void read()
  return()=>{live=false;clearTimeout(timer);window.removeEventListener('online',resume);window.removeEventListener('winter-delivery-changed',resume);document.removeEventListener('visibilitychange',visible)}
 },[session,revision,onSession])
 return <aside role="status" className={`print-hide mb-5 space-y-2 rounded-xl border-2 p-4 ${error||summary&&(summary.pending||summary.review)?'border-amber-600 bg-amber-50':'border-green-600 bg-green-50'}`}>
  <p className="text-xl font-bold">{summary?`本部の受付：未反映の申請 ${summary.pending}件 ／ 要確認 ${summary.review}件`:'本部の受付件数を確認しています…'}</p>
  {error?<p>{error}{summary&&'（表示は前回確認時の件数です）'}</p>:<p>受付端末から届いた内容を自動で確認しています。</p>}
  {(error||summary&&(summary.pending>0||summary.review>0))&&<button type="button" className="min-h-12 rounded-xl border-2 border-blue-800 bg-white px-4 py-2 text-lg font-bold" onClick={onOpen}>申請一覧で確認する</button>}
 </aside>
}
