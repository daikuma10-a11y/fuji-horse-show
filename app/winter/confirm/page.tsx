"use client"
import Link from 'next/link'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { emptyWinterQueue, readWinterQueue, writeWinterQueue, winterDraftSummary, submitWinterBatch, WinterBatchRejected, type WinterQueue } from '@/lib/winter-batch'
import { signInAdmin, verifyAdminSession, type AdminSession } from '@/lib/supabase-rest'
import { WINTER_EVENT_NAME } from '@/lib/winter-event'
const field = 'mt-2 min-h-16 w-full rounded-xl border-2 p-3 text-xl'
const button = 'min-h-16 w-full rounded-xl bg-blue-800 p-4 text-2xl font-bold text-white disabled:opacity-50'
export default function WinterConfirmPage() {
  const [queue,setQueue] = useState<WinterQueue | null>(null), [error,setError] = useState(''), [busy,setBusy] = useState(false)
  const [session,setSession] = useState<AdminSession | null>(null), [email,setEmail] = useState(''), [password,setPassword] = useState('')
  const [saved,setSaved] = useState<{ids:string[];total:number}|null>(null), lock = useRef(false)
  useEffect(() => {
    const update = () => { if (lock.current) return; try { setQueue(readWinterQueue(window.localStorage)); setError('') } catch(reason) { setQueue(null); setError(reason instanceof Error ? reason.message : '一覧を確認してください') } }
    update(); window.addEventListener('storage',update); return () => window.removeEventListener('storage',update)
  }, [])
  async function login(event: FormEvent) {
    event.preventDefault(); if(lock.current)return
    lock.current=true;setBusy(true);setError('')
    try{setSession(await signInAdmin(email,password));setPassword('')}catch(reason){setError(reason instanceof Error?reason.message:'ログインできません')}finally{lock.current=false;setBusy(false)}
  }
  function remove(id:string) {
    if(!queue || queue.attempted || lock.current)return
    try{const latest=readWinterQueue(window.localStorage);if(latest.attempted)throw new Error('確定中の内容は変更できません');const next={...latest,items:latest.items.filter(item=>winterDraftSummary(item).id!==id)};writeWinterQueue(window.localStorage,next);setQueue(next)}catch(reason){setError(reason instanceof Error?reason.message:'削除できません')}
  }
  async function save() {
    if(!session || !queue?.items.length || lock.current)return
    lock.current=true;setBusy(true);setError('');setSaved(null)
    let frozen:WinterQueue|null=null
    try {
      const latest=readWinterQueue(window.localStorage)
      if(JSON.stringify(latest)!==JSON.stringify(queue)){setQueue(latest);throw new Error('別画面で一覧が変わりました。確認し直してください')}
      const verified=await verifyAdminSession(session);setSession(verified)
      frozen={...latest,attempted:true};writeWinterQueue(window.localStorage,frozen);setQueue(frozen)
      const receipt=await submitWinterBatch(frozen,verified.accessToken)
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
  return <main className="mx-auto min-h-dvh max-w-3xl space-y-5 bg-slate-50 p-5 text-slate-900"><h1 className="text-3xl font-bold">{WINTER_EVENT_NAME}</h1><h2 className="text-3xl font-bold">未確定一覧・まとめて確定</h2>
    <Link href="/winter" className={button+' inline-flex items-center justify-center'}>入力を続ける・受付トップへ</Link>
    <p className="text-xl">この端末の未確定内容です。確定すると本部の申請一覧に届きます。出番表への反映は本部が行います。</p>
    {error&&<p role="alert" className="rounded-xl bg-red-100 p-4 text-xl">{error}</p>}
    {queue?.attempted&&<p className="rounded-xl bg-orange-100 p-4 text-xl">確定結果を確認できるまで内容を固定しています。「同じ内容で再試行」で重複せず確認できます。</p>}
    {queue&&!summaries.length&&<p className="text-2xl">未確定の申請はありません。</p>}
    {summaries.map(row=><article key={row.id} className="space-y-3 rounded-xl border-2 bg-white p-5"><h3 className="text-2xl font-bold">{row.type} ／ {row.organizationName}</h3><p className="text-xl">{row.label}</p><p className="text-xl">{row.category} ／ ¥{row.total.toLocaleString('ja-JP')}<br/>受付担当者：{row.visitorName}</p><button className="min-h-14 rounded-xl border-2 p-3 text-xl" disabled={busy||queue?.attempted} onClick={()=>remove(row.id)}>この申請を取り消す</button></article>)}
    {!!summaries.length&&<><p className="text-3xl font-bold">{summaries.length}件 ／ 合計 ¥{total.toLocaleString('ja-JP')}</p>{!session?<form className="space-y-3 rounded-xl border-2 bg-white p-5" onSubmit={login}><h3 className="text-2xl font-bold">本部ログイン（保存テスト用）</h3><label className="block text-xl">メールアドレス<input required type="email" autoComplete="username" className={field} value={email} onChange={e=>setEmail(e.target.value)}/></label><label className="block text-xl">パスワード<input required type="password" autoComplete="current-password" className={field} value={password} onChange={e=>setPassword(e.target.value)}/></label><button className={button} disabled={busy}>本部ログイン</button></form>:<button className={button} disabled={busy} onClick={()=>void save()}>{busy?'確定中…':queue?.attempted?'同じ内容で再試行':'この内容をまとめて確定'}</button>}</>}
    {saved&&<div role="status" className="space-y-3 rounded-xl bg-green-100 p-5 text-xl"><p className="text-2xl font-bold">{saved.ids.length}件を確定しました</p><p>合計 ¥{saved.total.toLocaleString('ja-JP')}</p>{saved.ids.map(id=><p key={id} className="break-all">受付番号：{id}</p>)}<Link href="/winter/admin" className="underline font-bold">大会本部で申請を確認する</Link></div>}
  </main>
}
