import type { ReadingList } from '@/lib/master/reading-list'

export function MasterReadingList({ list, eventName }: { list: ReadingList; eventName: string }) {
  return <div className="reading-list-paper space-y-5">
    <header><h2 className="text-xl font-bold">{eventName} 人馬フリガナ一覧</h2><p className="mt-1 text-sm">大会全日程の出場登録から作成。同じ人馬は1件にまとめています。全出番が棄権・取消の人馬は含みません。</p></header>
    {(['riders','horses'] as const).map(kind => <section key={kind}>
      <h3 className="mb-2 text-lg font-bold">{kind === 'riders' ? '選手' : '馬'}（{list[kind].length}{kind === 'riders' ? '名' : '頭'}）</h3>
      <table className="w-full table-fixed border-collapse text-sm"><colgroup><col style={{width:'25%'}}/><col style={{width:'29%'}}/><col style={{width:'32%'}}/><col style={{width:'14%'}}/></colgroup>
        <thead><tr>{[kind === 'riders' ? '選手名' : '馬名','フリガナ','所属','日馬連番号'].map(h => <th key={h} className="border border-slate-400 bg-slate-100 p-2 text-left">{h}</th>)}</tr></thead>
        <tbody>{list[kind].map(row => <tr key={row.id}>
          <td className="border border-slate-400 p-2 break-words">{row.name}</td>
          <td className={`border border-slate-400 p-2 break-words ${row.reading ? 'font-bold' : 'bg-amber-100 font-bold text-amber-950'}`}>{row.reading || '未登録（要確認）'}</td>
          <td className="border border-slate-400 p-2 break-words">{row.organizations.join(' ／ ')}</td>
          <td className="border border-slate-400 p-2 break-words">{row.number || 'なし'}</td>
        </tr>)}{!list[kind].length && <tr><td colSpan={4} className="border p-2">対象の{kind === 'riders' ? '選手' : '馬'}はいません。</td></tr>}</tbody>
      </table>
    </section>)}
  </div>
}
