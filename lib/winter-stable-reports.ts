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
    if (!missingFees && account.remaining > 0) status = paid > 0 ? '入金不足' : '未入金'
    return [{ id: org.id, name: org.name, status, amount: awaitingSettlement ? null : Math.abs(account.remaining), review: !!account.warnings.length }]
  })
}
