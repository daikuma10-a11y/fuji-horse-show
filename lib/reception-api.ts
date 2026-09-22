import { AUTUMN_EVENT, assertAutumnEventId } from "./autumn-config"
import { supabaseInsert } from "./supabase"

export interface PersistedReceptionRequest {
  id: string
  status: "pending" | "reflected" | "cancelled"
  created_at: string
}

function autumnRow(row: Record<string, unknown>) {
  assertAutumnEventId(AUTUMN_EVENT.id)
  return { event_id: AUTUMN_EVENT.id, status: "pending", ...row }
}

export async function persistAddRequest(input: {
  competitionId: string; riderId: string; horseId: string; organizationId: string; fee: number; note?: string
}) {
  return supabaseInsert<PersistedReceptionRequest>("reception_requests", autumnRow({
    request_type: "add", organization_id: input.organizationId, to_competition_id: input.competitionId,
    rider_id: input.riderId, horse_id: input.horseId, fee: input.fee, note: input.note?.trim() || null,
    payload: { competitionId: input.competitionId, playerId: input.riderId, horseId: input.horseId, note: input.note ?? "" },
  }))
}

export async function persistChangeRequest(input: {
  entryId: string; fromCompetitionId: string; toCompetitionId: string; riderId: string; horseId: string;
  organizationId: string; fee: number; treatedAsWithdrawAdd: boolean; payload: Record<string, unknown>
}) {
  return supabaseInsert<PersistedReceptionRequest>("reception_requests", autumnRow({
    request_type: "change", entry_id: input.entryId, organization_id: input.organizationId,
    from_competition_id: input.fromCompetitionId, to_competition_id: input.toCompetitionId,
    rider_id: input.riderId, horse_id: input.horseId, fee: input.fee,
    treated_as_withdraw_add: input.treatedAsWithdrawAdd, payload: input.payload,
  }))
}

export async function persistWithdrawRequest(input: {
  entryId: string; competitionId: string; riderId: string; horseId: string; organizationId: string
}) {
  return supabaseInsert<PersistedReceptionRequest>("reception_requests", autumnRow({
    request_type: "withdraw", entry_id: input.entryId, organization_id: input.organizationId,
    from_competition_id: input.competitionId, rider_id: input.riderId, horse_id: input.horseId, fee: 0,
    payload: { entryId: input.entryId, competitionId: input.competitionId, playerId: input.riderId, horseId: input.horseId },
  }))
}
