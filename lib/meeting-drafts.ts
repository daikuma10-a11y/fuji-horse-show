import { AUTUMN_EVENT_ID, loadAutumnEntryRows, requestInsertBody, verifyAdminSession, type AdminSession } from "./supabase-rest"
import type { ManualRecord } from "./settlement-manual-records"
import type { AppRequest, Competition, StartEntry } from "./types"

export type StagedRegistration = {
  request: AppRequest
  record: Omit<ManualRecord, "event_id" | "updated_by" | "created_at">
  label: string
  applyOrder?: number
}
export type MeetingContent = {
  baseEntries: StartEntry[]
  baseOfficial: Awaited<ReturnType<typeof loadAutumnEntryRows>>
  staged: StagedRegistration[]
  orders: Record<string, string[]>
}
export type MeetingDraft = { id: string; revision: number; status: "draft" | "applied" | "archived"; updated_at: string; content: MeetingContent }

const URL = "https://mhgyhyxagkkwdiepifdp.supabase.co"
const KEY = "sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95"

export {meetingEntries} from "./master/meeting-preview"
import {meetingEntries} from "./master/meeting-preview"

async function rpc<T>(name: string, body: unknown, session: AdminSession): Promise<T> {
  const verified = await verifyAdminSession(session)
  const response = await fetch(`${URL}/rest/v1/rpc/${name}`, { method: "POST", headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}`, "Content-Type": "application/json" }, body: JSON.stringify(body) })
  const result = await response.json()
  if (!response.ok) throw new Error(result.message || "打ち合わせ会の保存に失敗しました")
  return result as T
}
export async function loadMeetingDraft(session: AdminSession): Promise<MeetingDraft | null> {
  const verified = await verifyAdminSession(session)
  const response = await fetch(`${URL}/rest/v1/meeting_drafts?event_id=eq.${AUTUMN_EVENT_ID}&status=eq.draft&select=id,revision,status,updated_at,content&limit=1`, { headers: { apikey: KEY, Authorization: `Bearer ${verified.accessToken}` }, cache: "no-store" })
  if (!response.ok) throw new Error("打ち合わせ会の下書きを読み込めません")
  return (await response.json() as MeetingDraft[])[0] ?? null
}
export async function saveMeetingDraft(id: string, revision: number, content: MeetingContent, competitions: Competition[], session: AdminSession): Promise<MeetingDraft> {
  const preview = meetingEntries(content, competitions)
  const affected = new Set([...Object.keys(content.orders), ...content.staged.flatMap(item => [item.record.competition_key, item.request.change?.fromCompetitionId ?? item.request.withdraw?.competitionId ?? item.record.competition_key])])
  const orders = competitions.filter(comp => affected.has(comp.id)).map(comp => ({ competition_no: comp.number, ids: preview.filter(row => row.competitionId === comp.id && !row.withdrawn).map(row => row.id) }))
  return rpc("save_meeting_draft", { p_id: id, p_revision: revision, p_content: { ...content, submissions: content.staged.map(item => ({ request: requestInsertBody(item.request), record: item.record })), final_orders: orders } }, session)
}
export async function applyMeetingDraft(id: string, revision: number, session: AdminSession): Promise<void> {
  await rpc("apply_meeting_draft", { p_id: id, p_revision: revision }, session)
}
export async function archiveMeetingDraft(id: string, revision: number, session: AdminSession): Promise<void> {
  await rpc("archive_meeting_draft", { p_id: id, p_revision: revision }, session)
}
