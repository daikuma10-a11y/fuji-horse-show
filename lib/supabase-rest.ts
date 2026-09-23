import type { AppRequest } from "./types"

const SUPABASE_URL = "https://mhgyhyxagkkwdiepifdp.supabase.co"
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95"
export const AUTUMN_EVENT_ID = "2af66251-66a2-4c51-8180-a5badf0584d4"

const headers = {
  apikey: SUPABASE_PUBLISHABLE_KEY,
  Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`,
  "Content-Type": "application/json",
}

type RequestRow = {
  id: string
  request_type: AppRequest["type"]
  status: AppRequest["status"]
  created_at: string
  fee: number
  payload: AppRequest
}

export async function loadReceptionRequests(): Promise<AppRequest[]> {
  const url = `${SUPABASE_URL}/rest/v1/reception_requests?event_id=eq.${AUTUMN_EVENT_ID}&select=id,request_type,status,created_at,fee,payload&order=created_at.desc`
  const response = await fetch(url, { headers, cache: "no-store" })
  if (!response.ok) throw new Error(`受付データ取得失敗: ${response.status}`)
  const rows = await response.json() as RequestRow[]
  return rows.map(row => ({ ...row.payload, id: row.id, type: row.request_type, status: row.status, createdAt: row.created_at }))
}

export async function saveReceptionRequest(request: AppRequest): Promise<void> {
  const body = {
    id: request.id,
    event_id: AUTUMN_EVENT_ID,
    request_type: request.type,
    fee_amount: request.fee.total,
    fee: request.fee.total,
    status: request.status,
    source: "fuji-horse-show-web",
    treated_as_withdraw_add: request.change?.treatedAsWithdrawAdd ?? false,
    note: request.add?.note || null,
    payload: request,
  }
  const response = await fetch(`${SUPABASE_URL}/rest/v1/reception_requests`, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify(body),
  })
  if (!response.ok) throw new Error(`受付データ保存失敗: ${response.status}`)
}

export async function markReceptionRequestReflected(request: AppRequest): Promise<void> {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/reception_requests?id=eq.${request.id}&event_id=eq.${AUTUMN_EVENT_ID}`, {
    method: "PATCH",
    headers: { ...headers, Prefer: "return=minimal" },
    body: JSON.stringify({ status: "reflected", reflected_at: new Date().toISOString(), payload: { ...request, status: "reflected" } }),
  })
  if (!response.ok) throw new Error(`受付反映状態の保存失敗: ${response.status}`)
}
