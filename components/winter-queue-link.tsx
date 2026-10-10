"use client"
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { readWinterQueue } from '@/lib/winter-batch'
export function WinterQueueLink() {
  const [count, setCount] = useState(0), [error, setError] = useState('')
  useEffect(() => {
    const update = () => { try { setCount(readWinterQueue(window.localStorage).items.length); setError('') } catch(reason) { setError(reason instanceof Error ? reason.message : '一覧を確認してください') } }
    update(); window.addEventListener('storage',update); window.addEventListener('winter-queue-changed',update)
    return () => { window.removeEventListener('storage',update); window.removeEventListener('winter-queue-changed',update) }
  }, [])
  return <div className="space-y-2"><Link href="/winter/confirm" className="flex min-h-16 items-center justify-center rounded-xl border-2 border-blue-800 bg-blue-50 p-4 text-2xl font-bold text-blue-950">未確定一覧を確認（{count}件）</Link>{error && <p role="alert" className="bg-red-100 p-3">{error}</p>}</div>
}
