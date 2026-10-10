"use client"
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { loadWinterData } from '@/lib/winter-data'
import { WINTER_EVENT_NAME } from '@/lib/winter-event'
import { stageWinterDraft, type WinterDraft } from '@/lib/winter-batch'
import { WinterQueueLink } from '@/components/winter-queue-link'
type Data = Awaited<ReturnType<typeof loadWinterData>>
const field='mt-2 min-h-16 w-full rounded-xl border-2 bg-white p-3 text-xl'
const button='min-h-16 w-full rounded-xl bg-blue-800 p-4 text-2xl font-bold text-white'
export default function WinterWithdrawPage() {
  const [data,setData]=useState<Data|null>(null),[orgId,setOrgId]=useState(''),[entryId,setEntryId]=useState(''),[visitor,setVisitor]=useState('')
  const [review,setReview]=useState<Extract<WinterDraft,{type:'withdraw'}>|null>(null),[error,setError]=useState(''),[message,setMessage]=useState('')
  useEffect(()=>{setOrgId(new URLSearchParams(window.location.search).get('org')??'');const controller=new AbortController();loadWinterData(controller.signal).then(value=>{if(!controller.signal.aborted)setData(value)}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'データを取得できません')});return()=>controller.abort()},[])
  const label=(id:string)=>{const e=data?.entries.find(row=>row.entry_id===id);return e?`第${e.competition_no}競技 ${e.start_order}番　${data?.riders.find(r=>r.id===e.rider_id)?.name} ／ ${data?.horses.find(h=>h.id===e.horse_id)?.name}${e.is_op?'（OP）':''}`:''}
  function confirm(){setError('');setMessage('');const entry=data?.entries.find(row=>row.entry_id===entryId),org=data?.organizations.find(row=>row.id===orgId);if(!entry||!org||!visitor.trim()){setError('団体・人馬・受付担当者を確認してください');return}setReview({type:'withdraw',id:crypto.randomUUID(),entry:{...entry},organizationId:org.id,organizationName:org.name,riderName:data?.riders.find(r=>r.id===entry.rider_id)?.name??'',horseName:data?.horses.find(h=>h.id===entry.horse_id)?.name??'',visitorName:visitor.trim()})}
  function stage(){if(!review)return;try{stageWinterDraft(review);setReview(null);setEntryId('');setMessage('未確定一覧に追加しました（まだ申請されていません）。まとめて確定してください。')}catch(reason){setError(reason instanceof Error?reason.message:'未確定一覧に追加できません')}}
  return <main className="mx-auto min-h-dvh max-w-3xl space-y-5 bg-slate-50 p-5 text-slate-900"><h1 className="text-3xl font-bold">{WINTER_EVENT_NAME}</h1><Link href="/winter" className="inline-flex min-h-14 items-center rounded-xl border-2 p-4 text-xl font-bold">受付トップに戻る</Link><h2 className="text-3xl font-bold">棄権受付（0円）</h2><WinterQueueLink/>
    {error&&<p role="alert" className="rounded-xl bg-red-100 p-4 text-xl">{error}</p>}
    {message&&<p role="status" className="rounded-xl bg-green-100 p-4 text-xl">{message}</p>}
    {!data?<p>Winterデータを読み込んでいます…</p>:review?<section className="space-y-4 rounded-xl border-2 bg-white p-5"><h3 className="text-2xl font-bold">この人馬の棄権を申請します</h3><p className="text-xl">{label(review.entry.entry_id)}<br/>受付担当者：{review.visitorName}<br/>料金：0円</p><button className={button} onClick={stage}>未確定一覧に追加して入力を続ける</button><button className={button} onClick={()=>setReview(null)}>入力に戻る</button></section>:<div className="space-y-4"><label className="block text-xl">団体<select className={field} value={orgId} onChange={e=>{setOrgId(e.target.value);setEntryId('')}}><option value="">団体を選択</option>{[...data.organizations].sort((a,b)=>a.name.localeCompare(b.name,'ja')).map(row=><option key={row.id} value={row.id}>{row.name}</option>)}</select></label><label className="block text-xl">対象の人馬<select className={field} value={entryId} onChange={e=>setEntryId(e.target.value)}><option value="">出番表から人馬を選択</option>{data.entries.filter(row=>!['wd','withdrawn'].includes(row.status.toLowerCase())&&data.riders.find(r=>r.id===row.rider_id)?.organization_id===orgId).map(row=><option key={row.entry_id} value={row.entry_id}>{label(row.entry_id)}</option>)}</select></label>{!data.entries.length&&<p className="rounded-xl bg-blue-100 p-4 text-xl">人馬名簿と出番表が登録されると、棄権対象を選択できます。</p>}<label className="block text-xl">受付担当者名<input className={field} maxLength={100} value={visitor} onChange={e=>setVisitor(e.target.value)}/></label><button className={button} onClick={confirm}>棄権内容を確認</button></div>}
  </main>
}
