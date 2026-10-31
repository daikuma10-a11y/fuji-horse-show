"use client"
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { emptyWinterQueue, readWinterQueue, writeWinterQueue, winterDraftSummary, submitWinterPublicReception, freezeWinterReception, WinterBatchRejected, type WinterQueue } from '@/lib/winter-batch'
import { ReceptionVisitorField } from '@/components/master/reception-visitor-field'
import {readDeviceRecord} from '@/lib/master/device-reception-store'
import {preparedReception,archiveReception,recoverSealedInput,type WinterPreparation,type WinterOfflineReceipt} from '@/lib/winter-offline'
import { WINTER_EVENT_NAME } from '@/lib/winter-event'
const button = 'min-h-16 w-full rounded-xl bg-blue-800 p-4 text-2xl font-bold text-white disabled:opacity-50'
export default function WinterConfirmPage() {
  const [queue,setQueue] = useState<WinterQueue | null>(null), [error,setError] = useState(''), [busy,setBusy] = useState(false)
  const [visitorName,setVisitorName] = useState(''),[preparation,setPreparation]=useState<WinterPreparation|null>(null),[localReceipt,setLocalReceipt]=useState(''),[delivered,setDelivered]=useState(false)
  const [saved,setSaved] = useState<{ids:string[];total:number}|null>(null), lock = useRef(false)
  useEffect(() => {
    const update = async () => { if (lock.current) return; try { const p=await preparedReception();await recoverSealedInput();setPreparation(p);const next=readWinterQueue(window.localStorage); setQueue(next); setVisitorName(next.visitorName??''); setError('') } catch(reason) { setQueue(null); setError(reason instanceof Error ? reason.message : '一覧を確認してください') } }
    void update(); window.addEventListener('storage',update);window.addEventListener('pageshow',update); return () => {window.removeEventListener('storage',update);window.removeEventListener('pageshow',update)}
  }, [])
  useEffect(()=>{
    let live=true;setDelivered(false)
    async function check(){if(!localReceipt)return;try{const r=await readDeviceRecord<WinterOfflineReceipt>(localReceipt);if(live)setDelivered(!!r&&r.items.every(i=>!!i.handoff||i.status==='sent'))}catch{/* Keep the durable-save message until receipt acknowledgement is readable. */}}
    void check();window.addEventListener('winter-delivery-changed',check)
    return()=>{live=false;window.removeEventListener('winter-delivery-changed',check)}
  },[localReceipt])
  function remove(id:string) {
    if(!queue || queue.attempted || lock.current)return
    try{const latest=readWinterQueue(window.localStorage);if(latest.attempted)throw new Error('確定中の内容は変更できません');const next={...latest,items:latest.items.filter(item=>winterDraftSummary(item).id!==id)};writeWinterQueue(window.localStorage,next);setQueue(next)}catch(reason){setError(reason instanceof Error?reason.message:'削除できません')}
  }
  async function save() {
    if(!queue?.items.length || lock.current)return
    lock.current=true;setBusy(true);setError('');setSaved(null);setLocalReceipt('')
    let frozen:WinterQueue|null=null
    try {
      const latest=readWinterQueue(window.localStorage)
      if(JSON.stringify(latest)!==JSON.stringify(queue)){setQueue(latest);throw new Error('別画面で一覧が変わりました。確認し直してください')}
      if(preparation){
        frozen=freezeWinterReception({...latest,localOnly:latest.attempted?latest.localOnly:true},visitorName);writeWinterQueue(localStorage,frozen);setQueue(frozen)
        const receipt=await archiveReception(frozen,preparation)
        await recoverSealedInput();setQueue(emptyWinterQueue());setVisitorName('');setLocalReceipt(receipt.id);return
      }
      if(latest.localOnly)throw new Error('この受付は端末で預かる内容です。管理者に確認してください')
      frozen=freezeWinterReception(latest,visitorName);writeWinterQueue(window.localStorage,frozen);setQueue(frozen)
      const receipt=await submitWinterPublicReception(frozen)
      setSaved(receipt)
      // Clearing only after the exact IDs and total have been acknowledged.
      try { writeWinterQueue(window.localStorage,emptyWinterQueue());setQueue(emptyWinterQueue()) }
      catch { setError('申請は確定済みです。この端末の一覧を消せませんでした。同じ内容で再試行しても重複しません。') }
    } catch(reason) {
      if(reason instanceof WinterBatchRejected && frozen){const editable={...frozen,attempted:false};try{writeWinterQueue(window.localStorage,editable);setQueue(editable)}catch{ /* retain frozen queue if storage fails */ }}
      setError(reason instanceof Error?reason.message:'通信が切れました。同じ内容で再試行してください')
    } finally{lock.current=false;setBusy(false)}
  }
  const summaries=queue?.items.map(winterDraftSummary)??[],total=summaries.reduce((sum,item)=>sum+item.total,0)
  return <main className="mx-auto min-h-dvh max-w-3xl space-y-5 bg-slate-50 p-5 text-slate-900"><h1 className="text-3xl font-bold">{WINTER_EVENT_NAME}</h1><h2 className="text-3xl font-bold">{preparation?'受付内容を確認・端末に保存':'未確定一覧・まとめて確定'}</h2>
    <Link href="/winter" className={button+' inline-flex items-center justify-center'}>入力を続ける・受付トップへ</Link>
    <p className="text-xl">{preparation?'この端末に受付内容を預かります。通信中は本部へ自動送信します。通信断中の保存分も、回線復旧後に自動送信します。出番表への反映は本部が行います。':'この端末の未確定内容です。確定すると本部の申請一覧に届きます。出番表への反映は本部が行います。'}</p>
    {error&&<p role="alert" className="rounded-xl bg-red-100 p-4 text-xl">{error}</p>}
    {queue?.attempted&&!preparation&&<p className="rounded-xl bg-orange-100 p-4 text-xl">確定結果を確認できるまで内容を固定しています。「同じ内容で再試行」で重複せず確認できます。</p>}
    {queue&&!summaries.length&&<p className="text-2xl">未確定の申請はありません。</p>}
    {summaries.map(row=><article key={row.id} className="space-y-3 rounded-xl border-2 bg-white p-5"><h3 className="text-2xl font-bold">{row.type} ／ {row.organizationName}</h3><p className="text-xl">{row.label}</p><p className="text-xl">{row.category} ／ ¥{row.total.toLocaleString('ja-JP')}{queue?.attempted&&!queue.visitorName&&<><br/>受付に来た方：{row.visitorName}</>}</p><button className="min-h-14 rounded-xl border-2 p-3 text-xl" disabled={busy||queue?.attempted} onClick={()=>remove(row.id)}>この申請を取り消す</button></article>)}
    {!!summaries.length&&<form className="space-y-5" onSubmit={event=>{event.preventDefault();void save()}}><p className="text-3xl font-bold">{summaries.length}件 ／ 合計 ¥{total.toLocaleString('ja-JP')}</p>{queue?.attempted&&!queue.visitorName?<p className="rounded-xl bg-orange-100 p-4 text-xl">以前送信した内容を確認しています。お名前も元の記録を使って再確認します。</p>:<ReceptionVisitorField value={queue?.attempted?queue.visitorName??'':visitorName} onChange={setVisitorName} disabled={busy||!!queue?.attempted}/>}<button type="submit" className={button} disabled={busy||(!queue?.attempted&&!visitorName.trim())}>{busy?(preparation?'端末へ保存・読み戻し確認中…':'確定中…'):preparation?'この端末に受付内容を保存':queue?.attempted?'同じ内容で再試行':'この内容をまとめて確定'}</button></form>}
    {localReceipt&&<div role="status" className="space-y-3 rounded-xl bg-green-100 p-5 text-xl"><p className="text-2xl font-bold">この端末に受付内容を保存しました。</p><p className="break-all">受付番号：{localReceipt}</p><p>{delivered?'本部に届きました。出番表への反映は本部確認後になります。':'本部へ自動送信します。通信断中の場合は復旧後に送信します。'}</p><a href="/winter" className={button+' inline-flex items-center justify-center'}>次の方・別の団体の受付を始める</a></div>}
    {saved&&<div role="status" className="space-y-3 rounded-xl bg-green-100 p-5 text-xl"><p className="text-2xl font-bold">{saved.ids.length}件を確定しました</p><p>合計 ¥{saved.total.toLocaleString('ja-JP')}</p>{saved.ids.map(id=><p key={id} className="break-all">受付番号：{id}</p>)}<p>受付内容を本部に送りました。出番表への反映は本部で行います。</p><Link href="/winter" className="underline font-bold">受付トップに戻る</Link></div>}
  </main>
}
