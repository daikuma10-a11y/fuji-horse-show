"use client"

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"
import { StoreProvider } from "@/lib/store"

/** Winter画面ではAutumnのストア・購読・ブラウザー保存処理を起動しない。 */
export function EventStoreBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (pathname === "/winter" || pathname.startsWith("/winter/")) return children
  return <StoreProvider>{children}</StoreProvider>
}
