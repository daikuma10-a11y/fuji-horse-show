import {readingListByClub,type ReadingList} from '@/lib/master/reading-list'

export function MasterReadingList({list,eventName,compareClubs}:{list:ReadingList;eventName:string;compareClubs:(a:{name:string},b:{name:string})=>number}){
  const clubs=readingListByClub(list,compareClubs)
  return <div className="reading-list-paper space-y-5">
    <header><h2 className="text-xl font-bold">{eventName} 人馬フリガナ一覧</h2><p>選手 {list.riders.length}名 ／ 馬 {list.horses.length}頭</p></header>
    {clubs.map(club=><section key={club.name} className="space-y-2">
      <h3 className="border-b-2 border-slate-500 pb-1 text-lg font-bold">{club.name||'所属未登録'}</h3>
      {(['riders','horses'] as const).filter(kind=>club[kind].length>0).map(kind=><table key={kind} aria-label={club.name+' '+(kind==='riders'?'選手':'馬')} className="w-full table-fixed border-collapse text-sm">
        <colgroup><col style={{width:'40%'}}/><col style={{width:'42%'}}/><col style={{width:'18%'}}/></colgroup>
        <thead><tr>{[kind==='riders'?'選手名':'馬名','フリガナ','日馬連番号'].map(h=><th key={h} className="border border-slate-400 bg-slate-100 p-2 text-left">{h}</th>)}</tr></thead>
        <tbody>{club[kind].map(row=><tr key={row.id}>
          <td className="border border-slate-400 p-2 break-words">{row.name}</td>
          <td className={'border border-slate-400 p-2 break-words font-bold'+(row.reading?'':' bg-amber-100 text-amber-950')}>{row.reading||'未登録（要確認）'}</td>
          <td className="border border-slate-400 p-2">{row.number||'なし'}</td>
        </tr>)}</tbody>
      </table>)}
    </section>)}
    {!clubs.length&&<p>出場する人馬はまだ登録されていません。</p>}
  </div>
}
