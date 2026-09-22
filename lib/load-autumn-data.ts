import { AUTUMN_EVENT } from "./autumn-config"
import { mapAutumnRows, type AutumnDbRow, type AutumnStoreSeed } from "./autumn-db-loader"
import { supabase } from "./supabase"

export async function loadAutumnData(): Promise<AutumnStoreSeed | null> {
  if (!supabase) return null

  const { data: competitions, error: competitionError } = await supabase
    .from("competitions")
    .select("id,competition_no,competition_date,name,official,fee")
    .eq("event_id", AUTUMN_EVENT.id)
    .order("competition_no")
  if (competitionError) throw competitionError

  const { data: entries, error: entryError } = await supabase
    .from("entries")
    .select("id,competition_id,rider_id,horse_id,organization_id,start_order,status,source")
    .eq("event_id", AUTUMN_EVENT.id)
    .order("start_order")
  if (entryError) throw entryError

  const [{ data: riders, error: riderError }, { data: horses, error: horseError }, { data: organizations, error: orgError }] = await Promise.all([
    supabase.from("riders").select("id,name,organization_id").eq("event_id", AUTUMN_EVENT.id),
    supabase.from("horses").select("id,name,organization_id").eq("event_id", AUTUMN_EVENT.id),
    supabase.from("organizations").select("id,name").eq("event_id", AUTUMN_EVENT.id),
  ])
  if (riderError) throw riderError
  if (horseError) throw horseError
  if (orgError) throw orgError

  const riderMap = new Map((riders ?? []).map(r => [r.id, r]))
  const horseMap = new Map((horses ?? []).map(h => [h.id, h]))
  const orgMap = new Map((organizations ?? []).map(o => [o.id, o]))
  const entriesByCompetition = new Map<string, typeof entries>()
  for (const entry of entries ?? []) {
    const list = entriesByCompetition.get(entry.competition_id) ?? []
    list.push(entry)
    entriesByCompetition.set(entry.competition_id, list)
  }

  const rows: AutumnDbRow[] = []
  for (const competition of competitions ?? []) {
    const competitionEntries = entriesByCompetition.get(competition.id) ?? []
    if (competitionEntries.length === 0) {
      rows.push({ competition_id: competition.id, competition_no: competition.competition_no, competition_date: competition.competition_date, competition_name: competition.name, official: competition.official, fee: competition.fee, entry_id: null, start_order: null, status: null, source: null, rider_id: null, rider_name: null, horse_id: null, horse_name: null, organization_id: null, organization_name: null })
      continue
    }
    for (const entry of competitionEntries) {
      const rider = riderMap.get(entry.rider_id)
      const horse = horseMap.get(entry.horse_id)
      const org = orgMap.get(entry.organization_id)
      rows.push({ competition_id: competition.id, competition_no: competition.competition_no, competition_date: competition.competition_date, competition_name: competition.name, official: competition.official, fee: competition.fee, entry_id: entry.id, start_order: entry.start_order, status: entry.status, source: entry.source, rider_id: entry.rider_id, rider_name: rider?.name ?? null, horse_id: entry.horse_id, horse_name: horse?.name ?? null, organization_id: entry.organization_id, organization_name: org?.name ?? null })
    }
  }
  return mapAutumnRows(rows)
}
