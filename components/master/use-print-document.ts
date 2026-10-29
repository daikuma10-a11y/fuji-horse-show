"use client"
import { useEffect, useRef, useState } from 'react'

/** Open synchronously for iPad Safari, then load current saved data before printing. */
export function usePrintDocument() {
  const [busy, setBusy] = useState(false), [notice, setNotice] = useState(''), [error, setError] = useState('')
  const locked = useRef(false), alive = useRef(true)
  useEffect(() => { alive.current = true; return () => { alive.current = false } }, [])
  const clear = () => { setNotice(''); setError('') }
  async function print(load: () => Promise<string>, orientation: '横' | '縦', fit?: (doc: Document) => void) {
    if (locked.current) return
    locked.current = true; setBusy(true); clear(); setNotice('最新の登録内容を確認しています…')
    const popup = window.open('', '_blank')
    if (!popup) { locked.current = false; setBusy(false); setNotice(''); setError('印刷画面を開けませんでした。このサイトのポップアップを許可して、もう一度押してください。'); return }
    popup.opener = null
    popup.document.body.textContent = '最新の登録内容を確認しています…'
    const closed = () => {
      if (alive.current && !popup.closed) return false
      if (!popup.closed) popup.close()
      if (alive.current) setNotice('印刷画面を閉じました。もう一度開くには印刷ボタンを押してください。')
      return true
    }
    try {
      const html = await load()
      if (closed()) return
      popup.document.open(); popup.document.write(html); popup.document.close()
      await popup.document.fonts.ready
      if (closed()) return
      const runPrint = () => { if (!popup.closed) { fit?.(popup.document); popup.focus(); popup.print() } }
      popup.document.getElementById('stable-print')?.addEventListener('click', runPrint)
      popup.document.getElementById('stable-close')?.addEventListener('click', () => popup.close())
      popup.addEventListener('beforeprint', () => fit?.(popup.document))
      runPrint()
      if (alive.current) setNotice(`印刷画面を開きました。A4・${orientation}向き・片面で印刷してください。`)
    } catch (reason) {
      if (!popup.closed) popup.close()
      if (alive.current) { setError(reason instanceof Error ? reason.message : '印刷用の情報を取得できませんでした。'); setNotice('') }
    } finally { locked.current = false; if (alive.current) setBusy(false) }
  }
  return { busy, notice, error, clear, print }
}
