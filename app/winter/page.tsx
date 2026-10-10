"use client"

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { PlusCircle, RefreshCw, XCircle, ClipboardList, Printer } from 'lucide-react'
import { loadWinterData, type WinterOrganizationRow } from '@/lib/winter-data'
import { WINTER_EVENT_NAME } from '@/lib/winter-event'
import { WinterQueueLink } from '@/components/winter-queue-link'

export default function WinterReceptionHome() {
  const [organizations, setOrganizations] = useState<WinterOrganizationRow[]>([])
  const [orgId, setOrgId] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    const controller = new AbortController()
    loadWinterData(controller.signal).then(data => { if (!controller.signal.aborted) setOrganizations([...data.organizations].sort((a,b) => a.name.localeCompare(b.name,'ja'))) })
      .catch(reason => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : '団体を読み込めません') })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [])
  const query = orgId ? `?${new URLSearchParams({ org: orgId })}` : ''
  return <div className="min-h-dvh bg-background text-foreground">
    <header className="border-b-2 bg-card px-5 py-6 text-center"><h1 className="text-2xl font-bold sm:text-3xl">{WINTER_EVENT_NAME}</h1><p className="mt-2 text-xl">大会受付（操作テスト版）</p></header>
    <main className="mx-auto w-full max-w-4xl space-y-5 px-5 py-8">
      <label className="block rounded-2xl border-2 bg-card p-5 text-2xl font-bold">所属団体を選択してください<select disabled={loading || !!error} value={orgId} onChange={event => setOrgId(event.target.value)} className="mt-3 min-h-16 w-full rounded-xl border-2 bg-background p-3 text-xl"><option value="">{loading ? '読み込み中…' : '団体を選択'}</option>{organizations.map(org => <option key={org.id} value={org.id}>{org.name}</option>)}</select></label>
      {error && <p role="alert" className="rounded-xl bg-red-100 p-4 text-xl">{error}</p>}
      {!loading && !error && !organizations.length && <p className="rounded-xl bg-blue-100 p-4 text-xl">団体・人馬は未登録です。下の「大会本部」で登録してください。</p>}
      <p className="text-center text-2xl font-semibold">ご希望の手続きを選んでください</p>
      <Link href={`/winter/add${query}`} className="flex min-h-32 items-center gap-6 rounded-3xl bg-[oklch(0.46_0.1_155)] px-8 text-white shadow-md"><PlusCircle className="size-16 shrink-0" aria-hidden="true" /><span><span className="block text-5xl font-bold">追加</span><span className="mt-2 block text-xl">競技にエントリーを追加します</span></span></Link>
      <Link href={`/winter/change${query}`} className="flex min-h-32 w-full items-center gap-6 rounded-3xl bg-accent px-8 text-left text-accent-foreground shadow-md"><RefreshCw className="size-16 shrink-0" aria-hidden="true" /><span><span className="block text-5xl font-bold">変更</span><span className="mt-2 block text-xl">競技・選手・馬を変更します</span></span></Link>
      <Link href={`/winter/withdraw${query}`} className="flex min-h-32 items-center gap-6 rounded-3xl bg-destructive px-8 text-white shadow-md"><XCircle className="size-16 shrink-0" aria-hidden="true" /><span><span className="block text-5xl font-bold">棄権</span><span className="mt-2 block text-xl">出場を取りやめます</span></span></Link>
      <WinterQueueLink />
      <button disabled className="flex min-h-32 w-full items-center gap-6 rounded-3xl bg-blue-800 px-8 text-left text-white opacity-60"><Printer className="size-16 shrink-0" aria-hidden="true" /><span><span className="block text-5xl font-bold">精算</span><span className="mt-2 block text-xl">準備中：支払い確認・精算書の印刷</span></span></button>
      <div className="pt-5 text-center"><Link href="/winter/admin" className="inline-flex min-h-14 items-center gap-3 rounded-xl border-2 bg-card px-6 text-xl font-bold"><ClipboardList aria-hidden="true" />大会本部（管理画面）</Link></div>
      <p className="text-center text-base text-muted-foreground">入力後に未確定一覧でまとめて確定できます。現在、確定の保存テストには本部ログインが必要です。</p>
    </main>
  </div>
}
