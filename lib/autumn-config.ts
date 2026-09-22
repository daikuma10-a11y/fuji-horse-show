// Autumn 2026 integration boundary.
// Development and persistence tests must stay scoped to this event.
// Do not substitute the Winter event id here during Autumn testing.

export const AUTUMN_EVENT = {
  id: "2af66251-66a2-4c51-8180-a5badf0584d4",
  name: "2026 Fuji Horse Show Autumn Grand Prix",
  startDate: "2026-09-10",
  endDate: "2026-09-13",
} as const

export const AUTUMN_COMPETITION_DATES = [
  "2026-09-11",
  "2026-09-12",
  "2026-09-13",
] as const

export function assertAutumnEventId(eventId: string) {
  if (eventId !== AUTUMN_EVENT.id) {
    throw new Error("Autumn test environment rejected a non-Autumn event id")
  }
}
