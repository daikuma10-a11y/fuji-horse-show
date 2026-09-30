"use client"
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatYen } from '@/lib/fees'
import { ReceiptPrint, StatementPrint } from './settlement-print-layouts'
import type { AdminSession } from '@/lib/supabase-rest'
import { downloadSettlementWorkbook, type SettlementDocument } from '@/lib/settlement-document'
import { createSettlementReceipt, loadSettlementReceipts, type SettlementReceipt } from '@/lib/settlement-receipts'

const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
export function SettlementDocuments({ document, session, ready }: { document: SettlementDocument; session: AdminSession; ready: boolean }) {
  const [showReceipt, setShowReceipt] = useState(false)
  const [receipts, setReceipts] = useState<SettlementReceipt[]>([])
  const [receipt, setReceipt] = useState<SettlementReceipt | null>(null)
  const [mode, setMode] = useState<'settlement' | 'receipt'>('settlement')
  const [printTick, setPrintTick] = useState(0)
  const [recipient, setRecipient] = useState(document.organization)
  const [amount, setAmount] = useState('')
  const [tax, setTax] = useState('0')
  const [date, setDate] = useState(today)
  const [purpose, setPurpose] = useState('2026 Fuji Horse Show Autumn Grand Prix エントリー代として')
  const [method, setMethod] = useState<'cash_at_venue' | 'bank_transfer'>('cash_at_venue')
  const [issuer, setIssuer] = useState('有限会社 富士ファーム')
  const [address, setAddress] = useState('〒412-0048\n静岡県御殿場市板妻861\nTEL：0550-88-1033\nFAX：0550-88-1048')
  const [registration, setRegistration] = useState('')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const receiptId = useRef<string | null>(null)
  useEffect(() => { let active = true; loadSettlementReceipts(session, document.organizationKey).then(rows => { if (active) setReceipts(rows) }).catch(cause => { if (active) setError(cause instanceof Error ? cause.message : '領収書履歴を読み込めません') }); return () => { active = false } }, [session, document.organizationKey])
  useEffect(() => { if (!printTick) return; const timer = window.setTimeout(() => window.print(), 50); return () => window.clearTimeout(timer) }, [printTick])
  const print = (nextMode: 'settlement' | 'receipt') => { setMode(nextMode); setPrintTick(previous => previous + 1) }
  const change = () => { receiptId.current = null; setError('') }
  async function issue(event: FormEvent) {
    event.preventDefault()
    if (savingRef.current) return
    if (!/^\d+$/.test(amount) || !/^\d+$/.test(tax)) { setError('受領金額と消費税額は整数で入力してください'); return }
    savingRef.current = true; setSaving(true); setError('')
    try {
      receiptId.current ??= crypto.randomUUID()
      const saved = await createSettlementReceipt(session, { organization_key: document.organizationKey, recipient: recipient.trim(), amount: Number(amount), tax_amount: Number(tax), issue_date: date, purpose: purpose.trim(), payment_method: method, issuer_name: issuer.trim(), issuer_address: address.trim(), registration_number: registration.trim() }, receiptId.current)
      setReceipt(saved); setReceipts(previous => [saved, ...previous.filter(row => row.id !== saved.id)]); print('receipt')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '領収書を作成できませんでした') }
    finally { savingRef.current = false; setSaving(false) }
  }
  return <>
    <div className="print-hide rounded-2xl border-2 border-primary/30 bg-card p-4">
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { if (!ready) { setError('支払案内の変更を保存してから印刷してください'); return } print('settlement') }} className="min-h-12 rounded-lg bg-primary px-4 font-bold text-primary-foreground">精算書を印刷</button><button type="button" onClick={() => { if (!ready) { setError('支払案内を保存してからダウンロードしてください'); return } downloadSettlementWorkbook(document) }} className="min-h-12 rounded-lg border border-primary px-4 font-bold text-primary">精算書をExcelで保存</button><button type="button" onClick={() => setShowReceipt(value => !value)} className="min-h-12 rounded-lg border border-primary px-4 font-bold text-primary">領収書を作成・印刷</button></div>
      <p className="mt-2 text-sm text-muted-foreground">精算書は事前エントリーの合計と追加・変更・棄権の人馬別明細を出力します。Excelで編集した内容はアプリには自動反映されません。</p>
      <details className="mt-3"><summary className="cursor-pointer font-bold">精算書のプレビュー</summary><div className="mt-3 overflow-x-auto rounded-lg border bg-white p-3 text-black"><StatementPrint document={document} /></div></details>
      {error && <p role="alert" className="mt-3 font-semibold text-destructive">{error}</p>}
      {showReceipt && <form onSubmit={issue} className="mt-4 space-y-3 border-t pt-4">
        <h4 className="text-xl font-bold">領収書の発行</h4><p className="text-sm">実際に受領した金額を入力してください。領収書の発行だけでは精算の入金済み金額は変更しません。</p>
        <label className="block font-bold">宛名<input required maxLength={200} value={recipient} onChange={event => { setRecipient(event.target.value); change() }} className="document-input" /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block font-bold">受領金額（円）<input required type="number" min="1" step="1" value={amount} onChange={event => { setAmount(event.target.value); setTax(String(Math.floor(Number(event.target.value) / 11))); change() }} className="document-input" /></label><label className="block font-bold">消費税額（10%内税・修正可）<input required type="number" min="0" step="1" value={tax} onChange={event => { setTax(event.target.value); change() }} className="document-input" /></label></div>
        <p className="text-xs text-muted-foreground">内税額は受領金額から計算し、1円未満を切り捨てた初期値です。発行前に確認してください。</p>
        <label className="block font-bold">受領日・発行日<input required type="date" value={date} onChange={event => { setDate(event.target.value); change() }} className="document-input" /></label>
        <label className="block font-bold">受領方法<select value={method} onChange={event => { setMethod(event.target.value as typeof method); change() }} className="document-input"><option value="cash_at_venue">当日現金</option><option value="bank_transfer">振込</option></select></label>
        <label className="block font-bold">但し書き<input required maxLength={500} value={purpose} onChange={event => { setPurpose(event.target.value); change() }} className="document-input" /></label>
        <label className="block font-bold">発行者名<input required maxLength={200} value={issuer} onChange={event => { setIssuer(event.target.value); change() }} className="document-input" /></label>
        <label className="block font-bold">発行者の住所・連絡先<textarea maxLength={1000} value={address} onChange={event => { setAddress(event.target.value); change() }} className="document-input min-h-28" /></label>
        <label className="block font-bold">登録番号（記載する場合）<input maxLength={14} pattern="T[0-9]{13}" value={registration} placeholder="T＋13桁の数字" onChange={event => { setRegistration(event.target.value); change() }} className="document-input" /></label>
        <button type="submit" disabled={saving} className="min-h-12 rounded-lg bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50">{saving ? '保存中…' : '発行内容を保存して領収書を印刷'}</button>
      </form>}
      {receipts.length > 0 && <details className="mt-4"><summary className="cursor-pointer font-bold">発行済み領収書（再印刷）</summary>{receipts.map(row => <div key={row.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2"><span>{row.issue_date} ／ {row.recipient} ／ {formatYen(row.amount)}</span><button type="button" onClick={() => { setReceipt(row); print('receipt') }} className="min-h-10 rounded-lg border px-3">再印刷</button></div>)}</details>}
    </div>
    <div className="print-only hidden document-page">
      {mode === 'receipt' && receipt ? <ReceiptPrint receipt={receipt} /> : <StatementPrint document={document} />}
    </div>
  </>
}
