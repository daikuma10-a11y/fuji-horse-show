import type { StartEntry } from './types'

export type PreviewOrder = { ids: string[]; base: string[] }
export type StartListPreview = { kind: 'startlist-preview'; selectedId: string | null; orders: Record<string, PreviewOrder> }
export const sameEntryOrder = (a: string[], b: string[]) => a.length === b.length && a.every((id, index) => id === b[index])

export function isStartListPreview(value: unknown): value is StartListPreview {
  if (!value || typeof value !== 'object') return false
  const data = value as StartListPreview
  return data.kind === 'startlist-preview' && (data.selectedId === null || typeof data.selectedId === 'string') && !!data.orders && typeof data.orders === 'object' && !Array.isArray(data.orders) && Object.values(data.orders).every(order => !!order && Array.isArray(order.ids) && Array.isArray(order.base) && [...order.ids, ...order.base].every(id => typeof id === 'string'))
}

/** 他の受付で正式表が変わったら、古い下書きで上書き表示しない。 */
export function previewEntryOrder(entries: StartEntry[], draft?: PreviewOrder): { entries: StartEntry[]; pending: boolean; conflict: boolean } {
  const active = entries.filter(entry => !entry.withdrawn)
  const ids = active.map(entry => entry.id)
  if (!draft || sameEntryOrder(draft.ids, ids)) return { entries, pending: false, conflict: false }
  if (!sameEntryOrder(draft.base, ids) || draft.ids.length !== ids.length || new Set(draft.ids).size !== ids.length || draft.ids.some(id => !ids.includes(id))) return { entries, pending: false, conflict: true }
  const byId = new Map(active.map(entry => [entry.id, entry]))
  return { entries: [...draft.ids.map((id, index) => ({ ...byId.get(id)!, order: index + 1 })), ...entries.filter(entry => entry.withdrawn)], pending: true, conflict: false }
}
