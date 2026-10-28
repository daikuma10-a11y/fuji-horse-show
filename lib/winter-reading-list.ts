import { assertWinterEvent } from './winter-event'
import type { loadWinterData } from './winter-data'
import { loadSharedRoster, loadWinterRosterBindings, type SharedRoster, type WinterRosterBinding } from './shared-roster'
import { kanaHorseReading } from './master/application-autofill'
import type { ReadingList, ReadingListRow } from './master/reading-list'

type Data = Awaited<ReturnType<typeof loadWinterData>>

/** Only entrants in this event; identify by the saved bridge, never by a similar name. */
export function winterReadingList(data: Data, roster: SharedRoster, bindings: WinterRosterBinding[]): ReadingList {
  assertWinterEvent(data.eventId)
  for (const row of [...data.entries, ...data.riders, ...data.horses, ...data.organizations]) assertWinterEvent(row.event_id)
  for (const row of roster.participants) assertWinterEvent(row.event_id)
  const active = data.entries.filter(e => !['wd', 'withdrawn', 'cancelled', 'canceled'].includes(e.status.toLowerCase()))
  const entities = new Map(roster.entities.map(e => [e.id, e]))
  const organizations = new Map(data.organizations.map(o => [o.id, o.name]))
  const result: ReadingList = { riders: [], horses: [] }
  for (const kind of ['rider', 'horse'] as const) {
    const people = new Map((kind === 'rider' ? data.riders : data.horses).map(p => [p.id, p]))
    const links = new Map<string, string>()
    for (const b of bindings) {
      const target = kind === 'rider' ? b.rider_id : b.horse_id
      if (!target) continue
      if (links.has(target) && links.get(target) !== b.entity_id) throw new Error('人馬名簿の対応が重複しています。再読み込みしてください。')
      links.set(target, b.entity_id)
    }
    const rows = new Map<string, ReadingListRow>()
    for (const entry of active) {
      const id = kind === 'rider' ? entry.rider_id : entry.horse_id
      const person = people.get(id)
      if (!person) throw new Error('出場する人馬を確認できません。最新の情報を確認してください。')
      const entityId = links.get(id), entity = entityId ? entities.get(entityId) : undefined
      if (entityId && (!entity || entity.kind !== kind)) throw new Error('人馬とフリガナの対応を確認できません。再読み込みしてください。')
      const key = entityId ?? `event:${id}`
      const organization = organizations.get(person.organization_id)
      if (!organization) throw new Error('人馬の所属を確認できません。最新の情報を確認してください。')
      const previous = rows.get(key)
      if (previous) {
        if (!previous.organizations.includes(organization)) previous.organizations.push(organization)
        continue
      }
      rows.set(key, {
        id: key, name: person.name,
        reading: entity?.reading.trim() || (kind === 'horse' ? kanaHorseReading(person.name) : ''),
        organizations: [organization],
        number: ('jef_member_no' in person ? person.jef_member_no : person.jef_registration_no) ?? '',
      })
    }
    result[kind === 'rider' ? 'riders' : 'horses'] = [...rows.values()].map(row => ({ ...row, organizations: row.organizations.sort((a,b) => a.localeCompare(b,'ja')) })).sort((a,b) => (a.reading || a.name).localeCompare(b.reading || b.name,'ja') || a.id.localeCompare(b.id))
  }
  return result
}

export async function loadWinterReadingList(data: Data, token: string) {
  const [roster, bindings] = await Promise.all([loadSharedRoster(token), loadWinterRosterBindings(token)])
  return winterReadingList(data, roster, bindings)
}
