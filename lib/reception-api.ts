import { AUTUMN_EVENT, assertAutumnEventId } from "./autumn-config"
import { supabaseInsert } from "./supabase"

export interface PersistedReceptionRequest {
  id: string
  status: "pending" | "reflected" | "cancelled"
  created_at: string
}

export async function persistAddRequest(input: {
  competitionId: string
  riderId: string
  horseId: string
  organizationId: string
  fee: number
  note?: string
}) {
  assertAutumnEventId(AUTUMN_EVENT.id)
  return supabaseInsert<PersistedReceptionRequest>("reception_requests", {
    event_id: AUTUMN_EVENT.id,
    request_type: "add",
    status: "pending",
    organization_id: input.organizationId,
    to_competition_id: input.competitionId,
    rider_id: input.riderId,
    horse_id: input.horseId,
    fee: input.fee,
    note: input.note?.trim() || null,
    payload: {
      competitionId: input.competitionId,
      playerId: input.riderId,
      horseId: input.horseId,
      note: input.note ?? "",
    },
  })
}
