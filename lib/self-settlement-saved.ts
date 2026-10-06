import type { selfSettlementAccount } from './self-settlement-account'

type Account = ReturnType<typeof selfSettlementAccount>
export type SavedSettlement = {
  id: string; organization_key: string; confirmed_by: string; payment_method: string
  amount: number; created_at: string; document: Account
}

function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([, item]) => item !== undefined).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`
  return JSON.stringify(value) ?? 'null'
}

// The issue date and the selected payment method change when confirmation is saved.
// Compare every charge, payment and warning instead of the event-wide version:
// unrelated organizations may change without invalidating this statement.
export function currentSavedSettlement(account: Account, records: SavedSettlement[]): SavedSettlement | null {
  const latest = records[0]
  if (!latest || latest.organization_key !== account.document.organizationKey || latest.amount !== account.document.due) return null
  const content = (input: Account) => {
    const { issuedDate, method, bankDetails, ...document } = input.document
    return canonical({ ...input, document })
  }
  if (content(latest.document) !== content(account)) return null
  if (account.document.due > 0 && (latest.document.document.method !== account.document.method || latest.document.document.bankDetails !== account.document.bankDetails)) return null
  return latest
}
