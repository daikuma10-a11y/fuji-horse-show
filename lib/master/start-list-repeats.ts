import type { StartEntry } from '../types'

export type StartRepeat = { group: number; count: number; color: number }
// Each palette has dark text on a light background; numbered labels also work without color.
export const startRepeatColors = [
  { backgroundColor: '#fee2e2', color: '#7f1d1d', borderColor: '#b91c1c' },
  { backgroundColor: '#dbeafe', color: '#1e3a8a', borderColor: '#1d4ed8' },
  { backgroundColor: '#dcfce7', color: '#14532d', borderColor: '#15803d' },
  { backgroundColor: '#f3e8ff', color: '#581c87', borderColor: '#7e22ce' },
  { backgroundColor: '#ffedd5', color: '#7c2d12', borderColor: '#c2410c' },
  { backgroundColor: '#cffafe', color: '#164e63', borderColor: '#0e7490' },
  { backgroundColor: '#fce7f3', color: '#831843', borderColor: '#be185d' },
  { backgroundColor: '#fef9c3', color: '#713f12', borderColor: '#a16207' },
] as const

/** Stable within a competition when reordered/filtered. Names never establish identity. */
export function startListRepeats(entries: readonly StartEntry[], competitionId: string, riderKeys: ReadonlyMap<string,string> = new Map(), horseKeys: ReadonlyMap<string,string> = new Map()) {
  const active = entries.filter(e => e.competitionId === competitionId && !e.withdrawn)
  function groups(kind: 'playerId' | 'horseId', identities: ReadonlyMap<string,string>) {
    const key = (id: string) => identities.has(id) ? `shared:${identities.get(id)}` : `entry:${id}`
    const counts = new Map<string,number>()
    for (const e of active) if (e[kind]) counts.set(key(e[kind]), (counts.get(key(e[kind])) ?? 0) + 1)
    const repeated = [...counts.keys()].filter(id => counts.get(id)! > 1).sort()
    const markers = new Map(repeated.map((id, i) => [id, { group: i + 1, count: counts.get(id)!, color: i % startRepeatColors.length }]))
    return new Map(active.flatMap(e => { const mark = markers.get(key(e[kind])); return mark ? [[e.id, mark] as const] : [] }))
  }
  return { riders: groups('playerId', riderKeys), horses: groups('horseId', horseKeys) }
}
