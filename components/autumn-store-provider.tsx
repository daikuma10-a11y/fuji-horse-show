"use client"

import { useEffect, useState, type ReactNode } from "react"
import { loadAutumnData } from "@/lib/load-autumn-data"
import type { AutumnStoreSeed } from "@/lib/autumn-db-loader"
import { StoreProvider } from "@/lib/store"

export function AutumnStoreProvider({ children }: { children: ReactNode }) {
  const [seed, setSeed] = useState<AutumnStoreSeed | undefined>()
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let active = true
    loadAutumnData()
      .then(data => {
        if (active && data) setSeed(data)
      })
      .catch(error => console.error("Autumn data load failed", error))
      .finally(() => {
        if (active) setLoaded(true)
      })
    return () => { active = false }
  }, [])

  if (!loaded) {
    return <main className="mx-auto max-w-3xl p-6 text-center">オータム大会データを読み込み中...</main>
  }

  return <StoreProvider seed={seed}>{children}</StoreProvider>
}
