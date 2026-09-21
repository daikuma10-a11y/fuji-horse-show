"use client"

import type { ReactNode } from "react"
import { ArrowLeft } from "lucide-react"
import { AppHeader } from "./app-header"

interface StepShellProps {
  subtitle: string
  /** 現在のステップ見出し */
  title: string
  /** 補足説明（簡潔に） */
  description?: string
  onBack?: () => void
  backLabel?: string
  children: ReactNode
  /** 画面下部の固定操作エリア */
  footer?: ReactNode
}

export function StepShell({
  subtitle,
  title,
  description,
  onBack,
  backLabel = "もどる",
  children,
  footer,
}: StepShellProps) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <AppHeader subtitle={subtitle} />

      <main className="mx-auto w-full max-w-5xl flex-1 px-5 py-6">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="mb-5 inline-flex min-h-14 items-center gap-2 rounded-xl border-2 border-border bg-card px-5 text-xl font-semibold text-foreground active:scale-[0.98]"
          >
            <ArrowLeft className="size-6" aria-hidden="true" />
            {backLabel}
          </button>
        )}

        <h1 className="text-3xl font-bold text-foreground sm:text-4xl">{title}</h1>
        {description && <p className="mt-2 text-xl text-muted-foreground">{description}</p>}

        <div className="mt-6 pb-4">{children}</div>
      </main>

      {footer && (
        <div className="sticky bottom-0 z-10 border-t-2 border-border bg-card/95 backdrop-blur">
          <div className="mx-auto w-full max-w-5xl px-5 py-4">{footer}</div>
        </div>
      )}
    </div>
  )
}
