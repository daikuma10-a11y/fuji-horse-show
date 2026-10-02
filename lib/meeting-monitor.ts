import type { StartEntry } from './types'

export type MeetingMonitorRow = { id: string; order: number; player: string; horse: string; organization: string; op: boolean; withdrawn: boolean; mark: string; riderGap?: number; horseGap?: number }
export type MeetingMonitorSnapshot = { kind: 'snapshot'; competition: string; rows: MeetingMonitorRow[]; sentAt: number; saved: boolean }

export function monitorRows(entries: StartEntry[], playerName: (id: string) => string, horseName: (id: string) => string, orgName: (id: string) => string): MeetingMonitorRow[] {
  const rows = entries.map(entry => ({ id: entry.id, order: entry.order, player: playerName(entry.playerId), horse: horseName(entry.horseId), organization: orgName(entry.organizationId ?? ''), op: !!entry.isOp, withdrawn: !!entry.withdrawn, mark: entry.withdrawn ? '棄権' : entry.adminChangeMark === 'added' ? '追加' : entry.adminChangeMark === 'changed' ? (entry.adminChangeFields?.map(field => field === 'player' ? '選手' : field === 'horse' ? '馬名' : field === 'competition' ? '競技' : 'OP区分').join('・') || '内容') + '変更' : '' })) as MeetingMonitorRow[]
  for (const key of ['playerId', 'horseId'] as const) {
    const previous = new Map<string, number>()
    const active = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => !entry.withdrawn)
    active.forEach(({ entry, index }, position) => {
      const prior = previous.get(entry[key])
      if (prior !== undefined && entry.order - active[prior].entry.order <= (key === 'playerId' ? 2 : 5)) {
        const gap = Math.max(0, entry.order - active[prior].entry.order - 1), field = key === 'playerId' ? 'riderGap' : 'horseGap'
        for (const rowIndex of [active[prior].index, index]) rows[rowIndex][field] = Math.min(rows[rowIndex][field] ?? Infinity, gap)
      }
      previous.set(entry[key], position)
    })
  }
  return rows
}
