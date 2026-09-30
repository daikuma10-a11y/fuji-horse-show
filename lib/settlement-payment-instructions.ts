import { AUTUMN_EVENT_ID, type AdminSession, verifyAdminSession } from './supabase-rest'

const URL = 'https://mhgyhyxagkkwdiepifdp.supabase.co'
const KEY = 'sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95'

export type PaymentInstruction = {
  event_id: string
  organization_key: string
  payment_method: 'bank_transfer' | 'cash_at_venue'
  bank_details: string
  updated_at: string
  updated_by: string
}

export async function loadPaymentInstructions(session: AdminSession): Promise<PaymentInstruction[]> {
  const verified = await verifyAdminSession(session)
  const response = await fetch(`${URL}/rest/v1/settlement_payment_instructions?event_id=eq.${AUTUMN_EVENT_ID}&select=*`, {
    headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}` }, cache: 'no-store',
  })
  if (!response.ok) throw new Error(`支払案内を読み込めません (${response.status})`)
  return response.json() as Promise<PaymentInstruction[]>
}

export async function savePaymentInstruction(session: AdminSession, organizationKey: string, method: PaymentInstruction['payment_method'], bankDetails: string): Promise<void> {
  const details = bankDetails.trim()
  if (!organizationKey || !['bank_transfer', 'cash_at_venue'].includes(method) || details.length > 2000 || (method === 'bank_transfer' && !details)) {
    throw new Error('支払方法と振込先を確認してください')
  }
  const verified = await verifyAdminSession(session)
  const userResponse = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}` }, cache: 'no-store' })
  if (!userResponse.ok) throw new Error('本部のログインを確認できません')
  const user = await userResponse.json() as { id?: string }
  if (!user.id) throw new Error('担当者を確認できません')
  const response = await fetch(`${URL}/rest/v1/settlement_payment_instructions?on_conflict=event_id,organization_key`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}`, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ event_id: AUTUMN_EVENT_ID, organization_key: organizationKey, payment_method: method, bank_details: details, updated_by: user.id, updated_at: new Date().toISOString() }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(error.message || `支払案内を保存できません (${response.status})`)
  }
}
