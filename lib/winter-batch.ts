import { WINTER_EVENT_ID, assertWinterEvent } from './winter-event'
import { reviewWinterAdd, type WinterAddInput } from './winter-reception'
import { reviewWinterChange, type WinterChangeInput } from './winter-change'
import type { WinterEntryRow } from './winter-data'

export type WinterDraft = { type: 'add'; input: WinterAddInput } | { type: 'change'; input: WinterChangeInput } | {
  type: 'withdraw'; id: string; entry: WinterEntryRow; organizationId: string; organizationName: string; riderName: string; horseName: string; visitorName: string
}
export type WinterQueue = { version: 1; eventId: string; attempted: boolean; items: WinterDraft[] }
export const WINTER_QUEUE_KEY = `fhs:winter:${WINTER_EVENT_ID}:drafts:v1`
export const emptyWinterQueue = (): WinterQueue => ({ version: 1, eventId: WINTER_EVENT_ID, attempted: false, items: [] })
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function winterDraftSummary(draft: WinterDraft) {
  if (draft.type === 'add') {
    const i = draft.input, review = reviewWinterAdd(i)
    return { id: i.id, organizationId: i.organization.id, organizationName: i.organization.name, type: '追加',
      label: `第${i.competition.competition_no}競技 ${i.competition.name}　${i.rider.name} ／ ${i.horse.name}${i.selection.isOp ? '（OP）' : ''}`, visitorName: i.visitorName, total: review.total, originalId: null,
      category: i.selection.membership === 'member' ? '会員' : i.selection.membership === 'nonmember' ? '非会員' : '通常料金' }
  }
  if (draft.type === 'change') {
    const i = draft.input, review = reviewWinterChange(i)
    return { id: i.target.id, organizationId: i.target.organization.id, organizationName: i.target.organization.name, type: '変更',
      label: `第${i.from.competition_no}競技 → 第${i.target.competition.competition_no}競技　${i.target.rider.name} ／ ${i.target.horse.name}${i.target.selection.isOp ? '（OP）' : ''}`, visitorName: i.target.visitorName, total: review.fee.total, originalId: i.original.entry_id,
      category: `${i.target.selection.membership === 'member' ? '会員' : i.target.selection.membership === 'nonmember' ? '非会員' : '通常料金'}${review.treatedAsWithdrawAdd ? '・棄権＋追加扱い' : ''}` }
  }
  if (draft.type !== 'withdraw') throw new Error('未確定一覧の形式が不正です')
  assertWinterEvent(draft.entry.event_id)
  if (['wd','withdrawn'].includes(draft.entry.status.toLowerCase()) || !draft.visitorName.trim() || draft.visitorName.trim().length > 100) throw new Error('棄権の対象と担当者を確認してください')
  return { id: draft.id, organizationId: draft.organizationId, organizationName: draft.organizationName, type: '棄権',
    label: `第${draft.entry.competition_no}競技 ${draft.entry.start_order}番　${draft.riderName} ／ ${draft.horseName}${draft.entry.is_op ? '（OP）' : ''}`, visitorName: draft.visitorName, total: 0, originalId: draft.entry.entry_id, category: '0円' }
}

export function validateWinterQueue(queue: WinterQueue) {
  if (queue?.version !== 1 || queue.eventId !== WINTER_EVENT_ID || typeof queue.attempted !== 'boolean' || !Array.isArray(queue.items) || queue.items.length > 50) throw new Error('Winterの未確定一覧を確認できません')
  const ids = new Set<string>(), originals = new Set<string>(), organizations = new Set<string>()
  for (const item of queue.items) {
    const summary = winterDraftSummary(item)
    if (!uuid.test(summary.id) || !uuid.test(summary.organizationId) || ids.has(summary.id)) throw new Error('受付番号を確認してください')
    if (summary.originalId && originals.has(summary.originalId)) throw new Error('同じ出番の変更・棄権は一度に1件ずつ確定してください')
    ids.add(summary.id); organizations.add(summary.organizationId)
    if (summary.originalId) originals.add(summary.originalId)
  }
  if (organizations.size > 1) throw new Error('団体ごとにまとめて確定してください。先の団体の未確定一覧を確認してください')
  return queue
}

export function readWinterQueue(storage: Pick<Storage, 'getItem'>): WinterQueue {
  const raw = storage.getItem(WINTER_QUEUE_KEY)
  if (!raw) return emptyWinterQueue()
  try { return validateWinterQueue(JSON.parse(raw)) } catch { throw new Error('この端末の未確定一覧を読み込めません。内容を消さず、本部に確認してください') }
}

export function writeWinterQueue(storage: Pick<Storage, 'setItem'>, queue: WinterQueue) {
  validateWinterQueue(queue)
  try { storage.setItem(WINTER_QUEUE_KEY, JSON.stringify(queue)) } catch { throw new Error('この端末に未確定内容を保存できません。ブラウザーの保存設定を確認してください') }
}

export function stageWinterDraft(draft: WinterDraft) {
  const queue = readWinterQueue(window.localStorage)
  if (queue.attempted) throw new Error('前の確定結果を確認してから次の申請を入力してください')
  const next = validateWinterQueue({ ...queue, items: [...queue.items, JSON.parse(JSON.stringify(draft))] })
  writeWinterQueue(window.localStorage, next)
  window.dispatchEvent(new Event('winter-queue-changed'))
}

export function winterBatchPayload(queue: WinterQueue) {
  validateWinterQueue(queue)
  if (!queue.items.length) throw new Error('未確定の申請はありません')
  return { p_items: queue.items.map(draft => {
    if (draft.type === 'add') {
      const i = draft.input
      return { type: 'add', args: { p_id: i.id, p_organization_id: i.organization.id, p_competition_id: i.competition.id, p_rider_id: i.rider.id, p_horse_id: i.horse.id, p_visitor_name: i.visitorName.trim(), p_membership: i.selection.membership ?? null, p_is_op: !!i.selection.isOp, p_instructor_confirmed: !!i.selection.instructorConfirmed } }
    }
    if (draft.type === 'change') {
      const i = draft.input, t = i.target
      return { type: 'change', args: { p_id: t.id, p_entry_id: i.original.entry_id, p_before: { competitionId: i.original.competition_id, riderId: i.original.rider_id, horseId: i.original.horse_id, isOp: !!i.original.is_op }, p_competition_id: t.competition.id, p_rider_id: t.rider.id, p_horse_id: t.horse.id, p_visitor_name: t.visitorName.trim(), p_from_membership: i.fromSelection.membership ?? null, p_membership: t.selection.membership ?? null, p_is_op: !!t.selection.isOp, p_from_instructor: !!i.fromSelection.instructorConfirmed, p_instructor: !!t.selection.instructorConfirmed, p_expected_total: reviewWinterChange(i).fee.total } }
    }
    return { type: 'withdraw', args: { p_id: draft.id, p_entry_id: draft.entry.entry_id, p_visitor_name: draft.visitorName.trim() } }
  }), p_expected_total: queue.items.reduce((sum, item) => sum + winterDraftSummary(item).total, 0) }
}

export class WinterBatchRejected extends Error {}
export async function submitWinterBatch(queue: WinterQueue, token: string) {
  if (!token) throw new WinterBatchRejected('本部ログインが必要です')
  const payload = winterBatchPayload(queue)
  const response = await fetch('https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/rpc/submit_winter_reception_batch', {
    method: 'POST', cache: 'no-store', headers: { apikey: 'sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95', Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
  })
  const result = await response.json().catch(() => null)
  if (!response.ok) {
    const message = result?.message || '確定できませんでした。同じ内容で再試行してください'
    if (response.status >= 400 && response.status < 500) throw new WinterBatchRejected(message)
    throw new Error(message)
  }
  const ids = queue.items.map(item => winterDraftSummary(item).id)
  if (result?.total !== payload.p_expected_total || !Array.isArray(result?.ids) || JSON.stringify(result.ids) !== JSON.stringify(ids)) throw new Error('確定結果を確認できません。同じ受付番号で再試行してください')
  return { ids, total: payload.p_expected_total }
}
