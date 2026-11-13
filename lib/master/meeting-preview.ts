import type { AppRequest, StartEntry } from "../types"

export type MeetingPreviewRequest = Pick<AppRequest,"id"|"orgId"|"withdraw"|"add"|"change">
type MeetingPreviewContent = {baseEntries:StartEntry[]; staged:{request:MeetingPreviewRequest}[]; orders:Record<string,string[]>}

// Older drafts saved only active IDs. Rows absent from an order keep their natural slot.
function applyKnownOrder(rows: StartEntry[], preferred: string[]): StartEntry[] {
  const byId = new Map(rows.map(row => [row.id, row]))
  const ranked = preferred.map(id => byId.get(id)).filter((row): row is StartEntry => !!row)
  const known = new Set(ranked.map(row => row.id))
  let index = 0
  return rows.map(row => known.has(row.id) ? ranked[index++] : row)
}

export function meetingEntries(content: MeetingPreviewContent, competitions: {id:string;official:boolean}[]): StartEntry[] {
  return competitions.flatMap(comp => {
    const base = content.baseEntries.filter(row => row.competitionId === comp.id).sort((a,b) => a.order - b.order)
    let rows = base.filter(row => !row.withdrawn)
    for (const {request} of content.staged) {
      const {change, withdraw, add} = request
      const source = rows.findIndex(row => row.id === (withdraw?.entryId ?? change?.entryId))
      const replace = change && !change.treatedAsWithdrawAdd && change.fromCompetitionId === change.toCompetitionId
      if (source >= 0 && !replace) rows[source] = {...rows[source], withdrawn:true}
      const target = add ?? (change && {competitionId:change.toCompetitionId, playerId:change.toPlayerId, horseId:change.toHorseId, isOp:change.toIsOp})
      if (target?.competitionId !== comp.id) continue
      const entry: StartEntry = {id:`request:${request.id}`, competitionId:comp.id, playerId:target.playerId, horseId:target.horseId, organizationId:request.orgId, isOp:target.isOp, order:0, adminChangeMark:change ? "changed" : "added", adminChangeFields:change?.changedFields}
      if (replace && source >= 0) rows[source] = entry
      else {
        rows.push(entry)
        if (comp.official) {
          // Insert at the front of the starters while keeping withdrawn numbers occupied.
          const starters = rows.filter(row => !row.withdrawn && row !== entry)
          rows = applyKnownOrder(rows, [entry.id, ...starters.map(row => row.id)])
        }
      }
    }
    return [...applyKnownOrder(rows, content.orders[comp.id] ?? []), ...base.filter(row => row.withdrawn).map(row=>({...row,meetingConfirmedWithdrawal:true}))]
      .map((row,index) => ({...row, order:index+1}))
  })
}

// Preserve the operator's draft order across staging or undoing a single request.
export function meetingOrderAfterEdit(previous: StartEntry[], natural: StartEntry[], request: MeetingPreviewRequest, inserted: boolean): string[] {
  const change = request.change
  const replaces = change && !change.treatedAsWithdrawAdd && change.fromCompetitionId === change.toCompetitionId
  const token = `request:${request.id}`
  const previousIds = previous.map(row => {
    if (replaces && inserted && row.id === change.entryId) return token
    if (replaces && !inserted && row.id === token) return change.entryId
    return row.id
  })
  // Rows already withdrawn at the last confirmation form a persistent footer.
  const draft = natural.filter(row => !row.meetingConfirmedWithdrawal)
  const starters = applyKnownOrder(draft.filter(row => !row.withdrawn), previousIds)
  const positions = new Map(previousIds.map((id,index) => [id,index]))
  const withdrawn = draft.flatMap((row,index) => row.withdrawn ? [{row, index:positions.get(row.id) ?? index}] : [])
  for (const {row,index} of withdrawn.sort((a,b) => a.index - b.index)) starters.splice(index,0,row)
  return [...starters,...natural.filter(row=>row.meetingConfirmedWithdrawal)].map(row => row.id)
}

export function meetingOrderAfterMove(rows: StartEntry[], source: string, target: string): string[] {
  const ids = rows.filter(row => !row.withdrawn).map(row => row.id)
  const from = ids.indexOf(source), to = ids.indexOf(target)
  if (from >= 0 && to >= 0) {
    ids.splice(from,1)
    ids.splice(to,0,source)
  }
  return applyKnownOrder(rows, ids).map(row => row.id)
}
