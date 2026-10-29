"use client"
import { useRef, useState } from 'react'
import { emptyStableSchedule, mergeStableSchedule, stableScheduleIssues, type StableSchedule } from '@/lib/master/stable-schedule'
import { MasterStableScheduleFields } from './stable-schedule-fields'
import { MasterFilePicker } from './file-picker'

export type StableScheduleEditorRow = { id: string; name: string; value: StableSchedule; revision: string | null }
export function MasterStableScheduleEditor({ rows, loading, error, onReadExcel, onSave, onReload, year }: {
  rows: StableScheduleEditorRow[]; loading: boolean; error: string; year: string
  onReadExcel: (file: File) => Promise<{ club: string; value: StableSchedule }>
  onSave: (id: string, value: StableSchedule, expected: string | null) => Promise<void>
  onReload: () => Promise<void>
}) {
  const [selected, setSelected] = useState<StableScheduleEditorRow | null>(null), [value, setValue] = useState(emptyStableSchedule)
  const [busy, setBusy] = useState(false), [message, setMessage] = useState(''), [problem, setProblem] = useState(''), [source, setSource] = useState('')
  const [activity, setActivity] = useState('')
  const lock = useRef(false)
  function select(id: string) { const row = rows.find(r => r.id === id) ?? null; setSelected(row); setValue(row?.value ?? emptyStableSchedule()); setProblem(''); setMessage(''); setSource('') }
  async function action(fn: () => Promise<void>, progress = '保存中です。保存結果を確認しています…') { if (lock.current) return; lock.current = true; setBusy(true); setActivity(progress); setProblem(''); setMessage(''); try { await fn() } catch (reason) { setProblem(reason instanceof Error ? reason.message : '処理を完了できませんでした。内容を確認してやり直してください。') } finally { lock.current = false; setBusy(false); setActivity('') } }
  return <section className="space-y-3 rounded-xl border-2 bg-card p-4" aria-label="入退厩予定の補足・訂正">
    <h3 className="text-xl font-bold">入退厩予定の補足・訂正</h3>
    <p>登録済みの団体は、ここで日時を入力するか、申込書のExcelから日時だけを読み込めます。「日時のみ保存」で手帳チェックに反映します。</p>
    <p className="text-sm">出番・人馬・料金は追加しません。入厩チェックリストには日時を印刷しません。</p>
    {loading && <p role="status">保存済みの入退厩予定を読み込んでいます…</p>}{error && <p role="alert" className="rounded bg-red-50 p-3 text-red-800">{error}</p>}
    <fieldset disabled={busy || loading || !!error} className="space-y-3">
      <label className="block font-bold">対象の団体<select className="mt-1 min-h-12 w-full rounded-lg border bg-background p-2" value={selected?.id ?? ''} onChange={e => select(e.target.value)}><option value="">団体を選んでください</option>{rows.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
      {selected && <><MasterFilePicker key={selected.id} label={busy && activity.startsWith('読み込み中') ? 'Excelの日時を読み込み中…' : 'Excelを選んで日時を読み込む'} accept=".xlsx" disabled={busy || loading || !!error} hint="ボタンを押して、この団体の申込書（Excel）を選んでください。読み込み後、下の日時を確認して「日時のみ保存」を押します。" onFiles={files => { const file = files[0]; if (file) void action(async () => {
        setSource('')
        const result = await onReadExcel(file)
        // Exact matching prevents an unrelated club file from silently overwriting this club.
        if (result.club.trim() && result.club.trim() !== selected.name.trim()) throw new Error(`申込書の団体「${result.club}」と選択中の団体が異なります。対象の団体を選び直してください。`)
        setValue(mergeStableSchedule(value, result.value)); setSource(file.name)
        setMessage(result.club.trim() ? '✓ 読み込み完了・まだ保存していません。下の日時を確認して「日時のみ保存」を押してください。' : '読み込み完了・まだ保存していません。申込書の団体名が空欄です。選択した団体の申込書であることと日時を確認して保存してください。')
      }, '読み込み中です。Excelから入厩・退厩日時を確認しています…') }}/>
      {busy && activity.startsWith('読み込み中') && <p role="status" className="rounded-lg border-2 border-blue-700 bg-blue-50 p-3 font-bold text-blue-950">{activity}</p>}
      {source && <p className="rounded-lg border border-emerald-700 bg-emerald-50 p-3 font-bold text-emerald-900">✓ 日時の読み込み完了：{source}（保存待ち）</p>}
      <MasterStableScheduleFields value={value} onChange={setValue} year={year}/>
      <p className="text-sm">この欄を空欄にして保存すると、その項目の保存済み予定を消します。Excel読込時の空欄は保存済みの値を保持します。</p>
      <button type="button" className="min-h-14 rounded-xl bg-primary px-5 py-3 text-lg font-bold text-primary-foreground disabled:opacity-50" disabled={!!stableScheduleIssues(value).length || [value.arrivalDate, value.departureDate].some(d => d && !d.startsWith(year + '-'))} onClick={() => void action(async () => { await onSave(selected.id, value, selected.revision); setSelected(null); setSource(''); setMessage('✓ 入退厩予定を保存しました。手帳チェックに反映済みです。') })}>日時のみ保存</button></>}
    </fieldset>
    <button type="button" disabled={busy || loading} className="master-secondary-action" onClick={() => void action(async () => { await onReload(); setSelected(null); setSource(''); setMessage('最新の保存内容を読み直しました。団体を選んで確認してください。') }, '保存済みの日時を読み直しています…')}>最新の保存内容を読み直す</button>
    {busy && !activity.startsWith('読み込み中') && <p role="status" className="rounded-lg bg-blue-50 p-3 font-bold text-blue-950">{activity}</p>}{message && <p role="status" className="rounded-lg bg-emerald-50 p-3 font-bold text-emerald-900">{message}</p>}{problem && <p role="alert" className="rounded-lg bg-red-50 p-3 font-bold text-red-800">{problem}</p>}
  </section>
}
