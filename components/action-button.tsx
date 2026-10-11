"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"

type Variant = "primary" | "danger" | "neutral"

const styles: Record<Variant, string> = {
  primary: "bg-primary text-primary-foreground disabled:bg-muted disabled:text-muted-foreground",
  danger: "bg-destructive text-white disabled:bg-muted disabled:text-muted-foreground",
  neutral: "bg-card text-foreground border-2 border-border",
}

export function ActionButton({
  children,
  variant = "primary",
  className = "",
  ...props
}: {
  children: ReactNode
  variant?: Variant
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...props}
      className={`flex min-h-16 w-full items-center justify-center rounded-2xl px-6 text-2xl font-bold shadow-sm transition active:scale-[0.98] disabled:cursor-not-allowed disabled:shadow-none ${styles[variant]} ${className}`}
    >
      {children}
    </button>
  )
}
