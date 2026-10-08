import { WINTER_EVENT_ID, assertWinterEvent, winterCompetition, winterEntryPrice, type WinterFeeSelection } from "./winter-event"
import type { WinterCompetitionRow, WinterHorseRow, WinterOrganizationRow, WinterRiderRow } from "./winter-data"

export type WinterAddInput = {
  id: string; organization: WinterOrganizationRow; competition: WinterCompetitionRow
  rider: WinterRiderRow; horse: WinterHorseRow; visitorName: string; selection: WinterFeeSelection
}

/** The fee shown for review uses the same explicit category rules as the server RPC. */
export function reviewWinterAdd(input: WinterAddInput) {
  for (const row of [input.organization, input.competition, input.rider, input.horse]) assertWinterEvent(row.event_id)
  if (input.rider.organization_id !== input.organization.id || input.horse.organization_id !== input.organization.id) throw new Error("人馬の所属団体を確認してください")
  if (!input.visitorName.trim() || input.visitorName.trim().length > 100) throw new Error("受付担当者名を入力してください")
  if (input.competition.official && (!input.rider.jef_member_no?.trim() || !input.horse.jef_registration_no?.trim())) throw new Error("公認競技は日馬連登録済みの選手と馬を選択してください")
  const source = winterCompetition(input.competition.competition_no)
  const entry = winterEntryPrice({ ...source, official: input.competition.official, fee: input.competition.fee, opFee: input.competition.op_fee, memberFee: input.competition.member_fee, nonmemberFee: input.competition.nonmember_fee }, input.selection)
  return { eventId: WINTER_EVENT_ID, entryFee: entry, addFee: 3000, total: entry + 3000 }
}

export async function submitWinterAdd(input: WinterAddInput, accessToken: string): Promise<string> {
  reviewWinterAdd(input)
  if (!accessToken) throw new Error("Winter受付の保存テストには本部ログインが必要です")
  const response = await fetch("https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/rpc/submit_winter_reception_add", {
    method: "POST", headers: { apikey: "sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95", Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_id: input.id, p_organization_id: input.organization.id, p_competition_id: input.competition.id,
      p_rider_id: input.rider.id, p_horse_id: input.horse.id, p_visitor_name: input.visitorName.trim(),
      p_membership: input.selection.membership ?? null, p_is_op: !!input.selection.isOp, p_instructor_confirmed: !!input.selection.instructorConfirmed }),
  })
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(body.message || "Winterの受付を保存できませんでした")
  }
  const saved: unknown = await response.json()
  if (saved !== input.id) throw new Error("保存された受付番号を確認できません。同じ受付番号で再確認してください")
  return input.id
}

export type WinterRequestRow = {
  id: string; event_id: string; request_type: 'add' | 'change' | 'withdraw'; status: string
  organization_id: string; target_competition_id: string; rider_id: string; horse_id: string
  fee_amount: number; created_at: string; reflected_at: string | null
  payload: { visitorName?: string }
}

async function winterRpc(name: string, args: Record<string, unknown>, token: string): Promise<unknown> {
  if (!token) throw new Error('本部ログインが必要です')
  const response = await fetch(`https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/rpc/${name}`, {
    method: 'POST', cache: 'no-store', headers: { apikey: 'sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args),
  })
  const body = await response.json().catch(() => null)
  if (!response.ok) throw new Error(body?.message || 'Winterの処理に失敗しました')
  return body
}

export async function loadWinterRequests(token: string): Promise<WinterRequestRow[]> {
  const rows: WinterRequestRow[] = []
  for (let offset = 0; ; offset += 200) {
    const page = await winterRpc('list_winter_reception_requests', { p_offset: offset }, token)
    if (!Array.isArray(page)) throw new Error('申請一覧の形式を確認できません')
    for (const row of page) assertWinterEvent(row.event_id)
    rows.push(...page as WinterRequestRow[])
    if (page.length < 200) return rows
  }
}

export async function reflectWinterRequest(id: string, token: string): Promise<string> {
  const result = await winterRpc('reflect_winter_reception_request', { p_request_id: id }, token)
  if (typeof result !== 'string' || !/^[0-9a-f-]{36}$/i.test(result)) throw new Error('反映結果を確認できません。同じ申請で再確認してください')
  return result
}

export async function submitWinterWithdraw(id: string, entryId: string, visitorName: string, token: string) {
  const result = await winterRpc('submit_winter_reception_withdraw', { p_id: id, p_entry_id: entryId, p_visitor_name: visitorName.trim() }, token)
  if (result !== id) throw new Error('保存結果を確認できません。同じ受付番号で再確認してください')
  return id
}
