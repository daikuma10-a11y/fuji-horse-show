"use client"

import Link from "next/link"
import type { ReactNode } from "react"
import { CheckCircle2 } from "lucide-react"
import { AppHeader } from "./app-header"

export function SummaryCard({
  title,
  tone = "neutral",
  children,
}: {
  title?: string
  tone?: "neutral" | "danger" | "primary"
  children: ReactNode
}) {
  const toneClass =
    tone === "danger"
      ? "border-destructive/40 bg-destructive/5"
      : tone === "primary"
        ? "border-primary/40 bg-primary/5"
        : "border-border bg-card"
  return (
    <div className={`rounded-2xl border-2 p-5 ${toneClass}`}>
      {title && <h2 className="mb-3 text-xl font-bold text-muted-foreground">{title}</h2>}
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

export function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/60 pb-2 last:border-0 last:pb-0">
      <span className="text-lg font-semibold text-muted-foreground">{label}</span>
      <span className="text-right text-2xl font-bold text-foreground">{value}</span>
    </div>
  )
}

/** 申請完了画面（全フロー共通） */
export function CompletionScreen({
  subtitle,
  message,
  currentType,
  onContinue,
}: {
  subtitle: string
  message: string
  currentType: "add" | "change" | "withdraw"
  onContinue: () => void
}) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader subtitle={subtitle} />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center justify-center px-5 py-10 text-center">
        <CheckCircle2 className="size-24 text-primary" aria-hidden="true" />
        <h1 className="mt-6 text-4xl font-bold text-foreground">受付が完了しました</h1>
        <p className="mt-4 text-2xl text-foreground">{message}</p>
        <p className="mt-2 text-xl text-muted-foreground">
          料金は大会本部にて所属団体ごとにまとめて精算します。
        </p>
        <h2 className="mt-8 text-xl font-bold text-foreground">次の受付を続ける</h2>
        <div className="mt-3 grid w-full max-w-md gap-3">
          {([
            { type: "add" as const, label: "続けて追加", href: "/add", color: "bg-[oklch(0.46_0.1_155)] text-white" },
            { type: "change" as const, label: "続けて変更", href: "/change", color: "bg-accent text-accent-foreground" },
            { type: "withdraw" as const, label: "続けて棄権", href: "/withdraw", color: "bg-destructive text-white" },
          ]).map(action => action.type === currentType ? (
            <button key={action.type} type="button" onClick={onContinue} className={`flex min-h-14 items-center justify-center rounded-xl px-4 text-xl font-bold ${action.color}`}>{action.label}</button>
          ) : (
            <Link key={action.type} href={action.href} className={`flex min-h-14 items-center justify-center rounded-xl px-4 text-xl font-bold ${action.color}`}>{action.label}</Link>
          ))}
        </div>
        <Link href="/" className="mt-7 inline-flex min-h-14 w-full max-w-md items-center justify-center rounded-xl border-2 border-border bg-card px-5 text-lg font-bold text-foreground">最初の画面にもどる</Link>
      </main>
    </div>
  )
}
