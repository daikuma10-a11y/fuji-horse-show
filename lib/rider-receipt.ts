import type { SettlementReceipt } from './settlement-receipts'
import type { SettlementChoice } from './settlement-selection'

export type ReceiptSourceItem = { key: string; riderId: string; rider: string; label: string; amount: number; paid: number }
export type RiderReceiptChoice = ReceiptSourceItem & SettlementChoice

// Receipt-only documents describe existing payments. They never become payment allocations.
export function riderReceiptChoices(sources: ReceiptSourceItem[], receipts: SettlementReceipt[]): RiderReceiptChoice[] {
  return sources.map(source => {
    const limit = Math.max(0, Math.min(source.amount, source.paid))
    const issued = receipts.flatMap(receipt => receipt.document_items ?? []).filter(item => item.key === source.key).reduce((sum, item) => sum + item.amount, 0)
    return { ...source, limit, remaining: Math.max(0, limit - issued) }
  })
}
