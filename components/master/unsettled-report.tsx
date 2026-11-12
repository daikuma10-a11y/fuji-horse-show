"use client"
import {useEffect, useRef, useState} from 'react'
import {unsettledColors, unsettledEmptyMessage, unsettledExplanation, unsettledHeaders, yen, type UnsettledRow} from '@/lib/master/stable-reports'
import {readFollowup, writeFollowup, type UnsettledFollowup} from '@/lib/master/unsettled-followup'

const cell = 'border p-2 text-left align-top'
const control = 'min-h-11 rounded-lg border-2 px-3 font-bold disabled:opacity-50'
type Draft = {id: string; name: string; base: UnsettledFollowup; value: UnsettledFollowup}

export function UnsettledReport({rows, storageKey, loading, error, printing, onPrint}: {
  rows: UnsettledRow[]; storageKey: string; loading: boolean; error: string; printing: boolean; onPrint: () => void
}) {
  const [notes, setNotes] = useState(new Map<string, UnsettledFollowup>())
  const [draft, setDraft] = useState<Draft | null>(null)
  const [readError, setReadError] = useState(''), [saveError, setSaveError] = useState('')
  const [notice, setNotice] = useState(''), [saving, setSaving] = useState(false)
  const lock = useRef(false)
  useEffect(() => {
    function load() {
      try {
        setNotes(new Map(rows.map(row => [row.id, readFollowup(localStorage, storageKey, row.id)])))
        setReadError('')
      } catch { setReadError('この端末に保存した備考を読み込めません。ブラウザーの保存設定を確認してください。') }
    }
    function changed(event: StorageEvent) { if (event.key === null || event.key.startsWith(storageKey+':')) load() }
    load()
    window.addEventListener('storage', changed)
    return () => window.removeEventListener('storage', changed)
  }, [rows, storageKey])

  function edit(id: string, name: string) {
    try {
      const base = readFollowup(localStorage, storageKey, id)
      setDraft({id, name, base, value:base}); setNotice(''); setSaveError('')
    } catch { setSaveError('この端末の備考を読み込めませんでした。') }
  }
  async function save() {
    if (!draft || lock.current) return
    lock.current = true; setSaving(true); setSaveError('')
    try {
      const write = () => writeFollowup(localStorage, storageKey, draft.id, draft.base, draft.value)
      if (navigator.locks) await navigator.locks.request(storageKey+':'+draft.id, write)
      else write()
      setNotes(previous => new Map(previous).set(draft.id, draft.value))
      setNotice(draft.name+'の備考をこの端末に保存しました。'); setDraft(null)
    } catch (e) {
      setSaveError(e instanceof Error && e.name === 'Error' ? e.message : '備考を保存できませんでした。ブラウザーの空き容量と保存設定を確認してください。')
    } finally { lock.current = false; setSaving(false) }
  }
  const editor = draft && <fieldset disabled={saving} className="space-y-2 rounded-lg border-2 border-primary p-3">
    <legend className="px-1 font-bold">{draft.name}の備考</legend>
    <label className="block">理由・備考<textarea rows={3} value={draft.value.reason} className="block w-full rounded border p-2"
      onChange={e => setDraft({...draft, value:{...draft.value, reason:e.target.value}})}/></label>
    <label className="block">連絡状況 <select className={control} value={draft.value.contact}
      onChange={e => setDraft({...draft, value:{...draft.value, contact:e.target.value as UnsettledFollowup['contact']}})}>
      <option value="">未記録</option><option>未連絡</option><option>連絡済み</option>
    </select></label>
    <div className="flex flex-wrap gap-2">
      <button type="button" className={control} onClick={() => void save()}>備考を保存</button>
      <button type="button" className={control} onClick={() => {setDraft(null); setSaveError('')}}>キャンセル</button>
      {saveError && <button type="button" className={control} onClick={() => edit(draft.id, draft.name)}>保存内容を読み直す</button>}
    </div>
    {saveError && <p role="alert" className="text-red-800">{saveError}</p>}
  </fieldset>
  const showRows = !loading && !error
  return <section className="space-y-3 rounded-xl border-2 bg-card p-4" aria-label="未精算リスト">
    <h3 className="text-xl font-bold">未精算リスト</h3><p>{unsettledExplanation}</p>
    <p>「備考を編集」で理由と連絡状況を記録できます。保存先はこのブラウザーです。</p>
    <button type="button" className="min-h-14 rounded-xl bg-primary px-5 py-3 text-lg font-bold text-primary-foreground disabled:opacity-50"
      disabled={printing || !showRows || !!draft || !!readError} onClick={onPrint}>未精算リストを印刷</button>
    {loading && <p role="status">最新の精算状況を確認しています…</p>}
    {(error || readError || (!draft && saveError)) && <p role="alert" className="text-red-800">{error || readError || saveError}</p>}
    {notice && <p role="status">{notice}</p>}
    {draft && (!showRows || !rows.some(row => row.id === draft.id)) && editor}
    {showRows && (rows.length ? <div className="overflow-x-auto"><table className="w-full border-collapse">
      <thead><tr>{unsettledHeaders.map(label => <th key={label} className={cell}>{label}</th>)}</tr></thead>
      <tbody>{rows.map(row => {
        const note = notes.get(row.id)
        return <tr key={row.id}><td className={cell}>□</td><td className={cell}>{row.name}</td>
          <td className={cell}><strong className="inline-block whitespace-nowrap rounded border border-current px-2 py-1" style={unsettledColors[row.status]}>{row.status}</strong></td>
          <td className={`${cell} whitespace-nowrap`}>{row.amount === null ? '—' : yen(row.amount)}{row.review && <span className="block text-sm font-bold text-amber-900">要確認</span>}</td>
          <td className={`${cell} min-w-56 space-y-2`}>
            {draft?.id === row.id ? editor : <>
              {note?.reason && <p className="whitespace-pre-wrap [overflow-wrap:anywhere]">{note.reason}</p>}
              {note?.contact && <p>連絡状況：{note.contact}</p>}
              <button type="button" className={control} disabled={!!draft || !!readError} onClick={() => edit(row.id, row.name)}>備考を編集</button>
            </>}
          </td></tr>
      })}</tbody>
    </table></div> : <p>{unsettledEmptyMessage}</p>)}
  </section>
}
