import { AUTUMN_EVENT_ID, type AdminSession, verifyAdminSession } from "./supabase-rest"

const URL = "https://mhgyhyxagkkwdiepifdp.supabase.co"
const KEY = "sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95"

export type FeeOverride = {
  event_id: string
  source_type: "normal" | "add"
  source_id: string
  original_fee: number
  corrected_fee: number
  reason: string
  updated_at: string
  updated_by: string
}
export type Prepayment = { event_id: string; organization_key: string; paid_amount: number; note: string; updated_at: string; updated_by: string }

export const feeOverrideKey = (type: FeeOverride["source_type"], id: string) => `${type}:${id}`

export async function loadFeeOverrides(session: AdminSession): Promise<FeeOverride[]> {
  const verified = await verifyAdminSession(session)
  const response = await fetch(`${URL}/rest/v1/settlement_fee_overrides?event_id=eq.${AUTUMN_EVENT_ID}&select=event_id,source_type,source_id,original_fee,corrected_fee,reason,updated_at,updated_by`, {
    headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}` }, cache: "no-store",
  })
  if (!response.ok) throw new Error(`料金修正の読み込みに失敗しました (${response.status})`)
  return response.json() as Promise<FeeOverride[]>
}

export async function loadPrepayments(session: AdminSession): Promise<Prepayment[]> {
  const verified = await verifyAdminSession(session)
  const response = await fetch(`${URL}/rest/v1/settlement_prepayments?event_id=eq.${AUTUMN_EVENT_ID}&select=event_id,organization_key,paid_amount,note,updated_at,updated_by`, {
    headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}` }, cache: "no-store",
  })
  if (!response.ok) throw new Error(`事前支払いの読み込みに失敗しました (${response.status})`)
  return response.json() as Promise<Prepayment[]>
}

async function adminIdentity(accessToken: string): Promise<string> {
  const response = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${accessToken}` }, cache: "no-store" })
  if (!response.ok) throw new Error("本部のログインを確認できません")
  const user = await response.json() as { id?: string }
  if (!user.id) throw new Error("担当者を確認できません")
  return user.id
}

export async function savePrepayment(session: AdminSession, orgId: string, amount: number, note: string): Promise<void> {
  if (!orgId || !Number.isSafeInteger(amount) || amount < 0 || note.length > 500) throw new Error("入金額を確認してください")
  const verified = await verifyAdminSession(session)
  const userId = await adminIdentity(verified.accessToken)
  const response = await fetch(`${URL}/rest/v1/settlement_prepayments?on_conflict=event_id,organization_key`, {
    method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ event_id: AUTUMN_EVENT_ID, organization_key: orgId, paid_amount: amount, note: note.trim(), updated_by: userId, updated_at: new Date().toISOString() }),
  })
  if (!response.ok) throw new Error(`事前支払いの保存に失敗しました (${response.status})`)
}

export async function saveFeeOverride(session: AdminSession, input: { type: FeeOverride["source_type"]; id: string; originalFee: number; correctedFee: number; reason: string }): Promise<void> {
  if (!input.id || !Number.isSafeInteger(input.originalFee) || input.originalFee < 0 || !Number.isSafeInteger(input.correctedFee) || input.correctedFee < 0 || !input.reason.trim() || input.reason.trim().length > 500) {
    throw new Error("金額と修正理由を確認してください")
  }
  const verified = await verifyAdminSession(session)
  const userId = await adminIdentity(verified.accessToken)
  const response = await fetch(`${URL}/rest/v1/settlement_fee_overrides?on_conflict=event_id,source_type,source_id`, {
    method: "POST",
    headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}`, "Content-Type": "application/json", Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ event_id: AUTUMN_EVENT_ID, source_type: input.type, source_id: input.id, original_fee: input.originalFee, corrected_fee: input.correctedFee, reason: input.reason.trim(), updated_at: new Date().toISOString(), updated_by: userId }),
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(detail.message || `料金修正の保存に失敗しました (${response.status})`)
  }
}
