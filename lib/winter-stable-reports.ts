import type { UnsettledRow } from './master/stable-reports'
import type { loadWinterData } from './winter-data'
import { assertWinterEvent } from './winter-event'
import { compareWinterOrganizations } from './winter-display-order'
import { winterSettlementAccount, type WinterSettlementData } from './winter-settlement'

type Data = Awaited<ReturnType<typeof loadWinterData>>
/** Use the existing settlement ledger, including payment reversals and adjustments. No new payment calculation. */
export function winterUnsettledRows(data: Data, ledger: WinterSettlementData): UnsettledRow[] {
  assertWinterEvent(data.eventId)
  for (const row of [...data.organizations, ...data.riders, ...data.horses, ...data.competitions, ...data.entries]) assertWinterEvent(row.event_id)
  return [...data.organizations].sort(compareWinterOrganizations).flatMap(org => {
    const account = winterSettlementAccount(data, ledger, org.id)
    const paid = account.advancePaid + account.extraPaid
    const missingFees = account.warnings.some(message => message.includes('料金履歴'))
    const awaitingSettlement = missingFees || (account.remaining === 0 && account.pending > 0)
    if (account.remaining === 0 && !awaitingSettlement) return []

    let status: UnsettledRow['status'] = '未精算'
    if (!missingFees && account.remaining < 0) status = '過入金'
    if (!missingFees && account.remaining > 0 && paid > 0) status = '入金不足'
    const notes = [...account.warnings]
    if (status === '過入金') notes.push(`返金・充当の確認額：${(-account.remaining).toLocaleString('ja-JP')}円`)
    if (account.instruction) notes.push(account.instruction.payment_method === 'bank_transfer' ? '支払予定：後日振込' : '支払予定：当日現金')
    if (account.advance?.note.trim()) notes.push(account.advance.note.trim())
    return [{ id: org.id, name: org.name, status, amount: awaitingSettlement ? null : Math.abs(account.remaining), notes: notes.join(' '), review: !!account.warnings.length }]
  })
}
