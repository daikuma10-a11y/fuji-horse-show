import { WINTER_EVENT_ID, assertWinterEvent } from './winter-event'
import { winterRpc } from './winter-reception'
import { emptyStableSchedule, hasStableSchedule, mergeStableSchedule, sameStableSchedule, stableScheduleIssues, stableScheduleKeys, type StableSchedule } from './master/stable-schedule'
import type { ApplicationDraft } from './winter-application-draft'

export type WinterStableSchedule = { event_id: string; organization_id: string; request_id: string; value: StableSchedule; source_reference: string; confirmed_at: string }
export type StableExpectation = { expected: string | null; value: StableSchedule }
export type StableScheduleSave = { eventId: string; organizationId: string; organizationName: string; requestId: string; expected: string | null; value: StableSchedule; reference: string; digest: string }
const uuid = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const hash = (v: unknown): v is string => typeof v === 'string' && /^[0-9a-f]{64}$/.test(v)
export function readStableSchedule(v: unknown, valid = true): StableSchedule {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('入退厩予定の形式を確認できません')
  const o = v as Record<string, unknown>
  if (Object.keys(o).length !== stableScheduleKeys.length || stableScheduleKeys.some(k => typeof o[k] !== 'string' || (o[k] as string).length > (k === 'notes' ? 1000 : 200))) throw new Error('入退厩予定の形式を確認できません')
  const value = Object.fromEntries(stableScheduleKeys.map(k => [k, o[k]])) as StableSchedule
  if (valid) {
    const issues = stableScheduleIssues(value)
    if ([value.arrivalDate, value.departureDate].some(v => v && !v.startsWith('2026-'))) issues.push('入退厩日は2026年の日付で確認してください。')
    if (issues.length) throw new Error(issues.join('\n'))
  }
  return value
}
export function readStableExpectation(v: unknown): StableExpectation {
  if (!v || typeof v !== 'object') throw new Error('入退厩予定の保存開始記録を確認できません')
  const o = v as Record<string, unknown>
  if (o.expected !== null && !hash(o.expected)) throw new Error('入退厩予定の照合番号を確認できません')
  return { expected: o.expected as string | null, value: readStableSchedule(o.value) }
}
export async function stableScheduleRequestId(reference: string, digest: string, expectation: StableExpectation, organizationId: string) {
  const bytes = new TextEncoder().encode(JSON.stringify(['winter-stable-v1', WINTER_EVENT_ID, organizationId, reference, digest, readStableExpectation(expectation)]))
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), v => v.toString(16).padStart(2, '0')).join('')
}
export async function loadWinterStableSchedules(token: string, signal?: AbortSignal): Promise<WinterStableSchedule[]> {
  if (!token) throw new Error('本部ログインが必要です')
  const result: WinterStableSchedule[] = [], seen = new Set<string>()
  for (let offset = 0; ; offset += 500) {
    const query = new URLSearchParams({ event_id: `eq.${WINTER_EVENT_ID}`, select: 'event_id,organization_id,request_id,value,source_reference,confirmed_at', order: 'organization_id.asc', limit: '500', offset: String(offset) })
    const response = await fetch('https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/fhs_winter_current_stable_schedules?' + query, { cache: 'no-store', signal: AbortSignal.any([...(signal ? [signal] : []), AbortSignal.timeout(15000)]), headers: { apikey: 'sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95', Authorization: `Bearer ${token}` } })
    if (!response.ok) throw new Error('入退厩予定を取得できません。本部ログインと接続を確認してください。')
    const page: unknown = await response.json()
    if (!Array.isArray(page)) throw new Error('入退厩予定の保存形式を確認できません')
    for (const row of page) {
      if (!row || !uuid(row.organization_id) || !hash(row.request_id) || typeof row.source_reference !== 'string' || typeof row.confirmed_at !== 'string' || seen.has(row.organization_id)) throw new Error('入退厩予定の保存形式を確認できません')
      assertWinterEvent(row.event_id); seen.add(row.organization_id)
      result.push({ ...row, value: readStableSchedule(row.value) })
    }
    if (page.length < 500) return result
  }
}
export async function saveWinterStableSchedule(input: StableScheduleSave, token: string) {
  assertWinterEvent(input.eventId); readStableExpectation(input)
  if (!token || !uuid(input.organizationId) || !hash(input.requestId) || !hash(input.digest) || !input.organizationName.trim() || input.organizationName.length > 100 || !input.reference.trim() || input.reference.length > 100) throw new Error('入退厩予定の保存先・内容を確認してください')
  const result = await winterRpc('save_winter_stable_schedule', { p_input: input }, token, AbortSignal.timeout(20000))
  if (result !== input.requestId) throw new Error('入退厩予定の保存結果を再確認してください')
  return input.requestId
}
/** Freeze the read/merge before any mutation, then reject concurrent updates. */
export function reviewStableSchedule(draft: ApplicationDraft, rows: WinterStableSchedule[] | undefined, organizations: { id: string; name: string; event_id: string }[], expectation?: StableExpectation) {
  const incoming = draft.edited.stable, needed = hasStableSchedule(incoming)
  if (!needed) return { needed: false, complete: true, issues: [] as string[], expectation: undefined, organizationId: '' }
  const orgs = organizations.filter(o => o.name === draft.edited.club.trim())
  const org = orgs.length === 1 ? orgs[0] : undefined
  const current = rows?.find(r => r.organization_id === org?.id)
  const issues: string[] = []
  if (!rows) issues.push('保存済みの入退厩予定を読み込んでから再確認してください。')
  if (orgs.length > 1) issues.push('入退厩予定の団体を一意に確認できません。')
  const expected = expectation ?? { expected: current?.request_id ?? null, value: mergeStableSchedule(current?.value ?? emptyStableSchedule(), incoming!) }
  const complete = !!current && sameStableSchedule(current.value, expected.value)
  if(expectation&&!complete&&(current?.request_id??null)===expectation.expected&&!sameStableSchedule(expectation.value,mergeStableSchedule(current?.value??emptyStableSchedule(),incoming!)))issues.push('確認した申込書と入退厩予定の保存開始記録が異なります。')
  try { readStableExpectation(expected) } catch (reason) { issues.push(reason instanceof Error ? reason.message : '入退厩予定を確認してください') }
  if (expectation && !complete && (current?.request_id ?? null) !== expectation.expected) issues.push('入退厩予定が別の操作で更新されています。「入厩情報」で最新の日時を確認してください。')
  return { needed: true, complete, issues, expectation: expected, organizationId: org?.id ?? '' }
}
