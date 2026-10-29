"use client"
import { stableScheduleIssues, type StableSchedule } from '@/lib/master/stable-schedule'

export function MasterStableScheduleFields({ value, onChange, disabled = false, year }: { value: StableSchedule; onChange: (value: StableSchedule) => void; disabled?: boolean; year?: string }) {
  const issues = stableScheduleIssues(value)
  if (year && [value.arrivalDate, value.departureDate].some(d => d && !d.startsWith(year + '-'))) issues.push(`日付は${year}年で確認してください。`)
  const field = 'mt-1 min-h-12 w-full min-w-0 rounded-lg border border-slate-400 bg-white p-2 text-base text-slate-900'
  return <fieldset disabled={disabled} className="min-w-0 space-y-3">
    <div className="grid min-w-0 gap-3 sm:grid-cols-2">{(['arrival', 'departure'] as const).map(kind => <div key={kind} className="grid grid-cols-2 gap-2 rounded-lg border p-3">
      <label className="font-bold">{kind === 'arrival' ? '入厩予定日' : '退厩予定日'}<input className={field} type="text" inputMode="text" maxLength={200} placeholder={`${year || '2026'}-11-13`} value={value[`${kind}Date`]} onChange={e => onChange({ ...value, [`${kind}Date`]: e.target.value })}/></label>
      <label className="font-bold">{kind === 'arrival' ? '入厩予定時刻' : '退厩予定時刻'}<input className={field} type="text" maxLength={200} placeholder="08:00" value={value[`${kind}Time`]} onChange={e => onChange({ ...value, [`${kind}Time`]: e.target.value })}/></label>
    </div>)}</div>
    <p className="text-sm">日付は「2026-11-13」、時刻は「08:00」の形式で入力してください。日本時間の予定です。記載がない項目は空欄にできます。</p>
    <label className="block font-bold">入退厩の備考・時間の要望<textarea className={field} maxLength={1000} rows={2} value={value.notes} onChange={e => onChange({ ...value, notes: e.target.value })}/></label>
    {!!issues.length && <div className="rounded-lg border-2 border-amber-600 bg-amber-100 p-3 text-amber-950" role="alert">{issues.map(issue => <p key={issue}>{issue}</p>)}</div>}
  </fieldset>
}
