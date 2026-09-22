import type { Competition, Horse, Organization, Player, StartEntry } from "./types"
import { AUTUMN_EVENT, assertAutumnEventId } from "./autumn-config"

export type AutumnDbRow = {
  competition_id: string
  competition_no: string | number
  competition_date: string
  competition_name: string
  official: boolean
  fee: number
  entry_id: string | null
  start_order: number | null
  status: string | null
  source: string | null
  rider_id: string | null
  rider_name: string | null
  horse_id: string | null
  horse_name: string | null
  organization_id: string | null
  organization_name: string | null
}

export type AutumnStoreSeed = {
  organizations: Organization[]
  players: Player[]
  horses: Horse[]
  competitions: Competition[]
  startEntries: StartEntry[]
}

export function isWithdrawnStatus(status: string | null | undefined) {
  const normalized = status?.trim().toLowerCase()
  return normalized === "withdrawn" || normalized === "wd"
}

export function mapAutumnRows(rows: AutumnDbRow[], eventId = AUTUMN_EVENT.id): AutumnStoreSeed {
  assertAutumnEventId(eventId)
  const organizations = new Map<string, Organization>()
  const players = new Map<string, Player>()
  const horses = new Map<string, Horse>()
  const competitions = new Map<string, Competition>()
  const entries: StartEntry[] = []

  for (const row of rows) {
    if (!competitions.has(row.competition_id)) competitions.set(row.competition_id, { id: row.competition_id, number: Number(row.competition_no), date: row.competition_date as Competition["date"], name: row.competition_name, official: Boolean(row.official), entryFee: Number(row.fee ?? 0) })
    if (!row.entry_id) continue
    if (!row.rider_id || !row.horse_id || !row.organization_id) continue
    if (!organizations.has(row.organization_id)) organizations.set(row.organization_id, { id: row.organization_id, name: row.organization_name ?? "" })
    if (!players.has(row.rider_id)) players.set(row.rider_id, { id: row.rider_id, name: row.rider_name ?? "", orgId: row.organization_id })
    if (!horses.has(row.horse_id)) horses.set(row.horse_id, { id: row.horse_id, name: row.horse_name ?? "", orgId: row.organization_id })
    entries.push({ id: row.entry_id, competitionId: row.competition_id, order: Number(row.start_order ?? 0), playerId: row.rider_id, horseId: row.horse_id, withdrawn: isWithdrawnStatus(row.status) })
  }

  const startEntries = [...entries].sort((a, b) => {
    if (a.competitionId !== b.competitionId) return (competitions.get(a.competitionId)?.number ?? 0) - (competitions.get(b.competitionId)?.number ?? 0)
    if (Boolean(a.withdrawn) !== Boolean(b.withdrawn)) return a.withdrawn ? 1 : -1
    return a.order - b.order
  })
  return { organizations: [...organizations.values()], players: [...players.values()], horses: [...horses.values()], competitions: [...competitions.values()].sort((a, b) => a.number - b.number), startEntries }
}
