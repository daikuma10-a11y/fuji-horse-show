import type { SettlementDocument } from './settlement-document'
import type { ReceiptItem, SettlementReceipt } from './settlement-receipts'
export type SettlementChoice = { key: string; label: string; remaining: number; limit: number }
export function settlementChoices(document: SettlementDocument, receipts: SettlementReceipt[]): SettlementChoice[] {
  const settled = (key: string) => receipts.flatMap(row => row.selected_items ?? []).filter(item => item.key === key).reduce((sum, item) => sum + item.amount, 0)
  return [
    { key: 'normal', label: '事前エントリーの残額', remaining: Math.max(0, document.normalTotal - document.advancePaid), limit: document.normalRemaining ?? Math.max(0, document.normalTotal - document.advancePaid) },
    ...document.lines.map((line, index) => { const key = line.key ?? `line:${index}`; return { key, label: `${line.action} ／ ${line.competition} ／ ${line.rider} ／ ${line.horse}`, remaining: Math.max(0, line.amount - line.paid), limit: Math.max(0, line.amount - line.paid + settled(key)) } }),
  ]
}
// Allocate a partial receipt deterministically in competition order. Amounts never exceed the selected balances.
export function allocateSettlement(choices: SettlementChoice[], selected: string[], amount: number): ReceiptItem[] {
  const chosen = choices.filter(item => selected.includes(item.key))
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > chosen.reduce((sum, item) => sum + item.remaining, 0)) throw new Error('受領金額は選択した未精算額の範囲で入力してください')
  let rest = amount
  return chosen.map(item => { const paid = Math.min(rest, item.remaining); rest -= paid; return { key: item.key, label: item.label, amount: paid, limit: item.limit } }).filter(item => item.amount > 0)
}
export function selectedSettlementDocument(document: SettlementDocument, choices: SettlementChoice[], selected: string[]): SettlementDocument {
  const selectedChoices = choices.filter(item => selected.includes(item.key))
  const normal = selectedChoices.find(item => item.key === 'normal')?.remaining ?? 0
  const lines = document.lines.filter((line, index) => selected.includes(line.key ?? `line:${index}`)).map(line => { const remaining = Math.max(0, line.amount - line.paid); return { ...line, amount: remaining, entryFee: remaining, serviceFee: 0, difference: 0, paid: 0 } })
  const extra = lines.reduce((sum, item) => sum + item.amount, 0)
  return { ...document, organization: `${document.organization}（個別精算）`, normalTotal: normal, advancePaid: 0, advanceRecorded: false, extraTotal: extra, extraPaid: 0, due: normal + extra, lines }
}
