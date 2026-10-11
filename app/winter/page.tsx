import Link from 'next/link'
import { PlusCircle, RefreshCw, XCircle, ClipboardList, Printer } from 'lucide-react'
import { WINTER_EVENT_NAME } from '@/lib/winter-event'

export default function WinterReceptionHome() {
  return <div className="min-h-dvh bg-background text-foreground">
    <header className="border-b-2 bg-card px-5 py-6 text-center"><h1 className="text-2xl font-bold sm:text-3xl">{WINTER_EVENT_NAME}</h1><p className="mt-2 text-xl">大会受付（操作テスト版）</p></header>
    <main className="mx-auto w-full max-w-4xl space-y-5 px-5 py-8">
      <p className="text-center text-2xl font-semibold">ご希望の手続きを選んでください</p>
      <Link href="/winter/add" className="flex min-h-32 items-center gap-6 rounded-3xl bg-[oklch(0.46_0.1_155)] px-8 text-white shadow-md"><PlusCircle className="size-16 shrink-0" aria-hidden="true" /><span><span className="block text-5xl font-bold">追加</span><span className="mt-2 block text-xl">競技にエントリーを追加します</span></span></Link>
      <Link href="/winter/change" className="flex min-h-32 w-full items-center gap-6 rounded-3xl bg-accent px-8 text-left text-accent-foreground shadow-md"><RefreshCw className="size-16 shrink-0" aria-hidden="true" /><span><span className="block text-5xl font-bold">変更</span><span className="mt-2 block text-xl">競技・選手・馬を変更します</span></span></Link>
      <Link href="/winter/withdraw" className="flex min-h-32 items-center gap-6 rounded-3xl bg-destructive px-8 text-white shadow-md"><XCircle className="size-16 shrink-0" aria-hidden="true" /><span><span className="block text-5xl font-bold">棄権</span><span className="mt-2 block text-xl">出場を取りやめます</span></span></Link>
      <button disabled className="flex min-h-32 w-full items-center gap-6 rounded-3xl bg-blue-800 px-8 text-left text-white opacity-60"><Printer className="size-16 shrink-0" aria-hidden="true" /><span><span className="block text-5xl font-bold">精算</span><span className="mt-2 block text-xl">準備中：支払い確認・精算書の印刷</span></span></button>
      <div className="pt-5 text-center"><Link href="/winter/admin" className="inline-flex min-h-14 items-center gap-3 rounded-xl border-2 bg-card px-6 text-xl font-bold"><ClipboardList aria-hidden="true" />大会本部（管理画面）</Link></div>
      <p className="text-center text-base text-muted-foreground">入力後に未確定一覧でまとめて確定できます。現在、確定の保存テストには本部ログインが必要です。</p>
      <p className="text-center text-base text-muted-foreground">精算は準備中です。参加人馬は「大会本部」の参加チェックを保存すると受付で選べます。共通の人馬名簿は「大会本部」で管理できます。</p>
    </main>
  </div>
}
