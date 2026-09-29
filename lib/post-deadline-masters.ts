import { AUTUMN_EVENT_ID, type AdminSession, verifyAdminSession } from "./supabase-rest"
import type { Horse, Organization, Player } from "./types"

const URL = "https://mhgyhyxagkkwdiepifdp.supabase.co"
const KEY = "sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95"
const headers = { apikey: KEY, Authorization: `Bearer ${KEY}` }
const norm = (name: string) => name.normalize("NFKC").replace(/[\s　]+/g, "").toLocaleLowerCase("ja-JP")

type DbOrg = { id: string; name: string }
type DbPerson = { id: string; organization_id: string; name: string; jef_member_no?: string | null; jef_registration_no?: string | null }
async function fetchRows<T>(table: string, query: string): Promise<T[]> {
  const response = await fetch(`${URL}/rest/v1/${table}?${query}`, { headers, cache: "no-store" })
  if (!response.ok) throw new Error(`人馬データを読み込めません (${response.status})`)
  return response.json() as Promise<T[]>
}
export async function loadPostDeadlineMasters(organizations: Organization[]): Promise<{ players: Player[]; horses: Horse[] }> {
  const [dbOrgs, riders, horses] = await Promise.all([
    fetchRows<DbOrg>("organizations", `event_id=eq.${AUTUMN_EVENT_ID}&select=id,name`),
    fetchRows<DbPerson>("riders", `event_id=eq.${AUTUMN_EVENT_ID}&roster_source=eq.post_deadline_admin&select=id,organization_id,name,jef_member_no`),
    fetchRows<DbPerson>("horses", `event_id=eq.${AUTUMN_EVENT_ID}&roster_source=eq.post_deadline_admin&select=id,organization_id,name,jef_registration_no`),
  ])
  const orgId = (dbId: string) => {
    const dbName = dbOrgs.find(row => row.id === dbId)?.name
    const matches = organizations.filter(row => dbName && norm(row.name) === norm(dbName))
    if (matches.length !== 1) throw new Error(`新規人馬の所属団体を特定できません: ${dbName ?? dbId}`)
    return matches[0].id
  }
  return {
    players: riders.map(row => ({ id: row.id, officialId: row.id, name: row.name, orgId: orgId(row.organization_id), jefRegistered: !!row.jef_member_no?.trim(), manual: true })),
    horses: horses.map(row => ({ id: row.id, officialId: row.id, name: row.name, orgId: orgId(row.organization_id), jefRegistered: !!row.jef_registration_no?.trim(), manual: true })),
  }
}
export async function registerPostDeadlineMaster(session: AdminSession, input: { kind: "rider" | "horse"; name: string; orgName: string; jefNumber: string; jefChecked: boolean }): Promise<string> {
  const verified = await verifyAdminSession(session)
  const matches = await fetchRows<DbOrg>("organizations", `event_id=eq.${AUTUMN_EVENT_ID}&select=id,name`)
  const orgs = matches.filter(row => norm(row.name) === norm(input.orgName))
  if (orgs.length !== 1) throw new Error("団体を正式DBで一意に確認できません")
  const response = await fetch(`${URL}/rest/v1/rpc/register_autumn_postdeadline_master`, {
    method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ p_kind: input.kind, p_name: input.name.trim(), p_organization_id: orgs[0].id, p_jef_number: input.jefNumber.trim() || null, p_jef_checked: input.jefChecked }),
  })
  if (!response.ok) {
    const error = await response.json().catch(() => ({})) as { message?: string }
    throw new Error(error.message || `新規人馬を登録できません (${response.status})`)
  }
  return response.json() as Promise<string>
}
