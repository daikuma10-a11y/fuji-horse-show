import type { AppRequest } from "./types"
import { AUTUMN_EVENT, assertAutumnEventId } from "./autumn-config"

export type ReceptionRequestRow = {
  id?: string
  event_id: string
  request_type: "add" | "change" | "withdraw"
  original_entry_id: string | null
  target_competition_id: string | null
  rider_id: string | null
  horse_id: string | null
  organization_id: string | null
  request_note: string | null
  fee_amount: number
  status: "accepted" | "reflected"
  source: "tablet"
  created_at?: string
}

/**
 * Converts the UI request model into the existing Supabase reception_requests schema.
 * This module is intentionally Autumn-only while the reception system is being tested.
 */
export function toAutumnReceptionRow(request: AppRequest): ReceptionRequestRow {
  assertAutumnEventId(AUTUMN_EVENT.id)

  const common = {
    event_id: AUTUMN_EVENT.id,
    request_type: request.type,
    organization_id: request.orgId || null,
    fee_amount: request.fee.total,
    status: request.status === "reflected" ? "reflected" : "accepted",
    source: "tablet" as const,
  }

  if (request.type === "add" && request.add) {
    return {
      ...common,
      original_entry_id: null,
      target_competition_id: request.add.competitionId,
      rider_id: request.add.playerId,
      horse_id: request.add.horseId,
      request_note: request.add.note || null,
    }
  }

  if (request.type === "withdraw" && request.withdraw) {
    return {
      ...common,
      original_entry_id: request.withdraw.entryId,
      target_competition_id: request.withdraw.competitionId,
      rider_id: request.withdraw.playerId,
      horse_id: request.withdraw.horseId,
      request_note: null,
    }
  }

  if (request.type === "change" && request.change) {
    return {
      ...common,
      original_entry_id: request.change.entryId,
      target_competition_id: request.change.toCompetitionId,
      rider_id: request.change.toPlayerId,
      horse_id: request.change.toHorseId,
      request_note: request.change.treatedAsWithdrawAdd
        ? "withdraw_add"
        : request.change.changedFields.join(","),
    }
  }

  throw new Error(`Invalid reception request payload: ${request.id}`)
}
