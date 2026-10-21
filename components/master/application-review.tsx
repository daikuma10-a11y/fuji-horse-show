'use client'

import type {Application,ApplicationPerson,ApplicationEntry,ApplicationDifference,IdentityCandidate} from '@/lib/master/application'
import type {ReactNode} from 'react'

const field='mt-1 min-h-12 w-full rounded-lg border-2 border-slate-400 bg-white p-2 text-base text-slate-900'
const buttonBase='min-h-14 rounded-xl border-2 border-blue-800 px-4 py-3 text-lg font-bold disabled:opacity-40'
const button=buttonBase+' bg-white text-blue-900'
const primaryButton=buttonBase+' bg-blue-800 text-white'
const cell='border border-slate-300 p-3 align-top'
const yen=(v:number|null)=>v===null?'未確認':`${v.toLocaleString('ja-JP')}円`
type AmountRow={key:keyof Application['amounts'];label:string;original:number|null;calculated:number|null;reason:string}
export type ApplicationReviewModel={amounts:AmountRow[];issues:string[];entryPrices:(number|null)[];ready:boolean}
export function MasterApplicationReview(p:{
 busy:boolean;message:string;error:string;fileName:string;eventName:string;formatDescription:string
 frozen?:boolean;registration?:ReactNode
 original:Application|null;edited:Application|null;reference:string;paid:string;accountChecked:boolean
 review:ApplicationReviewModel|null;candidates:Record<string,IdentityCandidate[]>;choices:Record<string,string>;rosterLoaded:boolean
 differences:ApplicationDifference[]|null;revisionName:string
 onFiles:(files:FileList|null)=>void;onRead:()=>void;onRestoreFile:(file:File)=>void;onSave:()=>void;onOpenSaved:()=>void;onDownload:()=>void;onLoadRoster:()=>void;onReset:()=>void
 onReference:(s:string)=>void;onClub:(s:string)=>void;onPaid:(s:string)=>void;onAccountChecked:(v:boolean)=>void
 onPerson:(key:string,patch:Partial<ApplicationPerson>)=>void;onEntry:(key:string,patch:Partial<ApplicationEntry>)=>void
 onAmount:(key:keyof Application['amounts'],value:string)=>void;onChoice:(key:string,value:string)=>void
 competitions:{number:string;name:string}[]
}){
 const app=p.edited,source=p.original
 return <section aria-label="申込書の読み込み" className="space-y-5 rounded-xl border-2 border-blue-300 bg-white p-5 text-slate-900">
  <h3 className="text-2xl font-bold">申込書の読み込み</h3>
  <p>{p.eventName}のExcel申込書から、人馬・エントリー・金額を確認します。</p>
  <p className="rounded-lg bg-amber-50 p-3 font-semibold">{p.registration?'Excelの読込後に内容を確認・訂正し、下の「照合・確定登録・途中再開」へ進んでください。読み込んだだけでは登録しません。':'現在は読込・訂正・確認途中の保存まで利用できます。確定登録への接続は準備中です。この欄からDBへの登録は行いません。'}</p>
  <div className="space-y-3 rounded-xl border-2 border-dashed border-blue-700 p-5" onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'}} onDrop={e=>{e.preventDefault();if(!p.busy)p.onFiles(e.dataTransfer.files)}}>
   <label className="block text-lg font-bold">Excelファイルを選択、またはここへドラッグして置く<input className={field} type="file" accept=".xlsx" disabled={p.busy} onChange={e=>{p.onFiles(e.target.files);e.target.value=''}}/></label>
   <p>選択中：{p.fileName||'未選択'}</p>
   <button type="button" className={primaryButton} disabled={p.busy||!p.fileName} onClick={p.onRead}>{p.busy?'処理中…':app?'選択したExcelを読み込み・差分を確認':'読み込みを開始'}</button>
  </div>
  <p>{p.formatDescription} .xls・PDF・マクロ・外部参照は対象外です。数式はExcelで保存された計算結果を使います。</p>
  <label className="block text-lg font-semibold">確認再開JSONを開く<input type="file" accept=".json" className={field} disabled={p.busy||p.frozen} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)p.onRestoreFile(f)}}/></label>
  {p.error&&<p role="alert" className="whitespace-pre-wrap rounded-xl bg-red-100 p-4">{p.error}</p>}
  {p.message&&<p role="status" className="whitespace-pre-wrap rounded-xl bg-blue-50 p-4">{p.message}</p>}
  {app&&source&&<>
   <p className="text-lg font-bold">選手 {app.people.filter(x=>x.kind==='rider').length}人 ／ 馬 {app.people.filter(x=>x.kind==='horse').length}頭 ／ エントリー {app.entries.length}件</p>
   <p>原本：{source.fileName} ／ 読取競技シート：{source.sheets.join('、')}</p>
   <fieldset disabled={p.busy||p.frozen} className="space-y-5">
    <legend className="sr-only">原本の照合と訂正</legend>
    <label className="block">資料番号（原本の受付番号など。再取込でも同じ番号）<input className={field} maxLength={100} value={p.reference} onChange={e=>p.onReference(e.target.value)}/></label>
    <label className="block">団体名<input className={field} maxLength={100} value={app.club} onChange={e=>p.onClub(e.target.value)}/><span>原本 {source.clubOrigin.sheet}!{source.clubOrigin.cell}：{source.club||'空欄'}</span></label>
    <button type="button" className={button} onClick={p.onLoadRoster}>既存の人馬候補を読み込む</button>
    <p>候補は氏名・馬名、読み、日馬連番号から提示します。所属を含めて確認して選択してください。名前の一致だけで統合しません。</p>
    <div className="overflow-x-auto"><table className="w-full min-w-[800px] border-collapse"><caption className="mb-2 text-left text-xl font-bold">人馬名簿：原本と読取・訂正値</caption><thead><tr>{['原本・入力位置','読取・訂正値','資格・料金区分','既存名簿との対応'].map(x=><th className={cell} key={x}>{x}</th>)}</tr></thead>
     <tbody>{app.people.map(person=>{
      const old=source.people.find(x=>x.key===person.key)!,candidates=p.candidates[person.key]??[],choice=p.choices[person.key]??'',selected=candidates.find(c=>c.id===choice)
      return <tr key={person.key}>
       <td className={cell}><p className="font-bold">{person.kind==='rider'?'選手':'馬'} {person.key}</p><p>{old.origin.sheet}!{old.origin.cell}</p><p>{old.name}</p><p>読み：{old.reading||'空欄'}</p><p>日馬連：{old.jef||'空欄'}</p>{person.kind==='rider'&&<p>資格：{old.grade||'未選択'}</p>}</td>
       <td className={cell}>{(['name','reading','jef'] as const).map((key,i)=><label key={key} className="mb-3 block">{['名前・馬名','ふりがな','日馬連番号'][i]}<input aria-label={`${person.key} ${key}`} className={field} maxLength={100} value={person[key]} onChange={e=>p.onPerson(person.key,{[key]:e.target.value})}/></label>)}</td>
       <td className={cell}><label className="flex gap-2"><input type="checkbox" checked={person.checked} onChange={e=>p.onPerson(person.key,{checked:e.target.checked})}/>日馬連番号を確認済み</label>
        {person.kind==='rider'&&<>
         <label className="mt-3 block">騎乗者資格<select className={field} value={person.grade} onChange={e=>p.onPerson(person.key,{grade:e.target.value})}><option value="">未選択</option>{!['','A','B','C','未登録'].includes(person.grade)&&<option value={person.grade}>{person.grade}（要選択）</option>}{['A','B','C','未登録'].map(x=><option key={x}>{x}</option>)}</select></label>
         {(['sportsMember','instructorMember'] as const).map((key,i)=><label key={key} className="mt-3 block">{i===0?'乗馬協会':'指導者協会'}の会員区分<select className={field} value={person[key]} onChange={e=>p.onPerson(person.key,{[key]:e.target.value})}><option value="">未確認</option><option>会員</option><option>非会員</option></select></label>)}
         <label className="mt-3 flex gap-2"><input type="checkbox" checked={person.qualified} onChange={e=>p.onPerson(person.key,{qualified:e.target.checked})}/>地域乗馬指導者資格を確認済み</label>
        </>}
       </td>
       <td className={cell}><label>対応する人馬<select className={field} value={choice} disabled={!p.rosterLoaded} onChange={e=>p.onChoice(person.key,e.target.value)}><option value="">確認して選択</option><option value="new">{p.frozen?'確定時の選択：新規登録':'新規登録する候補（まだ登録しない）'}</option>{choice&&choice!=='new'&&!selected&&<option value={choice}>{p.frozen?`確定時の対応：${choice}`:'保存済みの対応（候補の再確認が必要）'}</option>}{candidates.map(c=><option key={c.id} value={c.id}>{c.name} ／ {c.clubs.join('、')||'所属なし'} ／ {c.id}</option>)}</select></label>
        {p.frozen?<p>確定時の対応を固定しています。登録状態は下の照合一覧で確認してください。</p>:!p.rosterLoaded?<p>先に既存の人馬候補を読み込んでください。</p>:candidates.length===0?<p>一致候補なし。新規登録前に既存の人馬登録欄でも確認してください。</p>:candidates.map(c=><p key={c.id} className="mt-2">{c.name}：{c.reason} ／ 所属 {c.clubs.join('、')||'なし'}</p>)}
        {selected&&<p className="mt-3 bg-amber-50 p-2">既存値：{selected.name} ／ 読み {selected.reading||'空欄'} ／ 日馬連 {selected.jef||'空欄'}。原本との差は既存データへ自動反映しません。</p>}
       </td>
      </tr>
     })}</tbody></table></div>
    <div className="overflow-x-auto"><table className="w-full min-w-[700px] border-collapse"><caption className="mb-2 text-left text-xl font-bold">エントリー確認一覧</caption><thead><tr>{['原本・入力位置','競技','選手','馬','OP','計算料金'].map(x=><th className={cell} key={x}>{x}</th>)}</tr></thead><tbody>{app.entries.map((e,i)=><tr key={e.key}>
     <td className={cell}>{e.origin.sheet}!{e.origin.cell}<p>{source.entries[i].rawRider} ／ {source.entries[i].rawHorse}</p></td>
     <td className={cell}><select aria-label={`${e.key} 競技`} className={field} value={e.competition} onChange={v=>p.onEntry(e.key,{competition:v.target.value})}>{!p.competitions.some(c=>c.number===e.competition)&&<option value={e.competition}>要確認：{e.competition}</option>}{p.competitions.map(c=><option key={c.number} value={c.number}>{c.number}：{c.name}</option>)}</select></td>
     {(['rider','horse'] as const).map(kind=><td className={cell} key={kind}><select aria-label={`${e.key} ${kind}`} className={field} value={e[kind]} onChange={v=>p.onEntry(e.key,{[kind]:v.target.value})}><option value="">未対応・選択してください</option>{app.people.filter(person=>person.kind===kind).map(person=><option key={person.key} value={person.key}>{person.name}</option>)}</select></td>)}
     <td className={cell}><label><input type="checkbox" checked={e.op} onChange={v=>p.onEntry(e.key,{op:v.target.checked})}/> OP</label></td><td className={cell}>{yen(p.review?.entryPrices[i]??null)}</td>
    </tr>)}</tbody></table></div>
    <div className="overflow-x-auto"><table className="w-full border-collapse"><caption className="mb-2 text-left text-xl font-bold">原本請求と料金の照合</caption><thead><tr>{['項目','Excelに保存された値','原本確認後の値','既存料金で計算','差の確認箇所'].map(x=><th className={cell} key={x}>{x}</th>)}</tr></thead><tbody>{p.review?.amounts.map(a=><tr key={a.key}><th className={cell}>{a.label}</th><td className={cell}>{source.amounts[a.key]||'計算結果なし'}<p>{source.amountOrigins[a.key].sheet}!{source.amountOrigins[a.key].cell}</p></td><td className={cell}><input aria-label={`${a.label} 原本確認後の値`} inputMode="numeric" className={field} value={app.amounts[a.key]} onChange={e=>p.onAmount(a.key,e.target.value)}/></td><td className={cell}>{yen(a.calculated)}</td><td className={cell}>{a.reason||'一致'}</td></tr>)}</tbody></table></div>
    <label className="block">別途確認した入金額（確認した額を入力。未入金と確認できた場合は0）<input className={field} inputMode="numeric" value={p.paid} onChange={e=>p.onPaid(e.target.value)}/></label>
    <p>振込予定日から入金済みとは判断しません。この金額は再開ファイル内に保持し、入金処理には使いません。</p>
    <label className="flex gap-3"><input type="checkbox" checked={p.accountChecked} onChange={e=>p.onAccountChecked(e.target.checked)}/>原本請求額と、別途確認した入金額を確認しました</label>
   </fieldset>
   {p.review&&<div className="rounded-xl bg-slate-50 p-4"><p className="text-lg font-bold">{p.frozen?'確定時の入力・料金です。登録結果は下の照合一覧で確認してください。':p.review.ready?'入力・料金の照合に問題は見つかりませんでした（DB登録前）':'確認・訂正が必要です'}</p><ul className="list-disc space-y-1 pl-6">{p.review.issues.map((issue,i)=><li key={i}>{issue}</li>)}</ul></div>}
   {!p.frozen&&<><div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={p.busy} onClick={p.onSave}>確認途中をこの端末に保存</button><button type="button" className={button} disabled={p.busy} onClick={p.onOpenSaved}>この端末の確認途中を開く</button><button type="button" className={button} disabled={p.busy} onClick={p.onDownload}>確認再開JSONをダウンロード</button></div>
   <p>入力は自動保存されません。閉じる前に保存してください。再開JSONには人馬名・金額が含まれます。登録済みの証明ではありません。</p>
   <button type="button" className={button} disabled={p.busy} onClick={p.onReset}>確認再開JSONを保存して別の申込書へ</button></>}
  </>}
  {p.differences!==null&&<details open className="space-y-3 rounded-xl border-2 border-amber-300 p-4"><summary className="text-xl font-bold">訂正版との比較：{p.revisionName}</summary><p>現在の原本・訂正値は保持しています。取消候補を含め、既存登録の変更・削除は行いません。</p>{p.differences.length===0?<p>読み取った登録対象項目に差分はありません。</p>:<div className="overflow-x-auto"><table className="w-full border-collapse"><thead><tr>{['種類・位置','現在の原本','比較したExcel'].map(x=><th className={cell} key={x}>{x}</th>)}</tr></thead><tbody>{p.differences.map((d,i)=><tr key={i}><td className={cell}>{d.kind}<p>{d.location}</p></td><td className={cell+' whitespace-pre-wrap break-all'}>{d.before}</td><td className={cell+' whitespace-pre-wrap break-all'}>{d.after}</td></tr>)}</tbody></table></div>}</details>}
  {p.registration}
 </section>
}
