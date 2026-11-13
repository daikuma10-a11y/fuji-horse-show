import type { AppRequest, StartEntry } from "../types"

export type MeetingPreviewRequest = Pick<AppRequest,"id"|"orgId"|"withdraw"|"add"|"change">
type MeetingPreviewContent = {baseEntries:StartEntry[]; staged:{request:MeetingPreviewRequest}[]; orders:Record<string,string[]>}

export function meetingEntries(content: MeetingPreviewContent, competitions: {id:string;official:boolean}[]): StartEntry[] {
  let rows = content.baseEntries.map(row => ({ ...row }))
  for (const { request } of content.staged) {
    const change = request.change
    const withdraw = request.withdraw
    if (withdraw) rows = rows.map(row => row.id === withdraw.entryId ? { ...row, withdrawn: true } : row)
    if (change) {
      rows = change.treatedAsWithdrawAdd
        ? rows.map(row => row.id === change.entryId ? { ...row, withdrawn: true } : row)
        : rows.filter(row => row.id !== change.entryId)
    }
    const payload = request.add ?? (change ? { competitionId: change.toCompetitionId, playerId: change.toPlayerId, horseId: change.toHorseId, isOp: change.toIsOp, organizationId: change.organizationId } : null)
    if (!payload) continue
    const original = change ? content.baseEntries.find(row => row.id === change.entryId) : undefined
    const entry: StartEntry = { id: `request:${request.id}`, competitionId: payload.competitionId, playerId: payload.playerId, horseId: payload.horseId, organizationId: request.orgId, isOp: payload.isOp, order: 0, adminChangeMark: change ? "changed" : "added", adminChangeFields: change?.changedFields }
    const group = rows.filter(row => row.competitionId === entry.competitionId && !row.withdrawn)
    const index = change && !change.treatedAsWithdrawAdd && original?.competitionId === entry.competitionId
      ? Math.min(original.order - 1, group.length)
      : competitions.find(comp => comp.id === entry.competitionId)?.official ? 0 : group.length
    group.splice(Math.max(0, index), 0, entry)
    rows = [...rows.filter(row => row.competitionId !== entry.competitionId || row.withdrawn), ...group.map((row, order) => ({ ...row, order: order + 1 }))]
  }
  return competitions.flatMap(comp => {
    const group = rows.filter(row => row.competitionId === comp.id)
    const active = group.filter(row => !row.withdrawn).sort((a, b) => a.order - b.order)
    const requested = content.orders[comp.id] ?? []
    const rank = new Map(requested.map((id, index) => [id, index]))
    active.sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity) || a.order - b.order)
    return [...active, ...group.filter(row => row.withdrawn).sort((a, b) => a.order - b.order)].map((row, index) => ({ ...row, order: index + 1 }))
  })
}
