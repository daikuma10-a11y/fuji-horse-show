"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeft, ClipboardList, Calculator, ListOrdered } from "lucide-react"
import { AppHeader } from "@/components/app-header"
import { RequestPanel } from "@/components/admin/request-panel"
import { SettlementPanel } from "@/components/admin/settlement-panel"
import { StartListViewer } from "@/components/admin/startlist-viewer"
import { useStore } from "@/lib/store"

type Tab = "requests" | "settlement" | "startlist"

const tabs: { id: Tab; label: string; icon: typeof ClipboardList }[] = [
  { id: "requests", label: "申請一覧", icon: ClipboardList },
  { id: "settlement", label: "精算", icon: Calculator },
  { id: "startlist", label: "出番表", icon: ListOrdered },
]

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("requests")
  const { requests } = useStore()
  const pendingCount = requests.filter((r) => r.status === "pending").length

  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader subtitle="大会本部 管理画面" />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
        <Link
          href="/"
          className="mb-5 inline-flex min-h-14 items-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-xl font-semibold text-foreground active:scale-[0.98]"
        >
          <ArrowLeft className="size-6" aria-hidden="true" />
          受付画面へ
        </Link>

        <div className="mb-6 flex gap-2 rounded-2xl border-2 border-border bg-card p-2">
          {tabs.map((t) => {
            const Icon = t.icon
            const active = tab === t.id
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`flex min-h-16 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xl font-bold transition ${
                  active ? "bg-primary text-primary-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                <Icon className="size-6" aria-hidden="true" />
                <span>{t.label}</span>
                {t.id === "requests" && pendingCount > 0 && (
                  <span className="flex size-7 items-center justify-center rounded-full bg-destructive text-base text-white">
                    {pendingCount}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        {tab === "requests" && <RequestPanel />}
        {tab === "settlement" && <SettlementPanel />}
        {tab === "startlist" && <StartListViewer />}
      </main>
    </div>
  )
}
