import { AUTUMN_EVENT_ID, type AdminSession, verifyAdminSession } from './supabase-rest'
const URL = 'https://mhgyhyxagkkwdiepifdp.supabase.co'
const KEY = 'sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95'
export type SettlementReceipt = {
  id: string; event_id: string; organization_key: string; recipient: string; amount: number; tax_amount: number
  issue_date: string; purpose: string; payment_method: 'bank_transfer' | 'cash_at_venue'
  issuer_name: string; issuer_address: string; registration_number: string; created_at: string; created_by: string
}
export type ReceiptInput = Omit<SettlementReceipt, 'id' | 'event_id' | 'created_at' | 'created_by'>
export async function loadSettlementReceipts(session: AdminSession, orgId: string): Promise<SettlementReceipt[]> {
  const verified = await verifyAdminSession(session)
  const response = await fetch(`${URL}/rest/v1/settlement_receipts?event_id=eq.${AUTUMN_EVENT_ID}&organization_key=eq.${encodeURIComponent(orgId)}&select=*&order=created_at.desc`, { headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}` }, cache: 'no-store' })
  if (!response.ok) throw new Error('領収書履歴を読み込めません')
  return response.json() as Promise<SettlementReceipt[]>
}
export async function createSettlementReceipt(session: AdminSession, input: ReceiptInput, id: string): Promise<SettlementReceipt> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0 || !Number.isSafeInteger(input.tax_amount) || input.tax_amount < 0 || input.tax_amount > input.amount || !input.recipient.trim() || !input.purpose.trim() || !input.issuer_name.trim() || !/^\d{4}-\d{2}-\d{2}$/.test(input.issue_date) || (input.registration_number && !/^T\d{13}$/.test(input.registration_number))) throw new Error('領収金額・宛名・日付・発行者情報を確認してください')
  const verified = await verifyAdminSession(session)
  const userResponse = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}` }, cache: 'no-store' })
  if (!userResponse.ok) throw new Error('本部ログインを確認できません')
  const user = await userResponse.json() as { id?: string }
  if (!user.id) throw new Error('担当者を確認できません')
  const body = { ...input, id, event_id: AUTUMN_EVENT_ID, created_by: user.id }
  const response = await fetch(`${URL}/rest/v1/settlement_receipts?on_conflict=id`, { method: 'POST', headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}`, 'Content-Type': 'application/json', Prefer: 'resolution=ignore-duplicates,return=representation' }, body: JSON.stringify(body) })
  if (!response.ok) throw new Error(`領収書を保存できません (${response.status})`)
  const confirmed = (await loadSettlementReceipts(verified, input.organization_key)).find(row => row.id === id)
  if (!confirmed || confirmed.amount !== input.amount || confirmed.recipient !== input.recipient) throw new Error('領収書の保存結果を確認できません')
  return confirmed
}
