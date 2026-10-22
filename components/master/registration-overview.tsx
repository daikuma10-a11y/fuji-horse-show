"use client"
import type {RegistrationOverviewGroup,RegistrationOverviewPerson} from '@/lib/master/registration-overview'

const cell='border-b border-border px-4 py-3 text-left align-top'
function PeopleTable({title,rows}:{title:string;rows:readonly RegistrationOverviewPerson[]}){
 return <section className="overflow-hidden rounded-2xl border-2 border-border bg-card">
  <h4 className="border-b border-border bg-muted/40 px-4 py-3 text-xl font-bold">{title}（{rows.length}{title==='選手名簿'?'名':'頭'}）</h4>
  {!rows.length?<p className="p-4">登録された{title==='選手名簿'?'選手':'馬'}はいません。</p>:<div className="overflow-x-auto"><table className="w-full text-base"><caption className="sr-only">{title}</caption><thead className="bg-muted/20"><tr>{['名前・馬名','日馬連番号','所属','この団体の出場登録'].map(label=><th key={label} scope="col" className={cell}>{label}</th>)}</tr></thead><tbody>{rows.map(row=><tr key={row.id}><th scope="row" className={`${cell} min-w-36 font-semibold`}>{row.name}</th><td className={cell}>{row.number||'未登録'}</td><td className={cell}>{row.organization}</td><td className={`${cell} whitespace-nowrap`}>{row.entryCount?`${row.entryCount}件`:'出場登録なし'}</td></tr>)}</tbody></table></div>}
 </section>
}
export function MasterRegistrationOverview({groups,selectedId,onSelect,loading=false,error=''}:{groups:readonly RegistrationOverviewGroup[];selectedId:string;onSelect:(id:string)=>void;loading?:boolean;error?:string}){
 const selected=groups.find(group=>group.id===selectedId)
 return <section aria-label="団体別の登録内容" className="space-y-5">
  <div><h3 className="text-2xl font-bold">団体別の登録内容</h3><p className="mt-2 text-lg">団体を選ぶと、この大会の選手・馬・エントリーをまとめて確認できます。Excel取込分と、以前から登録されている分を含みます。</p></div>
  {loading?<p role="status" className="rounded-xl bg-blue-50 p-4">登録済みの内容を読み込んでいます…</p>:error?<p role="alert" className="rounded-xl bg-red-100 p-4">{error}</p>:selected?<>
   <button type="button" onClick={()=>onSelect('')} className="min-h-14 rounded-xl border-2 border-border bg-card px-5 py-3 text-xl font-bold">← 団体一覧へ</button>
   <div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
    <h4 className="text-3xl font-bold">{selected.name}</h4>
    <dl className="mt-4 grid grid-cols-3 gap-3">
     <div><dt>選手</dt><dd className="text-2xl font-bold">{selected.riders.length}名</dd></div><div><dt>馬</dt><dd className="text-2xl font-bold">{selected.horses.length}頭</dd></div><div><dt>エントリー</dt><dd className="text-2xl font-bold">{selected.activeCount}件</dd></div>
    </dl>
    <p className="mt-3 text-sm">他所属の騎乗者・馬がエントリーに含まれる場合は、名簿にも所属を併記します。エントリー件数は棄権済みを除きます。</p>
   </div>
   <PeopleTable title="選手名簿" rows={selected.riders}/>
   <PeopleTable title="馬名簿" rows={selected.horses}/>
   <section className="overflow-hidden rounded-2xl border-2 border-border bg-card">
    <h4 className="border-b border-border bg-muted/40 px-4 py-3 text-xl font-bold">エントリー一覧（{selected.activeCount}件{selected.withdrawnCount?` ／ 棄権済み ${selected.withdrawnCount}件`:''}）</h4>
    {!selected.entries.length?<p className="p-4">この団体のエントリーはまだありません。</p>:<div className="overflow-x-auto"><table className="w-full text-base"><caption className="sr-only">登録済みエントリー</caption><thead className="bg-muted/20"><tr>{['日程・競技','出番','選手','馬','区分・状態'].map(label=><th key={label} scope="col" className={cell}>{label}</th>)}</tr></thead><tbody>{selected.entries.map(entry=><tr key={entry.id} className={entry.withdrawn?'bg-muted/40 text-muted-foreground':''}><th scope="row" className={`${cell} min-w-48 font-semibold`}><span className="block text-sm font-normal">{entry.date}</span>{entry.competition}</th><td className={cell}>{entry.withdrawn?'—':entry.startOrder??'未設定'}</td><td className={`${cell} min-w-32`}>{entry.rider}</td><td className={`${cell} min-w-32`}>{entry.horse}</td><td className={`${cell} whitespace-nowrap`}>{entry.isOp&&<span className="mr-2 rounded bg-blue-100 px-2 py-1 text-blue-950">OP</span>}{entry.status}</td></tr>)}</tbody></table></div>}
   </section>
  </>:<>
   {selectedId&&<p role="status" className="rounded-xl bg-amber-50 p-4">選択していた団体は現在の一覧にありません。団体を選び直してください。</p>}
   {!groups.length?<p className="rounded-xl border-2 border-dashed p-5">登録済みの団体はまだありません。申込書を取り込むか、人馬を登録すると表示されます。</p>:<div className="overflow-hidden rounded-2xl border-2 border-border bg-card shadow-sm">{groups.map((group,index)=><button key={group.id} type="button" onClick={()=>onSelect(group.id)} className={`flex min-h-24 w-full items-center justify-between gap-4 px-5 py-5 text-left hover:bg-muted/40 ${index?'border-t border-border':''}`}><span className="min-w-0"><span className="block text-xl font-bold">{group.name}</span><span className="mt-2 block text-sm">選手 {group.riders.length}名 ／ 馬 {group.horses.length}頭 ／ エントリー {group.activeCount}件{group.withdrawnCount?` ／ 棄権済み ${group.withdrawnCount}件`:''}</span></span><span aria-hidden="true" className="text-2xl text-muted-foreground">›</span></button>)}</div>}
  </>}
 </section>
}
