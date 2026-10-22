'use client'

import type {Application,ApplicationPerson,ApplicationEntry,ApplicationDifference,IdentityCandidate} from '@/lib/master/application'
import {applicationPersonTarget,applicationEntryTarget,type ApplicationTodo,type ApplicationClubSummary} from '@/lib/master/application-guide'
import type {ReactNode} from 'react'

const field='mt-1 min-h-12 w-full rounded-lg border-2 border-slate-400 bg-white p-2 text-base text-slate-900'
const buttonBase='min-h-12 rounded-xl border-2 border-blue-800 px-4 py-3 text-base font-bold disabled:opacity-40'
const button=buttonBase+' bg-white text-blue-900'
const primaryButton=buttonBase+' bg-blue-800 text-white'
const cell='border border-slate-300 p-3 align-top'
const yen=(v:number|null)=>v===null?'未確認':`${v.toLocaleString('ja-JP')}円`
function go(id:string){
 const el=document.getElementById(id)
 if(el instanceof HTMLDetailsElement)el.open=true
 el?.scrollIntoView({block:'center',behavior:'smooth'});el?.focus({preventScroll:true})
}
function differenceText(text:string){
 try{const value=JSON.parse(text);if(typeof value==='string')return value
  if(value&&typeof value==='object'){
   if('competition' in value)return `第${value.competition}競技 ／ ${value.rawRider||'選手空欄'}（対応：${value.rider||'未選択'}） ／ ${value.rawHorse||'馬名空欄'}（対応：${value.horse||'未選択'}） ／ OP：${value.op?'あり':'なし'}`
   if('name' in value)return `${value.name} ／ 読み：${value.reading||'空欄'} ／ 日馬連：${value.jef||'空欄'}（${value.checked?'確認済み':'未確認'}）${value.kind==='rider'?` ／ 資格：${value.grade||'未選択'} ／ 乗馬協会：${value.sportsMember||'未確認'} ／ 指導者協会：${value.instructorMember||'未確認'} ／ 地域乗馬指導者資格：${value.qualified?'確認済み':'未確認'}`:''}`
  }
 }catch{/* Non-JSON labels, including a missing source row, are already readable. */}
 return text
}
type AmountRow={key:keyof Application['amounts'];label:string;original:number|null;calculated:number|null;reason:string}
export type ApplicationReviewModel={amounts:AmountRow[];issues:string[];entryPrices:(number|null)[];ready:boolean}
export function MasterApplicationReview(p:{
 busy:boolean;message:string;error:string;fileName:string;eventName:string;formatDescription:string
 frozen?:boolean;registration?:ReactNode;stage?:number;todos?:ApplicationTodo[];clubSummary?:ApplicationClubSummary|null
 onReview?:()=>void;onChanges?:()=>void;onUseRevision?:()=>void
 intent?:'addition'|'change'|'';onIntent?:(value:'addition'|'change')=>void
 original:Application|null;edited:Application|null;reference:string;paid:string;accountChecked:boolean
 review:ApplicationReviewModel|null;candidates:Record<string,IdentityCandidate[]>;choices:Record<string,string>;rosterLoaded:boolean
 differences:ApplicationDifference[]|null;revisionName:string
 onFiles:(files:FileList|null)=>void;onRead:()=>void;onRestoreFile:(file:File)=>void;onSave:()=>void;onOpenSaved:()=>void;onDownload:()=>void;onLoadRoster:()=>void;onReset:()=>void
 onReference:(s:string)=>void;onClub:(s:string)=>void;onPaid:(s:string)=>void;onAccountChecked:(v:boolean)=>void
 onPerson:(key:string,patch:Partial<ApplicationPerson>)=>void;onEntry:(key:string,patch:Partial<ApplicationEntry>)=>void
 onAmount:(key:keyof Application['amounts'],value:string)=>void;onChoice:(key:string,value:string)=>void
 competitions:{number:string;name:string}[]
}){
 const app=p.edited,source=p.original,stage=p.stage??(app?2:1),todos=p.todos??[],blocking=todos.filter(t=>t.blocking)
 const notes=(target:string)=>todos.filter(t=>t.target===target)
 const notices=(target:string)=><>{notes(target).map((t,i)=><p key={i} className={`mt-2 rounded-lg p-2 ${t.blocking?'bg-amber-100 text-amber-950':'bg-blue-50 text-blue-950'}`}>{t.blocking?'要確認：':'補足：'}{t.message}</p>)}</>
 const panel=(target:string)=>`scroll-mt-24 rounded-xl border-2 p-4 ${notes(target).some(t=>t.blocking)?'border-amber-500 bg-amber-50/30':'border-slate-300 bg-white'}`
 return <section aria-label="申込書の読み込み" className="min-w-0 space-y-5 rounded-xl border-2 border-blue-300 bg-white p-4 text-slate-900 sm:p-5">
  <h3 className="text-2xl font-bold">Excel申込書の取り込み</h3>
  <p>{p.eventName}</p>
  <ol aria-label="取り込みの進み具合" className="grid grid-cols-2 gap-2 sm:grid-cols-4">{['① 申込書を読む','② 内容を確認・訂正','③ 取り込む','④ 反映結果'].map((label,i)=><li key={label} aria-current={stage===i+1?'step':undefined} className={`rounded-lg border-2 p-3 font-bold ${stage===i+1?'border-blue-800 bg-blue-800 text-white':stage>i+1?'border-emerald-700 bg-emerald-50':'border-slate-200 bg-slate-50'}`}>{label}{stage>i+1?' ✓':''}</li>)}</ol>
  <div className="rounded-xl border-l-4 border-blue-800 bg-blue-50 p-4" role="status"><strong>次にすること</strong><p>{p.busy?'処理中です。この画面でお待ちください。':stage===4?'取り込み結果を確認し、出番表・精算を開けます。':p.frozen?'③で登録結果を再確認してください。確定時の入力は保存されています。':stage===3?'③の登録対象と確認欄を確認して「取り込む」を押してください。':app?blocking.length?`②に確認が必要な項目が${blocking.length}件あります。下の一覧から移動できます。`:'②の内容を確認できたら「取込内容を確認する」を押してください。':'Excelを選び「申込書を読み込む」を押してください。'}</p>
   {!p.busy&&app&&!p.frozen&&stage===2&&<button className={primaryButton+' mt-3'} type="button" onClick={()=>blocking.length?go(blocking[0].target):p.onReview?.()}>{blocking.length?'最初の確認箇所へ':'取込内容を確認する'}</button>}
  </div>
  <div id="application-source" tabIndex={-1} className="space-y-3 rounded-xl border-2 border-dashed border-blue-700 p-4" onDragOver={e=>{e.preventDefault();e.dataTransfer.dropEffect='copy'}} onDrop={e=>{e.preventDefault();if(!p.busy)p.onFiles(e.dataTransfer.files)}}>
   <h4 className="text-xl font-bold">① 申込書を読み込む</h4>
   <label className="block font-bold">Excelファイルを選択、またはここへドラッグして置く<input className={field} type="file" accept=".xlsx" disabled={p.busy} onChange={e=>{p.onFiles(e.target.files);e.target.value=''}}/></label>
   <p>選択中：{p.fileName||'未選択'}</p>
   <button type="button" className={primaryButton} disabled={p.busy||!p.fileName} onClick={p.onRead}>{p.busy?'処理中…':app?'選択したExcelと比較する':'申込書を読み込む'}</button>
   <p>読み込んだだけでは登録しません。{app?'別のExcelを選ぶと、今の内容を保持して差分を表示します。':''}</p>
  </div>
  <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">対応するExcel・途中から再開</summary><p className="my-3">{p.formatDescription} .xls・PDF・マクロ・外部参照は対象外です。数式はExcelで保存された計算結果を使います。</p><label className="block font-semibold">確認再開JSONを開く<input type="file" accept=".json" className={field} disabled={p.busy||p.frozen} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)p.onRestoreFile(f)}}/></label></details>
  {p.error&&<p role="alert" className="whitespace-pre-wrap rounded-xl bg-red-100 p-4">{p.error}</p>}
  {p.message&&<p role="status" className="whitespace-pre-wrap rounded-xl bg-blue-50 p-4">{p.message}</p>}
  {app&&source&&<>
   <h4 className="text-xl font-bold">② 内容を確認・訂正</h4>
   <p className="text-lg font-bold">{app.club||'団体名未入力'} ／ 選手 {app.people.filter(x=>x.kind==='rider').length}人・馬 {app.people.filter(x=>x.kind==='horse').length}頭・エントリー {app.entries.length}件</p>
   <p>原本：{source.fileName} ／ 読取競技シート：{source.sheets.join('、')}</p>
   {!p.frozen&&<div aria-label="確認が必要な箇所" className={`rounded-xl border-2 p-4 ${blocking.length?'border-amber-500 bg-amber-50':'border-emerald-700 bg-emerald-50'}`}>
    <h5 className="font-bold">{blocking.length?`取り込み前に確認：${blocking.length}件`:'入力・料金の確認がそろいました'}</h5>
    {todos.length>0?<ul className="mt-2 space-y-2">{todos.map((t,i)=><li key={i}><button type="button" className="text-left underline underline-offset-4" onClick={()=>go(t.target)}>{t.blocking?'要確認':'補足'}：{t.label} — {t.message} →</button></li>)}</ul>:<p>下の「取込内容を確認する」で登録済みの出番と照合してください。</p>}
   </div>}
   <fieldset disabled={p.busy||p.frozen} className="min-w-0 space-y-5">
    <legend className="sr-only">原本の照合と訂正</legend>
    <div id="application-club" tabIndex={-1} className={panel('application-club')}>
     <h5 className="text-lg font-bold">団体と登録状況</h5>
     <label className="block">団体名<input className={field} maxLength={100} value={app.club} onChange={e=>p.onClub(e.target.value)}/><span className="text-sm">原本 {source.clubOrigin.sheet}!{source.clubOrigin.cell}：{source.club||'空欄'}</span></label>
     <p className="mt-3 text-lg font-bold">{p.clubSummary?.label??'既存登録の確認待ちです'}</p><p>{p.clubSummary?.detail??'読み込み後に団体・人馬の登録状況を確認します。確認できない場合は再確認してください。'}</p>
     <button type="button" className={button+' mt-3'} onClick={p.onLoadRoster}>既存登録を再確認</button>
     {p.clubSummary&&p.clubSummary.entries.length>0&&<details className="mt-3"><summary className="cursor-pointer font-semibold">この団体の登録済み出番を見る（{p.clubSummary.entries.length}件）</summary><ul className="mt-3 space-y-2">{p.clubSummary.entries.map(e=><li key={e.id} className="rounded border p-2">{e.label} ／ {e.status}</li>)}</ul></details>}
     {p.clubSummary?.state==='registered'&&<div className="mt-4 space-y-3 rounded-lg bg-blue-50 p-3"><p className="font-bold">今回の作業を選んでください</p><label className="flex gap-3"><input type="radio" name="application-intent" checked={p.intent==='addition'} onChange={()=>p.onIntent?.('addition')}/>初回のExcel取込・追加分の登録（登録済みの出番は残す）</label><label className="flex gap-3"><input type="radio" name="application-intent" checked={p.intent==='change'} onChange={()=>p.onIntent?.('change')}/>登録済みの内容を変更・取消する</label><p>追加では、登録済みと同じ出番を除いて未登録分だけ取り込みます。</p><p>変更・取消では、上の既存出番を確認して変更・棄権の手続きへ進みます。Excelから消えた行は自動で取り消しません。</p>{p.onChanges&&<button type="button" className={button} onClick={p.onChanges}>登録済みの変更・取消へ</button>}</div>}
     {notices('application-club')}
    </div>
    <details id="application-reference" tabIndex={-1} className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">資料番号（自動発行済み・通常は入力不要）</summary><p className="my-2">同じファイルには同じ番号を使います。追加・訂正版は別番号になり、既存の出番と照合します。</p><label>資料番号<input className={field} maxLength={100} value={p.reference} onChange={e=>p.onReference(e.target.value)}/></label></details>
    <section aria-label="人馬名簿：原本と読取・訂正値" className="space-y-4"><h5 className="text-xl font-bold">選手・馬の確認</h5><p>候補は所属・日馬連番号も確認して選びます。名前だけで同一人馬として統合しません。</p>
     {app.people.map(person=>{
      const old=source.people.find(x=>x.key===person.key)!,candidates=p.candidates[person.key]??[],choice=p.choices[person.key]??'',selected=candidates.find(c=>c.id===choice),target=applicationPersonTarget(person.key)
      return <div key={person.key} id={target} tabIndex={-1} className={panel(target)}>
       <h6 className="text-xl font-bold">{person.kind==='rider'?'選手':'馬'}：{person.name||'名前未入力'}</h6>
       {notices(target)}
       <div className="mt-3 rounded-lg bg-blue-50 p-3"><label className="block font-bold">対応する人馬<select className={field} value={choice} disabled={!p.rosterLoaded} onChange={e=>p.onChoice(person.key,e.target.value)}><option value="">確認して選択してください</option><option value="new">{p.frozen?'確定時の選択：新規登録':'新しい人馬として登録'}</option>{choice&&choice!=='new'&&!selected&&<option value={choice}>保存済みの対応（再確認が必要）</option>}{candidates.map(c=><option key={c.id} value={c.id}>登録済み：{c.name} ／ {c.clubs.join('、')||'所属なし'} ／ 日馬連 {c.jef||'空欄'}</option>)}</select></label>
        {p.frozen?<p>確定時の対応を保持しています。</p>:!p.rosterLoaded?<p>既存登録の確認待ちです。</p>:candidates.length===0?<p>一致候補なし。別の表記で登録されていないか確認してください。</p>:candidates.map(c=><p key={c.id} className="mt-2">既存候補：{c.name} ／ {c.reason} ／ 所属 {c.clubs.join('、')||'なし'}</p>)}
        {selected&&<p className="mt-2">既存値：{selected.name} ／ 読み {selected.reading||'空欄'} ／ 日馬連 {selected.jef||'空欄'}。原本との差は自動で上書きしません。</p>}
       </div>
       <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(['name','reading','jef'] as const).map((key,i)=><label key={key}>{['名前・馬名','ふりがな','日馬連番号'][i]}<input aria-label={`${person.key} ${key}`} className={field} maxLength={100} value={person[key]} onChange={e=>p.onPerson(person.key,{[key]:e.target.value})}/></label>)}</div>
       <label className="mt-3 flex items-center gap-3"><input type="checkbox" className="size-5" checked={person.checked} onChange={e=>p.onPerson(person.key,{checked:e.target.checked})}/>日馬連番号を確認済み</label>
       {person.kind==='rider'&&<div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>騎乗者資格<select className={field} value={person.grade} onChange={e=>p.onPerson(person.key,{grade:e.target.value})}><option value="">未選択</option>{!['','A','B','C','未登録'].includes(person.grade)&&<option value={person.grade}>{person.grade}（要選択）</option>}{['A','B','C','未登録'].map(x=><option key={x}>{x}</option>)}</select></label>
        {(['sportsMember','instructorMember'] as const).map((key,i)=><label key={key}>{i===0?'乗馬協会':'指導者協会'}の会員区分<select className={field} value={person[key]} onChange={e=>p.onPerson(person.key,{[key]:e.target.value})}><option value="">未確認</option><option>会員</option><option>非会員</option></select></label>)}
        <label className="flex items-center gap-3"><input type="checkbox" className="size-5" checked={person.qualified} onChange={e=>p.onPerson(person.key,{qualified:e.target.checked})}/>地域乗馬指導者資格を確認済み</label>
       </div>}
       <details className="mt-3 text-sm"><summary className="cursor-pointer">Excel原本の値を見る</summary><p>{old.origin.sheet}!{old.origin.cell} ／ {old.name} ／ 読み：{old.reading||'空欄'} ／ 日馬連：{old.jef||'空欄'}{person.kind==='rider'?` ／ 資格：${old.grade||'未選択'}`:''}</p></details>
      </div>
     })}
    </section>
    <section id="application-entries" tabIndex={-1} aria-label="エントリー確認一覧" className="space-y-3"><h5 className="text-xl font-bold">エントリー確認一覧</h5>{app.entries.map((e,i)=>{const target=applicationEntryTarget(e.key);return <div key={e.key} id={target} tabIndex={-1} className={panel(target)}>
     <p className="font-bold">{i+1}件目 ／ {e.origin.sheet}!{e.origin.cell} ／ {yen(p.review?.entryPrices[i]??null)}</p>{notices(target)}
     <label className="mt-2 block">競技<select aria-label={`${e.key} 競技`} className={field} value={e.competition} onChange={v=>p.onEntry(e.key,{competition:v.target.value})}>{!p.competitions.some(c=>c.number===e.competition)&&<option value={e.competition}>要確認：{e.competition}</option>}{p.competitions.map(c=><option key={c.number} value={c.number}>{c.number}：{c.name}</option>)}</select></label>
     <div className="mt-3 grid gap-3 sm:grid-cols-2">{(['rider','horse'] as const).map(kind=><label key={kind}>{kind==='rider'?'選手':'馬'}<select aria-label={`${e.key} ${kind}`} className={field} value={e[kind]} onChange={v=>p.onEntry(e.key,{[kind]:v.target.value})}><option value="">未対応・選択してください</option>{app.people.filter(person=>person.kind===kind).map(person=><option key={person.key} value={person.key}>{person.name}</option>)}</select></label>)}</div>
     <label className="mt-3 flex items-center gap-3"><input type="checkbox" className="size-5" checked={e.op} onChange={v=>p.onEntry(e.key,{op:v.target.checked})}/>OP参加</label><p className="mt-2 text-sm">原本：{source.entries[i].rawRider} ／ {source.entries[i].rawHorse}</p>
    </div>})}</section>
    <section aria-label="原本請求と料金の照合" className="space-y-3"><h5 className="text-xl font-bold">原本請求と料金の照合</h5><p>今回のExcelの金額を確認します。既存分との重複は③で照合します。</p>{p.review?.amounts.map(row=><div key={row.key} id={`application-amount-${row.key}`} tabIndex={-1} className={panel(`application-amount-${row.key}`)}>
     <div className="grid items-end gap-3 sm:grid-cols-3"><div><strong>{row.label}</strong><p>Excel：{source.amounts[row.key]||'空欄'}円</p><p className="text-sm">{source.amountOrigins[row.key].sheet}!{source.amountOrigins[row.key].cell}</p></div><label>原本確認後の値<input aria-label={`${row.label} 原本確認後の値`} className={field} inputMode="numeric" value={app.amounts[row.key]} onChange={e=>p.onAmount(row.key,e.target.value)}/></label><p>計算：{yen(row.calculated)}<br/>{row.reason?'要確認':'一致 ✓'}</p></div>{notices(`application-amount-${row.key}`)}
    </div>)}</section>
    <div id="application-payment" tabIndex={-1} className={panel('application-payment')}><label className="block">別途確認した入金額（未入金と確認できた場合は0）<input aria-label="別途確認した入金額（確認した額を入力。未入金と確認できた場合は0）" className={field} inputMode="numeric" value={p.paid} onChange={e=>p.onPaid(e.target.value)}/></label><p className="mt-2">振込予定日から入金済みとは判断しません。この欄は確認記録です。精算の入金登録は別途行います。</p><label className="mt-3 flex items-center gap-3"><input className="size-5" type="checkbox" checked={p.accountChecked} onChange={e=>p.onAccountChecked(e.target.checked)}/>原本請求額と、別途確認した入金額を確認しました</label>{notices('application-payment')}</div>
   </fieldset>
   {!p.frozen&&<>
    <button type="button" className={primaryButton+' w-full'} disabled={p.busy||!!blocking.length||!p.review?.ready} onClick={p.onReview}>取込内容を確認する → ③へ</button>
    {!!blocking.length&&<p>確認が必要な箇所を直すと次へ進めます。<button type="button" className="font-bold underline" onClick={()=>go(blocking[0].target)}>最初の確認箇所へ</button></p>}
    <details className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">作業を中断・別の申込書へ</summary><div className="mt-3 flex flex-wrap gap-3"><button type="button" className={button} disabled={p.busy} onClick={p.onSave}>確認途中をこの端末に保存</button><button type="button" className={button} disabled={p.busy} onClick={p.onOpenSaved}>この端末の確認途中を開く</button><button type="button" className={button} disabled={p.busy} onClick={p.onDownload}>別の端末用に確認再開JSONを保存</button><button type="button" className={button} disabled={p.busy} onClick={p.onReset}>この端末に保存して別の申込書へ</button></div><p className="mt-3">入力は自動保存されません。中断するときは保存してください。別の端末で再開する場合だけ、再開JSONを使います。</p></details>
   </>}
  </>}
  {p.differences!==null&&<section aria-label="訂正版との比較" className="space-y-3 rounded-xl border-2 border-amber-500 p-4"><h4 className="text-xl font-bold">別のExcelとの比較：{p.revisionName}</h4><p>現在の入力を保持しています。追加・変更・取消候補を確認してください。比較だけでは登録を変更しません。</p>{p.differences.length===0?<p>読み取った登録対象項目に差分はありません。</p>:<div className="overflow-x-auto"><table className="w-full border-collapse"><thead><tr>{['種類・位置','現在の原本','比較したExcel'].map(x=><th className={cell} key={x}>{x}</th>)}</tr></thead><tbody>{p.differences.map((d,i)=><tr key={i}><td className={cell}>{d.kind}<p>{d.location}</p></td><td className={cell+' whitespace-pre-wrap break-all'}>{differenceText(d.before)}</td><td className={cell+' whitespace-pre-wrap break-all'}>{differenceText(d.after)}</td></tr>)}</tbody></table></div>}
   {!p.frozen&&p.onUseRevision&&<button type="button" className={button} disabled={p.busy} onClick={p.onUseRevision}>今の確認を端末に保存し、このExcelの追加分を確認する</button>}{p.frozen&&<p>確定済みの記録です。④から別の申込書へ進んだ後、追加のExcelを読み込んでください。</p>}{p.onChanges&&<button type="button" className={button} disabled={p.busy} onClick={p.onChanges}>登録済みの変更・取消へ</button>}
  </section>}
  {p.registration}
 </section>
}
