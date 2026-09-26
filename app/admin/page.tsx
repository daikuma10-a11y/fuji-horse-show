"use client"

import { useEffect, useState, type FormEvent } from "react"
import Link from "next/link"
import { ArrowLeft, ClipboardList, Calculator, ListOrdered, LogIn, LogOut } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { RequestPanel } from "@/components/admin/request-panel"
import { SettlementPanel } from "@/components/admin/settlement-panel"
import { StartListViewer } from "@/components/admin/startlist-viewer"
import { useStore } from "@/lib/store"
import { ADMIN_SESSION_KEY, verifyAdminSession, signInAdmin, type AdminSession } from "@/lib/supabase-rest"

type Tab = "requests" | "settlement" | "startlist"

const tabs: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
  { id: "requests", label: "申請一覧", icon: ClipboardList },
  { id: "settlement", label: "精算", icon: Calculator },
  { id: "startlist", label: "出番表", icon: ListOrdered },
]

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("requests")
  const [session, setSession] = useState<AdminSession | null>(null)
  const [checking, setChecking] = useState(true)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [loggingIn, setLoggingIn] = useState(false)
  const { requests } = useStore()
  const pendingCount = requests.filter((r) => r.status === "pending").length

  useEffect(() => {
    let active = true
    const raw = sessionStorage.getItem(ADMIN_SESSION_KEY)
    if (!raw) { setChecking(false); return }
    try {
      const saved = JSON.parse(raw) as AdminSession
      verifyAdminSession(saved).then((next) => {
        if (!active) return
        sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(next))
        setSession(next)
      }).catch(() => sessionStorage.removeItem(ADMIN_SESSION_KEY)).finally(() => { if (active) setChecking(false) })
    } catch {
      sessionStorage.removeItem(ADMIN_SESSION_KEY)
      setChecking(false)
    }
    return () => { active = false }
  }, [])

  async function handleLogin(event: FormEvent) {
    event.preventDefault()
    setLoggingIn(true)
    setLoginError("")
    try {
      const next = await signInAdmin(email.trim(), password)
      sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(next))
      setSession(next)
      setPassword("")
    } catch (error) {
      setLoginError(error instanceof Error ? error.message : "ログインに失敗しました")
    } finally {
      setLoggingIn(false)
    }
  }

  function logout() {
    sessionStorage.removeItem(ADMIN_SESSION_KEY)
    setSession(null)
    setPassword("")
  }

  if (checking) return <div className="flex min-h-dvh flex-col bg-background"><AppHeader subtitle="大会本部 管理画面" /><main className="mx-auto w-full max-w-xl flex-1 px-5 py-10 text-center text-xl font-semibold">本部ログインを確認しています…</main></div>

  if (!session) return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader subtitle="大会本部 管理画面" />
      <main className="mx-auto w-full max-w-xl flex-1 px-5 py-8">
        <Link href="/" className="mb-6 inline-flex min-h-14 items-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-xl font-semibold"><ArrowLeft className="size-6" />受付画面へ</Link>
        <form onSubmit={handleLogin} className="rounded-2xl border-2 border-border bg-card p-6 shadow-sm">
          <div className="mb-6 flex items-center gap-3"><LogIn className="size-8" /><div><h1 className="text-2xl font-bold">本部ログイン</h1><p className="mt-1 text-muted-foreground">管理者アカウントでログインしてください</p></div></div>
          <label className="mb-4 block text-lg font-semibold">メールアドレス<input type="email" required autoComplete="username" value={email} onChange={(e)=>setEmail(e.target.value)} className="mt-2 min-h-14 w-full rounded-xl border-2 border-border bg-background px-4 text-lg" /></label>
          <label className="mb-5 block text-lg font-semibold">パスワード<input type="password" required autoComplete="current-password" value={password} onChange={(e)=>setPassword(e.target.value)} className="mt-2 min-h-14 w-full rounded-xl border-2 border-border bg-background px-4 text-lg" /></label>
          {loginError && <p className="mb-4 rounded-xl bg-destructive/10 p-4 font-semibold text-destructive">{loginError}</p>}
          <button type="submit" disabled={loggingIn} className="min-h-16 w-full rounded-xl bg-primary px-5 text-xl font-bold text-primary-foreground disabled:opacity-50">{loggingIn ? "ログイン中…" : "本部へログイン"}</button>
        </form>
      </main>
    </div>
  )

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader subtitle="大会本部 管理画面" />
      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <Link href="/" className="inline-flex min-h-14 items-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-xl font-semibold"><ArrowLeft className="size-6" />受付画面へ</Link>
          <button type="button" onClick={logout} className="inline-flex min-h-14 items-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-lg font-semibold"><LogOut className="size-5" />ログアウト</button>
        </div>
        <div className="mb-6 flex gap-2 rounded-2xl border-2 border-border bg-card p-2">
          {tabs.map((t) => { const Icon=t.icon, active=tab===t.id; return <button key={t.id} type="button" onClick={()=>setTab(t.id)} className={`flex min-h-16 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xl font-bold transition ${active?"bg-primary text-primary-foreground shadow-sm":"text-muted-foreground"}`}><Icon className="size-6" /><span>{t.label}</span>{t.id==="requests"&&pendingCount>0&&<span className="flex size-7 items-center justify-center rounded-full bg-destructive text-base text-white">{pendingCount}</span>}</button> })}
        </div>
        {tab === "requests" && <RequestPanel canManage={!!session} />}
        {tab === "settlement" && <SettlementPanel />}
        {tab === "startlist" && <StartListViewer canReorder={!!session} />}
      </main>
    </div>
  )
}
