"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ClipboardList, Calculator, ListOrdered, LogIn, LogOut, ShieldCheck } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { RequestPanel } from "@/components/admin/request-panel"
import { SettlementPanel } from "@/components/admin/settlement-panel"
import { StartListViewer } from "@/components/admin/startlist-viewer"
import { loadAdminSession, signInAdmin, signOutAdmin, type AdminSession } from "@/lib/admin-auth"

type Tab = "requests" | "settlement" | "startlist"
const tabs = [
  { id: "requests" as const, label: "申請一覧", icon: ClipboardList },
  { id: "settlement" as const, label: "精算", icon: Calculator },
  { id: "startlist" as const, label: "出番表", icon: ListOrdered },
]

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("requests")
  const [session, setSession] = useState<AdminSession | null>(null)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)
  useEffect(() => setSession(loadAdminSession()), [])

  async function login(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError("")
    try { setSession(await signInAdmin(email, password)); setPassword("") }
    catch (e) { setError(e instanceof Error ? e.message : "ログインできませんでした") }
    finally { setBusy(false) }
  }
  function logout() { signOutAdmin(); setSession(null) }

  return <div className="flex min-h-dvh flex-col bg-background">
    <AppHeader subtitle="大会本部 管理画面" />
    <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <Link href="/" className="inline-flex min-h-14 items-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-xl font-semibold"><ArrowLeft className="size-6"/>受付画面へ</Link>
        {session && <button onClick={logout} className="ml-auto inline-flex min-h-14 items-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-lg font-bold"><LogOut className="size-5"/>ログアウト</button>}
      </div>

      {!session ? <form onSubmit={login} className="mx-auto max-w-xl rounded-2xl border-2 border-border bg-card p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3"><ShieldCheck className="size-8 text-primary"/><div><h2 className="text-2xl font-bold">大会本部ログイン</h2><p className="text-muted-foreground">出番表への反映など、本部操作に必要です。</p></div></div>
        <label className="mb-4 block text-lg font-bold">メールアドレス<input type="email" required value={email} onChange={e=>setEmail(e.target.value)} className="mt-2 min-h-14 w-full rounded-xl border-2 border-border bg-background px-4 text-xl"/></label>
        <label className="mb-4 block text-lg font-bold">パスワード<input type="password" required value={password} onChange={e=>setPassword(e.target.value)} className="mt-2 min-h-14 w-full rounded-xl border-2 border-border bg-background px-4 text-xl"/></label>
        {error && <p className="mb-4 rounded-xl bg-destructive/10 p-3 font-bold text-destructive">{error}</p>}
        <button disabled={busy} className="flex min-h-16 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-xl font-bold text-primary-foreground disabled:opacity-50"><LogIn className="size-6"/>{busy ? "ログイン中..." : "ログイン"}</button>
      </form> : <>
        <div className="mb-4 flex items-center gap-2 rounded-xl bg-primary/10 px-4 py-3 font-bold text-primary"><ShieldCheck className="size-5"/>大会本部としてログイン中{session.user?.email ? `：${session.user.email}` : ""}</div>
        <div className="mb-6 flex gap-2 rounded-2xl border-2 border-border bg-card p-2">{tabs.map(t=>{const Icon=t.icon; const active=tab===t.id; return <button key={t.id} type="button" onClick={()=>setTab(t.id)} className={`flex min-h-16 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xl font-bold ${active?"bg-primary text-primary-foreground shadow-sm":"text-muted-foreground"}`}><Icon className="size-6"/><span>{t.label}</span></button>})}</div>
        {tab === "requests" && <RequestPanel accessToken={session.access_token} />}
        {tab === "settlement" && <SettlementPanel />}
        {tab === "startlist" && <StartListViewer />}
      </>}
    </main>
  </div>
}
