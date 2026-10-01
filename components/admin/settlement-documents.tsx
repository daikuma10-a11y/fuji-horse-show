"use client"
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { formatYen } from '@/lib/fees'
import { ReceiptPrint, StatementPrint } from './settlement-print-layouts'
import { RiderReceiptForm } from './rider-receipt-form'
import type { ReceiptSourceItem } from '@/lib/rider-receipt'
import type { AdminSession } from '@/lib/supabase-rest'
import { downloadSettlementWorkbook, type SettlementDocument } from '@/lib/settlement-document'
import { createSettlementReceipt, type SettlementReceipt } from '@/lib/settlement-receipts'

import { settlementChoices, allocateSettlement, selectedSettlementDocument } from '@/lib/settlement-selection'

const today = () => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date())
export function SettlementDocuments({ document, receiptSources, session, ready, receipts, onReceiptSaved, onBeforeIssue }: { document: SettlementDocument; receiptSources: ReceiptSourceItem[]; session: AdminSession; ready: boolean; receipts: SettlementReceipt[]; onReceiptSaved: (row: SettlementReceipt) => void; onBeforeIssue: () => Promise<void> }) {
  const [showReceipt, setShowReceipt] = useState(false)
  const choices = settlementChoices(document, receipts)
  const [selected, setSelected] = useState<string[]>(() => choices.filter(item => item.key !== 'normal' && (item.remaining > 0 || item.freeWithdrawal)).map(item => item.key))
  const [printedDocument, setPrintedDocument] = useState(document)
  const selectedTotal = choices.filter(item => selected.includes(item.key)).reduce((sum, item) => sum + item.remaining, 0)
  const remainingCount = choices.filter(item => item.remaining > 0).length
  const selectedDocument = selectedSettlementDocument(document, choices, selected)
  const [receipt, setReceipt] = useState<SettlementReceipt | null>(null)
  const [mode, setMode] = useState<'settlement' | 'receipt'>('settlement')
  const [printTick, setPrintTick] = useState(0)
  const [recipient, setRecipient] = useState(document.organization)
  const [amount, setAmount] = useState(String(Math.max(0, document.due)))
  const [tax, setTax] = useState(String(Math.floor(Math.max(0, document.due) / 11)))
  const [date, setDate] = useState(today)
  const [purpose, setPurpose] = useState('2026 Fuji Horse Show Autumn Grand Prix エントリー代として')
  const [method, setMethod] = useState<'cash_at_venue' | 'bank_transfer'>('cash_at_venue')
  const [issuer, setIssuer] = useState('有限会社 富士ファーム')
  const [address, setAddress] = useState('〒412-0048\n静岡県御殿場市板妻861\nTEL：0550-88-1033\nFAX：0550-88-1048')
  const [registration, setRegistration] = useState('')
  const [error, setError] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const savingRef = useRef(false)
  const receiptId = useRef<string | null>(null)
  const amountEdited = useRef(false)
  useEffect(() => { if (!amountEdited.current) { const due = Math.max(0, document.due); setAmount(String(due)); setTax(String(Math.floor(due / 11))); receiptId.current = null } }, [document.due])

  useEffect(() => { if (!printTick) return; const timer = window.setTimeout(() => window.print(), 50); return () => window.clearTimeout(timer) }, [printTick])
  const print = (nextMode: 'settlement' | 'receipt') => { setMode(nextMode); setPrintTick(previous => previous + 1) }
  useEffect(() => { if (!savingRef.current) setConfirmed(false) }, [document.due, selectedTotal])
  const change = () => { receiptId.current = null; setError(''); setConfirmed(false) }
  function beginReceipt() { setShowReceipt(true); setAmount(String(Math.min(selectedTotal, Math.max(0, document.due)))); setTax(String(Math.floor(Math.min(selectedTotal, Math.max(0, document.due)) / 11))); amountEdited.current = true; change() }
  async function issue(event: FormEvent) {
    event.preventDefault()
    if (savingRef.current) return
    if (!confirmed) { setError('受領金額と対象を確認してください'); return }
    if (!/^\d+$/.test(amount) || !/^\d+$/.test(tax)) { setError('受領金額と消費税額は整数で入力してください'); return }
    if (Number(amount) > Math.max(0, document.due)) { setError('団体の差引残額を超える金額は精算できません'); return }
    savingRef.current = true; setSaving(true); setError('')
    try {
      await onBeforeIssue()
      receiptId.current ??= crypto.randomUUID()
      const saved = await createSettlementReceipt(session, { organization_key: document.organizationKey, recipient: recipient.trim(), amount: Number(amount), tax_amount: Number(tax), issue_date: date, purpose: purpose.trim(), payment_method: method, issuer_name: issuer.trim(), issuer_address: address.trim(), registration_number: registration.trim(), selected_items: allocateSettlement(choices, selected, Number(amount)) }, receiptId.current)
      setReceipt(saved); onReceiptSaved(saved); setSelected([]); setShowReceipt(false); print('receipt')
    } catch (cause) { setError(cause instanceof Error ? cause.message : '領収書を作成できませんでした') }
    finally { savingRef.current = false; setSaving(false) }
  }
  return <>
    <div className="print-hide rounded-2xl border-2 border-primary/30 bg-card p-4">
      <div className="flex flex-wrap gap-2"><button type="button" onClick={() => { if (!ready) { setError('支払案内の変更を保存してから印刷してください'); return } setPrintedDocument(document); print('settlement') }} className="min-h-12 rounded-lg bg-primary px-4 font-bold text-primary-foreground">精算書を印刷</button><button type="button" onClick={() => { if (!ready) { setError('支払案内を保存してからダウンロードしてください'); return } downloadSettlementWorkbook(document) }} className="min-h-12 rounded-lg border border-primary px-4 font-bold text-primary">精算書をExcelで保存</button><button type="button" disabled={saving || selectedTotal <= 0 || document.due <= 0} onClick={beginReceipt} className="min-h-12 rounded-lg border border-primary px-4 font-bold text-primary">選択分を精算・領収書作成</button></div>

      <div className="mt-4 rounded-xl border-2 border-primary/30 p-3">
        <h4 className="text-2xl font-bold">精算</h4>
        <p className="mt-1 text-sm">未精算の追加・変更と棄権はチェック済みです。個別に精算する場合は、対象外のチェックを外してください。実際に入金を受けてから「入金を記録して領収書を印刷」を押します。</p>
        <div className="sticky top-0 z-10 mt-3 rounded-lg bg-white p-3 text-black shadow-sm"><p className="font-bold">未精算 {remainingCount}件 ／ 選択 {selected.length}件</p><p className="text-2xl font-bold text-primary">選択分：{formatYen(selectedTotal)}</p><div className="mt-2 flex flex-wrap gap-2"><button type="button" disabled={saving} className="min-h-10 rounded-lg border px-3" onClick={() => { setSelected(choices.filter(item => item.remaining > 0 || item.freeWithdrawal).map(item => item.key)); setShowReceipt(false); change() }}>未精算と棄権をすべて選択</button><button type="button" disabled={saving} className="min-h-10 rounded-lg border px-3" onClick={() => { setSelected([]); setShowReceipt(false); change() }}>選択を解除</button><button type="button" disabled={!selected.length} className="min-h-10 rounded-lg border px-3" onClick={() => { if (!ready) { setError('支払案内を保存してください'); return } setPrintedDocument(selectedDocument); print('settlement') }}>選択分の精算書を印刷</button><button type="button" disabled={saving || selectedTotal <= 0 || document.due <= 0} className="min-h-10 rounded-lg bg-primary px-3 font-bold text-primary-foreground disabled:opacity-50" onClick={beginReceipt}>選択内容を確認・精算へ</button></div></div>
        <details className="mt-2"><summary className="cursor-pointer py-3 font-bold">精算する明細を選ぶ（未精算 {remainingCount}件・棄権も選択可）</summary><div className="max-h-[55vh] overflow-y-auto">{choices.map(item => <label key={item.key} className={`flex cursor-pointer items-center gap-3 border-t p-3 ${item.remaining <= 0 && !item.freeWithdrawal ? 'text-muted-foreground' : ''}`}><input type="checkbox" className="size-6 shrink-0" disabled={saving || (item.remaining <= 0 && !item.freeWithdrawal)} checked={selected.includes(item.key)} onChange={event => { setSelected(previous => event.target.checked ? [...previous, item.key] : previous.filter(key => key !== item.key)); setShowReceipt(false); change() }} /><span className="flex-1 text-sm font-semibold">{item.label}</span><span className="shrink-0 font-bold">{formatYen(item.remaining)}{item.freeWithdrawal ? '（棄権・精算書に記載）' : item.remaining <= 0 ? '（残額なし）' : ''}</span></label>)}</div></details>
        <p className="mt-2 text-xs text-muted-foreground">棄権は申請料0円で精算書に記載します。元のエントリー料金は返金せず、領収書には実際に受領した金額だけを記載します。</p>
      </div>
      <RiderReceiptForm organizationKey={document.organizationKey} organization={document.organization} sources={receiptSources} receipts={receipts} session={session} onBeforeIssue={onBeforeIssue} onSaved={row => { setReceipt(row); onReceiptSaved(row); print('receipt') }} />
      <p className="mt-2 text-sm text-muted-foreground">精算書は事前エントリーの合計と追加・変更・棄権の人馬別明細を出力します。Excelで編集した内容はアプリには自動反映されません。</p>
      <details className="mt-3"><summary className="cursor-pointer font-bold">精算書のプレビュー</summary><div className="mt-3 overflow-x-auto rounded-lg border bg-white p-3 text-black"><StatementPrint document={document} /></div></details>
      {error && <p role="alert" className="mt-3 font-semibold text-destructive">{error}</p>}
      {showReceipt && <form onSubmit={issue} className="mt-4 border-t pt-4"><fieldset disabled={saving} className="space-y-3">
        <h4 className="text-xl font-bold">選択分の精算・領収書の発行</h4><div className="rounded-lg bg-primary/5 p-3"><p className="font-bold">確認：{selected.length}件 ／ {formatYen(selectedTotal)}</p>{choices.filter(item => selected.includes(item.key)).map(item => <p key={item.key} className="mt-1 text-sm">{item.label}：{formatYen(item.remaining)}</p>)}</div><p className="text-sm">選択分の未精算額を初期入力しています。実際に受領した金額に修正できます。保存すると、選択した明細の入金として記録され、差引残額が減ります。金額を減らした場合は表示順に充当します。</p>
        <label className="block font-bold">宛名<input required maxLength={200} value={recipient} onChange={event => { setRecipient(event.target.value); change() }} className="document-input" /></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="block font-bold">受領金額（円）<input required type="number" min="1" step="1" value={amount} onChange={event => { amountEdited.current = true; setAmount(event.target.value); setTax(String(Math.floor(Number(event.target.value) / 11))); change() }} className="document-input" /></label><label className="block font-bold">消費税額（10%内税・修正可）<input required type="number" min="0" step="1" value={tax} onChange={event => { setTax(event.target.value); change() }} className="document-input" /></label></div>
        <p className="text-xs text-muted-foreground">内税額は受領金額から計算し、1円未満を切り捨てた初期値です。発行前に確認してください。</p>
        <label className="block font-bold">受領日・発行日<input required type="date" value={date} onChange={event => { setDate(event.target.value); change() }} className="document-input" /></label>
        <label className="block font-bold">受領方法<select value={method} onChange={event => { setMethod(event.target.value as typeof method); change() }} className="document-input"><option value="cash_at_venue">当日現金</option><option value="bank_transfer">振込</option></select></label>
        <label className="block font-bold">但し書き<input required maxLength={500} value={purpose} onChange={event => { setPurpose(event.target.value); change() }} className="document-input" /></label>
        <label className="block font-bold">発行者名<input required maxLength={200} value={issuer} onChange={event => { setIssuer(event.target.value); change() }} className="document-input" /></label>
        <label className="block font-bold">発行者の住所・連絡先<textarea maxLength={1000} value={address} onChange={event => { setAddress(event.target.value); change() }} className="document-input min-h-28" /></label>
        <label className="block font-bold">登録番号（記載する場合）<input maxLength={14} pattern="T[0-9]{13}" value={registration} placeholder="T＋13桁の数字" onChange={event => { setRegistration(event.target.value); change() }} className="document-input" /></label>
<label className="flex items-start gap-3 rounded-lg border-2 border-primary/30 p-3 font-bold"><input type="checkbox" required checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="mt-1 size-6 shrink-0" />対象・金額・宛名を確認し、実際に入金を受けました。</label>
        <button type="submit" disabled={saving || !confirmed} className="min-h-12 rounded-lg bg-primary px-5 font-bold text-primary-foreground disabled:opacity-50">{saving ? '保存中…' : '入金を記録して領収書を印刷'}</button>
      </fieldset></form>}
      {receipts.length > 0 && <details className="mt-4"><summary className="cursor-pointer font-bold">発行済み領収書（再印刷）</summary>{receipts.map(row => <div key={row.id} className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2"><span>{row.issue_date} ／ {row.recipient} ／ {formatYen(row.amount)} ／ {row.document_items?.length ? '領収書のみ・入金記録は追加なし' : row.selected_items?.length ? '精算済み' : '従来の領収書・入金記録は別管理'}</span><button type="button" onClick={() => { setReceipt(row); print('receipt') }} className="min-h-10 rounded-lg border px-3">再印刷</button></div>)}</details>}
    </div>
    <style>{`@media print { @page { size: A4 ${mode === 'settlement' ? 'landscape' : 'portrait'}; margin: 8mm; } }`}</style>
    <div className="print-only hidden document-page">
      {mode === 'receipt' && receipt ? <ReceiptPrint receipt={receipt} /> : <StatementPrint document={printedDocument} />}
    </div>
  </>
}
