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
    if (account.remaining === 0 && !account.warnings.length) return []
    const missingFees = account.warnings.some(message => message.includes('料金履歴'))
    const notes = [...account.warnings]
    if (account.remaining < 0) notes.push(`返金・充当の確認額：${(-account.remaining).toLocaleString('ja-JP')}円`)
    if (account.instruction) notes.push(account.instruction.payment_method === 'bank_transfer' ? '支払予定：後日振込' : '支払予定：当日現金')
    if (account.advance?.note.trim()) notes.push(account.advance.note.trim())
    return [{ id: org.id, name: org.name, amount: missingFees || account.remaining < 0 ? null : account.remaining, notes: notes.join(' '), review: !!account.warnings.length }]
  })
}
