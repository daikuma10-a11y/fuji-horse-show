"use client"
import { useRef, useState, type FormEvent } from 'react'
import { formatYen } from '@/lib/fees'
import { riderReceiptChoices, type ReceiptSourceItem } from '@/lib/rider-receipt'
import { allocateSettlement } from '@/lib/settlement-selection'
import { createSettlementReceipt, type SettlementReceipt } from '@/lib/settlement-receipts'
import type { AdminSession } from '@/lib/supabase-rest'

type Props = { organizationKey: string; organization: string; sources: ReceiptSourceItem[]; receipts: SettlementReceipt[]; session: AdminSession; onBeforeIssue: () => Promise<void>; onSaved: (receipt: SettlementReceipt) => void }
export function RiderReceiptForm({ organizationKey, organization, sources, receipts, session, onBeforeIssue, onSaved }: Props) {
  const choices = riderReceiptChoices(sources, receipts)
  const riders = Array.from(new Map(sources.filter(item => item.riderId).map(item => [item.riderId, item.rider])).entries()).sort((a, b) => a[1].localeCompare(b[1], 'ja'))
  const [riderId, setRiderId] = useState('')
  const [selected, setSelected] = useState<string[]>([])
  const [recipient, setRecipient] = useState(organization)
  const [amount, setAmount] = useState('0')
  const [tax, setTax] = useState('0')
  const [date, setDate] = useState(() => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date()))
  const [method, setMethod] = useState<'bank_transfer' | 'cash_at_venue'>('bank_transfer')
  const [purpose, setPurpose] = useState('2026 Fuji Horse Show Autumn Grand Prix エントリー代として')
  const [issuer, setIssuer] = useState('有限会社 富士ファーム')
  const [address, setAddress] = useState('〒412-0048\n静岡県御殿場市板妻861\nTEL：0550-88-1033\nFAX：0550-88-1048')
  const [registration, setRegistration] = useState('')
  const [confirmed, setConfirmed] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const savingRef = useRef(false)
  const receiptId = useRef<string | null>(null)
  const visible = choices.filter(item => item.riderId === riderId)
  const selectedChoices = visible.filter(item => selected.includes(item.key))
  const selectedTotal = selectedChoices.reduce((sum, item) => sum + item.remaining, 0)
  const change = () => { setConfirmed(false); setError(''); receiptId.current = null }
  function choose(nextKeys: string[], nextChoices = visible) {
    setSelected(nextKeys)
    const total = nextChoices.filter(item => nextKeys.includes(item.key)).reduce((sum, item) => sum + item.remaining, 0)
    setAmount(String(total)); setTax(String(Math.floor(total / 11))); change()
  }
  async function submit(event: FormEvent) {
    event.preventDefault()
    if (savingRef.current) return
    if (!confirmed) { setError('対象・宛名・入金済みであることを確認してください'); return }
    if (!/^\d+$/.test(amount) || !/^\d+$/.test(tax)) { setError('金額は整数で入力してください'); return }
    const documentItems = (() => { try { return allocateSettlement(visible, selected, Number(amount)) } catch (cause) { setError(cause instanceof Error ? cause.message : '対象と金額を確認してください'); return null } })()
    if (!documentItems) return
    savingRef.current = true; setSaving(true); setError('')
    try {
      await onBeforeIssue()
      receiptId.current ??= crypto.randomUUID()
      const saved = await createSettlementReceipt(session, { organization_key: organizationKey, recipient: recipient.trim(), amount: Number(amount), tax_amount: Number(tax), issue_date: date, payment_method: method, purpose: purpose.trim(), issuer_name: issuer.trim(), issuer_address: address.trim(), registration_number: registration.trim(), selected_items: [], document_items: documentItems }, receiptId.current)
      onSaved(saved); setSelected([]); setAmount('0'); setTax('0'); setConfirmed(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : '領収書を保存できませんでした') }
    finally { savingRef.current = false; setSaving(false) }
  }
  return <details className="mt-4 rounded-xl border-2 border-primary/30 p-3">
    <summary className="cursor-pointer py-2 text-lg font-bold">選手別・別宛名の領収書のみ作成</summary>
    <p className="mt-2 text-sm">団体で精算した後、入金済みの選手の分だけ別の宛名で発行できます。団体の入金済み金額・差引残額は変わりません。</p>
    <form onSubmit={submit} className="mt-3"><fieldset disabled={saving} className="space-y-3">
      <label className="block font-bold">対象の選手<select required value={riderId} className="document-input" onChange={event => { const id = event.target.value; const next = choices.filter(item => item.riderId === id); setRiderId(id); choose(next.filter(item => item.remaining > 0).map(item => item.key), next) }}><option value="">選手を選んでください</option>{riders.map(([id, name]) => <option key={id} value={id}>{name}{riders.some(([otherId, otherName]) => otherId !== id && otherName === name) ? `（ID：${id}）` : ''}</option>)}</select></label>
      {riderId && <><div className="flex flex-wrap gap-2"><button type="button" onClick={() => choose(visible.filter(item => item.remaining > 0).map(item => item.key))} className="min-h-10 rounded-lg border px-3">発行できる明細をすべて選択</button><button type="button" onClick={() => choose([])} className="min-h-10 rounded-lg border px-3">選択を解除</button></div><div className="max-h-[45vh] overflow-y-auto rounded-lg border">{visible.map(item => <label key={item.key} className={`flex items-center gap-3 border-b p-3 ${item.remaining <= 0 ? 'text-muted-foreground' : ''}`}><input type="checkbox" className="size-6 shrink-0" disabled={item.remaining <= 0} checked={selected.includes(item.key)} onChange={event => choose(event.target.checked ? [...selected, item.key] : selected.filter(key => key !== item.key))} /><span className="flex-1 text-sm">{item.label}<span className="mt-1 block text-xs">{item.paid <= 0 ? item.amount === 0 ? '0円・領収対象外' : '入金の確認が必要' : item.remaining <= 0 ? '発行済み・履歴から再印刷できます' : `入金済み：${formatYen(item.paid)} ／ 発行できる金額：${formatYen(item.remaining)}`}</span></span></label>)}</div></>}
      <p className="rounded-lg bg-primary/5 p-3 font-bold">対象：{selectedChoices.length}件 ／ {formatYen(selectedTotal)}</p>
      <p className="text-xs text-muted-foreground">事前エントリーは、団体の事前料金が全額入金済みの場合に選手別に発行できます。一部入金では選手ごとの支払分を特定できないため、通常分は選択できません。追加・変更は各明細の入金済み分が対象です。</p>
      <label className="block font-bold">領収書の宛名<input required maxLength={200} className="document-input" value={recipient} onChange={event => { setRecipient(event.target.value); change() }} placeholder="例：千葉県馬術連盟" /></label>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block font-bold">領収金額（円）<input required type="number" min="1" max={selectedTotal} step="1" className="document-input" value={amount} onChange={event => { setAmount(event.target.value); setTax(String(Math.floor(Number(event.target.value) / 11))); change() }} /></label><label className="block font-bold">消費税額（10%内税・修正可）<input required type="number" min="0" step="1" className="document-input" value={tax} onChange={event => { setTax(event.target.value); change() }} /></label></div>
      <p className="text-xs text-muted-foreground">金額は選択分を自動入力します。減額した場合は表示順に充当します。</p>
      <div className="grid gap-3 sm:grid-cols-2"><label className="block font-bold">受領日・発行日<input required type="date" className="document-input" value={date} onChange={event => { setDate(event.target.value); change() }} /></label><label className="block font-bold">受領方法<select className="document-input" value={method} onChange={event => { setMethod(event.target.value as typeof method); change() }}><option value="bank_transfer">振込</option><option value="cash_at_venue">現金</option></select></label></div>
      <label className="block font-bold">但し書き<input required maxLength={500} className="document-input" value={purpose} onChange={event => { setPurpose(event.target.value); change() }} /></label>
      <details><summary className="cursor-pointer py-2 font-bold">発行者情報</summary><label className="block font-bold">発行者名<input required maxLength={200} className="document-input" value={issuer} onChange={event => { setIssuer(event.target.value); change() }} /></label><label className="mt-2 block font-bold">住所・連絡先<textarea maxLength={1000} className="document-input min-h-28" value={address} onChange={event => { setAddress(event.target.value); change() }} /></label><label className="mt-2 block font-bold">登録番号（記載する場合）<input maxLength={14} pattern="T[0-9]{13}" className="document-input" placeholder="T＋13桁の数字" value={registration} onChange={event => { setRegistration(event.target.value); change() }} /></label></details>
      <label className="flex items-start gap-3 rounded-lg border-2 border-primary/30 p-3 font-bold"><input type="checkbox" required className="mt-1 size-6 shrink-0" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />対象・金額・宛名と入金済みであることを確認しました。既に団体名義の領収書を渡している場合は、その原本と重複して渡さないことも確認しました。</label>
      {error && <p role="alert" className="font-semibold text-destructive">{error}</p>}
      <button type="submit" disabled={saving || !confirmed || selectedTotal <= 0} className="min-h-12 rounded-lg bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50">{saving ? '保存中…' : '領収書のみ保存して印刷'}</button>
    </fieldset></form>
  </details>
}
