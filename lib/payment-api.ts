import { AUTUMN_EVENT, assertAutumnEventId } from "./autumn-config"
import { supabaseInsert, supabaseRest, supabaseUpdate } from "./supabase"

export interface PersistedPayment {
  event_id: string
  organization_id: string
  paid: number
  updated_at: string
}

export async function loadReceptionPayments() {
  assertAutumnEventId(AUTUMN_EVENT.id)
  return supabaseRest<PersistedPayment>("reception_payments", `event_id=eq.${AUTUMN_EVENT.id}`)
}

export async function persistPayment(organizationId: string, paid: number) {
  assertAutumnEventId(AUTUMN_EVENT.id)
  const query = `event_id=eq.${AUTUMN_EVENT.id}&organization_id=eq.${organizationId}`
  const existing = await supabaseRest<PersistedPayment>("reception_payments", query)
  const row = {
    event_id: AUTUMN_EVENT.id,
    organization_id: organizationId,
    paid: Math.max(0, Math.round(paid)),
    updated_at: new Date().toISOString(),
  }
  if (existing.length) {
    const updated = await supabaseUpdate<PersistedPayment>("reception_payments", query, row)
    return updated[0]
  }
  return supabaseInsert<PersistedPayment>("reception_payments", row)
}
