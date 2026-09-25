// 2026 Fuji Horse Show Autumn Grand Prix data extracted from the versioned source workbooks.
import {
  COMPETITION_DATES,
  organizations,
  players as sourcePlayers,
  horses,
  competitions,
  startEntries,
} from "./autumn-data"

const normalizeName = (value: string) =>
  value.normalize("NFKC").replace(/[\s　]+/g, "").toLocaleLowerCase("ja-JP")

// Source workbooks can contain the same rider more than once with different spacing.
// Keep the original IDs, but expose one canonical rider per normalized name + organization
// so official DB rows can always be reconciled back into the start-list UI.
const seenPlayers = new Set<string>()
const players = sourcePlayers.filter((player) => {
  const key = `${player.orgId}:${normalizeName(player.name)}`
  if (seenPlayers.has(key)) return false
  seenPlayers.add(key)
  return true
})

export { COMPETITION_DATES, organizations, players, horses, competitions, startEntries }
