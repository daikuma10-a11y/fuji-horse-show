import { AUTUMN_EVENT_ID, type AdminSession, verifyAdminSession } from "./supabase-rest"

const URL = "https://mhgyhyxagkkwdiepifdp.supabase.co"
const KEY = "sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95"

export type ManualRecord = {
  id: string; event_id: string; request_id: string | null;
  period: "before_event" | "at_venue"; action_type: "add" | "change" | "withdraw";
  organization_key: string; competition_key: string; rider_key: string; horse_key: string;
  details: string; bill_amount: number; paid_amount: number;
  payment_plan: "paid_before_event" | "pay_at_venue" | "pay_after_event";
  operator_name: string; updated_by: string; created_at: string;
}

export async function loadManualRecords(session: AdminSession): Promise<ManualRecord[]> {
  const verified = await verifyAdminSession(session)
  const response = await fetch(`${URL}/rest/v1/settlement_manual_records?event_id=eq.${AUTUMN_EVENT_ID}&select=*&order=created_at.desc`, {
    headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}` }, cache: "no-store",
  })
  if (!response.ok) throw new Error(`当日・大会前の精算記録を読み込めません (${response.status})`)
  return response.json() as Promise<ManualRecord[]>
}

export async function createManualRecord(session: AdminSession, input: Omit<ManualRecord, "event_id" | "updated_by" | "created_at">): Promise<void> {
  if (!input.organization_key || !input.competition_key || !input.rider_key || !input.horse_key || !input.operator_name.trim() ||
    !Number.isSafeInteger(input.bill_amount) || input.bill_amount < 0 || !Number.isSafeInteger(input.paid_amount) || input.paid_amount < 0 ||
    (input.request_id === null && input.paid_amount > input.bill_amount)) throw new Error("精算記録の内容を確認してください")
  const verified = await verifyAdminSession(session)
  const userResponse = await fetch(`${URL}/auth/v1/user`, { headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}` }, cache: "no-store" })
  if (!userResponse.ok) throw new Error("本部の認証を確認できません")
  const user = await userResponse.json() as { id?: string }
  if (!user.id) throw new Error("本部担当者を確認できません")
  const response = await fetch(`${URL}/rest/v1/settlement_manual_records`, {
    method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify({ ...input, event_id: AUTUMN_EVENT_ID, updated_by: user.id }),
  })
  if (!response.ok) {
    const detail = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(detail.message || `精算記録の保存に失敗しました (${response.status})`)
  }
}
