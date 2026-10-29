import type { StableGroup } from './master/stable-information'
import type { loadWinterData } from './winter-data'
import { isWinterReceptionParticipant } from './winter-data'
import { assertWinterEvent } from './winter-event'
import { compareWinterOrganizations } from './winter-display-order'

type Data = Awaited<ReturnType<typeof loadWinterData>>

/** Participant roster, including reserve horses without entries. No name-based identity merging. */
export function winterStableGroups(data: Data): StableGroup[] {
  assertWinterEvent(data.eventId)
  for (const row of [...data.organizations, ...data.horses]) assertWinterEvent(row.event_id)
  const groups = new Map(data.organizations.map(org => [org.id, { id: org.id, name: org.name, horses: [] } as StableGroup]))
  const seen = new Set<string>()
  for (const horse of data.horses) {
    if (!isWinterReceptionParticipant(horse)) continue
    const group = groups.get(horse.organization_id)
    if (!group || !horse.name.trim()) throw new Error('馬の団体・馬名を確認できません。事前登録の内容を確認してください。')
    if (seen.has(horse.id)) throw new Error('参加馬の登録番号が重複しています。最新の情報を確認してください。')
    seen.add(horse.id)
    group.horses.push({ id: horse.id, name: horse.name })
  }
  return [...groups.values()].filter(group => group.horses.length).sort(compareWinterOrganizations).map(group => ({
    ...group, horses: group.horses.sort((a, b) => a.name.localeCompare(b.name, 'ja') || a.id.localeCompare(b.id)),
  }))
}
