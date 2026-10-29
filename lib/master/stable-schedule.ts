/** Local event dates/times: never interpret these as UTC instants. */
export type StableSchedule = { arrivalDate: string; arrivalTime: string; departureDate: string; departureTime: string; notes: string }
export const emptyStableSchedule = (): StableSchedule => ({ arrivalDate: '', arrivalTime: '', departureDate: '', departureTime: '', notes: '' })
export const stableScheduleKeys = ['arrivalDate', 'arrivalTime', 'departureDate', 'departureTime', 'notes'] as const
export const hasStableSchedule = (v?: StableSchedule) => !!v && stableScheduleKeys.some(k => !!v[k])
export const sameStableSchedule = (a: StableSchedule, b: StableSchedule) => stableScheduleKeys.every(k => a[k] === b[k])
export function stableScheduleIssues(v?: StableSchedule): string[] {
  if (!v) return []
  const issues: string[] = []
  for (const [kind, label] of [['arrival', '入厩'], ['departure', '退厩']] as const) {
    const date = v[`${kind}Date`], time = v[`${kind}Time`]
    if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !Number.isFinite(Date.parse(date)) || new Date(date).toISOString().slice(0, 10) !== date)) issues.push(`${label}日を YYYY-MM-DD の形式で確認・訂正してください。`)
    if (time && !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time)) issues.push(`${label}時刻を HH:mm の形式で確認・訂正してください。`)
    if (time && !date) issues.push(`${label}時刻に対応する日付を入力してください。`)
  }
  if (!issues.length && v.arrivalDate && v.departureDate && (v.departureDate < v.arrivalDate || v.arrivalDate === v.departureDate && v.arrivalTime && v.departureTime && v.departureTime < v.arrivalTime)) issues.push('退厩日時が入厩日時より前です。確認・訂正してください。')
  if (v.notes.length > 1000) issues.push('入退厩の備考は1,000文字以内で入力してください。')
  return issues
}
export function stableDateLabel(date: string, time: string) { return date ? `${date.replace(/-/g, '/')}${time ? ` ${time}` : '（時刻未記載）'}` : '' }
/** A blank Excel cell does not erase an already saved plan. Explicit clearing is available in the stable editor. */
export function mergeStableSchedule(saved: StableSchedule, incoming: StableSchedule): StableSchedule {
  const next = { ...saved }
  for (const kind of ['arrival', 'departure'] as const) {
    const date = incoming[`${kind}Date`], time = incoming[`${kind}Time`]
    if (date) { next[`${kind}Date`] = date; next[`${kind}Time`] = date !== saved[`${kind}Date`] ? time : time || saved[`${kind}Time`] }
    else if(time) {next[`${kind}Date`]='';next[`${kind}Time`]=time} // Surface the missing date instead of discarding the input.
  }
  if (incoming.notes) next.notes = incoming.notes
  return next
}
