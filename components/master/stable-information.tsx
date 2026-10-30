"use client"
import { useState, type ReactNode } from 'react'
import { usePrintDocument } from './use-print-document'
import { fitStableChecklistNames, stableChecklistHtml, type StableGroup } from '@/lib/master/stable-information'

const button = 'min-h-14 rounded-xl border-2 border-primary bg-primary px-5 text-lg font-bold text-primary-foreground disabled:opacity-50'

export function MasterStableInformation({ groups, eventName, loading = false, error = '', loadForPrint, reports, allocation }: {
  groups: StableGroup[]; eventName: string; loading?: boolean; error?: string; loadForPrint: () => Promise<StableGroup[]>; reports?: ReactNode; allocation?: ReactNode
}) {
  const [selected, setSelected] = useState('')
  const printer = usePrintDocument()
  const { busy, notice, error: printError } = printer
  const chosen = selected ? groups.filter(group => group.id === selected) : groups
  async function print() {
    if (loading || error || !chosen.length) return
    await printer.print(async () => {
      const latest = await loadForPrint()
      const target = selected ? latest.filter(group => group.id === selected) : latest
      if (!target.length) throw new Error('印刷する参加馬がいません。最新の登録内容を確認してください。')
      return stableChecklistHtml(target, eventName)
    }, '横', fitStableChecklistNames)
  }
  return <section className="master-action-surface space-y-5" aria-label="入厩情報">
    <h2 className="text-2xl font-bold">入厩情報</h2>
    <div className="space-y-4 rounded-xl border-2 bg-card p-4">
      <h3 className="text-xl font-bold">入厩チェックリスト</h3>
      <p>大会への参加登録済みの馬を、団体別に印刷します。出番未登録・棄権した馬も含みます。</p><p>A4横向きに2団体分。1枠に16頭まで載せ、17頭以上は続きの用紙に分けます。備考・署名は印刷後に記入してください。</p>
      <label className="block text-lg font-bold">印刷する団体<select className="mt-2 min-h-14 w-full rounded-xl border-2 bg-background px-3 text-lg" value={selected} disabled={busy || loading || !!error} onChange={event => { setSelected(event.target.value); printer.clear() }}><option value="">全団体</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}（{group.horses.length}頭）</option>)}</select></label>
      <p>{chosen.length}団体 ／ {chosen.reduce((sum, group) => sum + group.horses.length, 0)}頭</p>
      <button type="button" className={button} disabled={busy || loading || !!error || !chosen.length} onClick={() => void print()}>{busy ? '印刷の準備中…' : selected ? 'この団体の入厩チェックリストを印刷' : '全団体の入厩チェックリストを一括印刷'}</button>
      <p className="text-sm">印刷時に最新の登録内容を読み直します。馬名は1行に収まるよう自動で縮小します。</p>
      {notice && <p role="status">{notice}</p>}
      {(error || printError) && <p role="alert" className="rounded-lg bg-red-50 p-3 font-bold text-red-800">{error || printError}</p>}
    {loading ? <p role="status">参加馬を読み込んでいます…</p> : !error && !chosen.length ? <p>対象の参加馬はいません。事前登録の参加チェックを確認してください。</p> : !error && chosen.map(group => <details key={group.id} className="rounded-xl border-2 p-4" open={!!selected}>
      <summary className="cursor-pointer text-xl font-bold">{group.name}（{group.horses.length}頭）</summary><ol className="mt-3 list-decimal space-y-1 pl-7 text-lg">{group.horses.map(horse => <li key={horse.id}>{horse.name}</li>)}</ol>
    </details>)}
    </div>
    {reports}
    {allocation}
    <div className="grid gap-4 sm:grid-cols-2">
      {(allocation?['出店配置図']:['厩舎配置図', '出店配置図']).map(title => <section key={title} className="rounded-xl border-2 bg-card p-4"><h3 className="text-xl font-bold">{title}</h3><p className="mt-2 text-muted-foreground">資料はまだ登録されていません。</p></section>)}
    </div>
  </section>
}
