'use client'

import {MasterApplicationReviewRow} from './application-review-row'
import {HORSE_DECLARATIONS} from '@/lib/master/application-credentials'

import type {Application,ApplicationPerson,ApplicationEntry,ApplicationDifference,IdentityCandidate} from '@/lib/master/application'
import {applicationPersonTarget,applicationEntryTarget,type ApplicationTodo,type ApplicationClubSummary} from '@/lib/master/application-guide'
import type {ReactNode} from 'react'

const field='mt-1 min-h-12 w-full rounded-lg border-2 border-slate-400 bg-white p-2 text-base text-slate-900'
const buttonBase='min-h-12 rounded-xl border-2 border-blue-800 px-4 py-3 text-base font-bold disabled:opacity-40'
const button=buttonBase+' bg-white text-blue-900'
const primaryButton=buttonBase+' bg-blue-800 text-white'
const cell='border border-slate-300 p-3 align-top'
const tableHead='sticky top-0 z-20 border border-slate-300 bg-slate-100 px-3 py-3 text-left font-bold'
const tableScroll='max-h-[65vh] overflow-auto rounded-lg border border-slate-300'
const yen=(v:number|null)=>v===null?'未確認':`${v.toLocaleString('ja-JP')}円`
function go(id:string){
 const el=document.getElementById(id)
 if(el instanceof HTMLDetailsElement)el.open=true
 const toggle=el?.querySelector<HTMLButtonElement>('button[data-review-toggle]')
 if(toggle?.getAttribute('aria-expanded')==='false')toggle.click()
 requestAnimationFrame(()=>{el?.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});el?.focus({preventScroll:true})})
}
function differenceText(text:string){
 try{const value=JSON.parse(text);if(typeof value==='string')return value
  if(value&&typeof value==='object'){
   if('competition' in value)return `第${value.competition}競技 ／ ${value.rawRider||'選手空欄'}（対応：${value.rider||'未選択'}） ／ ${value.rawHorse||'馬名空欄'}（対応：${value.horse||'未選択'}） ／ OP：${value.op?'あり':'なし'}`
   if('name' in value)return `${value.name} ／ 読み：${value.reading||'空欄'} ／ 日馬連：${value.jef||'空欄'}（${value.checked?'確認済み':'未確認'}）${value.kind==='rider'?` ／ 資格：${value.grade||'未選択'} ／ 乗馬協会：${value.sportsMember||'未確認'} ／ 指導者協会：${value.instructorMember||'未確認'} ／ 地域乗馬指導者資格：${value.qualified?'確認済み':'未確認'}`:` ／ グレード宣言：${value.horseGrade||'記載なし'}`}`
  }
 }catch{/* Non-JSON labels, including a missing source row, are already readable. */}
 return text
}
type AmountRow={key:keyof Application['amounts'];label:string;original:number|null;calculated:number|null;reason:string}
export type ApplicationReviewModel={amounts:AmountRow[];issues:string[];entryPrices:(number|null)[];entryFeeTotal:number|null;horseRegistration:{count:number;unit:number};ready:boolean}
export function MasterApplicationReview(p:{
 busy:boolean;message:string;error:string;fileName:string;eventName:string;formatDescription:string
 frozen?:boolean;registration?:ReactNode;stage?:number;todos?:ApplicationTodo[];clubSummary?:ApplicationClubSummary|null
 onReview?:()=>void;onChanges?:()=>void;onUseRevision?:()=>void
 intent?:'addition'|'';onIntent?:(value:'addition'|'')=>void
 original:Application|null;edited:Application|null;reference:string;paid:string;accountChecked:boolean
 review:ApplicationReviewModel|null;candidates:Record<string,IdentityCandidate[]>;choices:Record<string,string>;rosterLoaded:boolean
 qualificationNotes?:Record<string,string>
 differences:ApplicationDifference[]|null;revisionName:string
 onFiles:(files:FileList|null)=>void;onRead:()=>void;onRestoreFile:(file:File)=>void;onSave:()=>void;onOpenSaved:()=>void;onDownload:()=>void;onLoadRoster:()=>void;onReset:()=>void
 onReference:(s:string)=>void;onClub:(s:string)=>void;onPaid:(s:string)=>void;onAccountChecked:(v:boolean)=>void
 onPerson:(key:string,patch:Partial<ApplicationPerson>)=>void;onEntry:(key:string,patch:Partial<ApplicationEntry>)=>void
 onAmount:(key:keyof Application['amounts'],value:string)=>void;onChoice:(key:string,value:string)=>void
 competitions:{number:string;name:string}[]
}){
 const app=p.edited,source=p.original,stage=p.stage??(app?2:1),todos=p.todos??[],blocking=todos.filter(t=>t.blocking)
 const notesByTarget=new Map<string,ApplicationTodo[]>()
 for(const todo of todos){const list=notesByTarget.get(todo.target)??[];list.push(todo);notesByTarget.set(todo.target,list)}
 const notes=(target:string)=>notesByTarget.get(target)??[]
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
    {todos.length>0?<details className="mt-2"><summary className="cursor-pointer font-semibold">確認箇所の一覧を開く（{todos.length}件）</summary><ul className="mt-2 space-y-2">{todos.map((t,i)=><li key={i}><button type="button" className="text-left underline underline-offset-4" onClick={()=>go(t.target)}>{t.blocking?'要確認':'補足'}：{t.label} — {t.message} →</button></li>)}</ul></details>:<p>下の「取込内容を確認する」で登録済みの出番と照合してください。</p>}
   </div>}
   <fieldset disabled={p.busy||p.frozen} className="min-w-0 space-y-5">
    <legend className="sr-only">原本の照合と訂正</legend>
    <div id="application-club" tabIndex={-1} className={panel('application-club')}>
     <h5 className="text-lg font-bold">団体と登録状況</h5>
     <label className="block">団体名<input className={field} maxLength={100} value={app.club} onChange={e=>p.onClub(e.target.value)}/><span className="text-sm">原本 {source.clubOrigin.sheet}!{source.clubOrigin.cell}：{source.club||'空欄'}</span></label>
     <p className="mt-3 text-lg font-bold">{p.clubSummary?.label??'既存登録の確認待ちです'}</p><p>{p.clubSummary?.detail??'読み込み後に団体・人馬の登録状況を確認します。確認できない場合は再確認してください。'}</p>
     <button type="button" className={button+' mt-3'} onClick={p.onLoadRoster}>既存登録を再確認</button>
     {p.clubSummary&&p.clubSummary.entries.length>0&&<details className="mt-3"><summary className="cursor-pointer font-semibold">この団体の登録済み出番を見る（{p.clubSummary.entries.length}件）</summary><ul className="mt-3 space-y-2">{p.clubSummary.entries.map(e=><li key={e.id} className="rounded border p-2">{e.label} ／ {e.status}</li>)}</ul></details>}
     {p.clubSummary?.state==='registered'&&<div className="mt-4 space-y-3 rounded-lg bg-blue-50 p-3">
      <h6 className="font-bold">このExcelの取込方法</h6>
      <p>新規・追加の出番と、選手の所有資格級・馬のグレード宣言は、このまま②で確認して③で取り込みます。</p>
      <label className="flex items-start gap-3 font-bold"><input className="mt-1 size-5 shrink-0" type="checkbox" name="application-intent" checked={p.intent==='addition'} onChange={e=>p.onIntent?.(e.target.checked?'addition':'')}/>登録済みの出番を残して、このExcelを取り込む</label>
      <p>同じ出番は重複登録せず、未登録の出番だけ追加します。出番がすべて登録済みでも、資格級・グレード宣言を保存できます。</p>
      {p.intent==='addition'&&<p role="status" className="font-semibold text-emerald-800">取込方法を確認しました。②の残りの項目を確認して「取込内容を確認する → ③へ」を押してください。</p>}
      {p.onChanges&&<div className="space-y-2 border-t border-blue-200 pt-3"><p>登録済み出番の競技・選手・馬・OPの変更や取消は、専用画面で行います。Excelから消えた行は自動では取り消しません。</p><button type="button" className={button} onClick={p.onChanges}>登録済み出番の変更・取消画面を開く</button></div>}
     </div>}
     {notices('application-club')}
    </div>
    <details id="application-reference" tabIndex={-1} className="rounded-lg border p-3"><summary className="cursor-pointer font-semibold">資料番号（自動発行済み・通常は入力不要）</summary><p className="my-2">同じファイルには同じ番号を使います。追加・訂正版は別番号になり、既存の出番と照合します。</p><label>資料番号<input className={field} maxLength={100} value={p.reference} onChange={e=>p.onReference(e.target.value)}/></label></details>
   </fieldset>
    <section aria-label="人馬名簿：原本と読取・訂正値" className="space-y-4"><h5 className="text-xl font-bold">選手・馬の確認</h5><p>候補は所属・日馬連番号も確認して選びます。名前だけで同一人馬として統合しません。</p>
     <p className="text-sm">各行の「確認・訂正」で候補・原本を確認して直せます。黄色の行は要確認です。幅が足りない場合は表を横にスクロールできます。</p>
     {(['rider','horse'] as const).map(kind=>{const people=app.people.filter(p=>p.kind===kind),title=kind==='rider'?'選手一覧':'馬一覧',headers=kind==='rider'?['選手名','フリガナ','日馬連番号','所有資格級','乗馬協会','指導者協会','確認・訂正']:['馬名','フリガナ','日馬連番号','グレード宣言','確認・訂正'];return <section key={kind} aria-label={title} className="space-y-2">
      <h6 className="text-lg font-bold">{title}（{people.length}{kind==='rider'?'名':'頭'}）</h6>
      <div className={tableScroll} tabIndex={0} role="region" aria-label={`${title}の表・スクロール可能`}><table className={`w-full border-separate border-spacing-0 text-sm ${kind==='rider'?'min-w-[960px]':'min-w-[760px]'}`}>
       <caption className="sr-only">{title}：読み込んだ全{people.length}件</caption><thead><tr>{headers.map((header,i)=><th scope="col" key={header} className={tableHead+(i===0?' left-0 z-30 min-w-40':i===1?' min-w-40':'')}>{header}</th>)}</tr></thead><tbody>
     {people.map((person,index)=>{
      const old=source.people.find(x=>x.key===person.key)!,candidates=p.candidates[person.key]??[],choice=p.choices[person.key]??'',selected=candidates.find(c=>c.id===choice),target=applicationPersonTarget(person.key)
      const rowNotes=notes(target),count=rowNotes.filter(t=>t.blocking).length
      const values=[<><span className="mr-2 text-xs font-normal text-slate-500">{index+1}</span>{person.name||'名前未入力'}<span className="mt-1 block text-xs font-normal text-slate-600">{choice==='new'?'新規登録':choice?'既存の人馬を選択済み':'登録先未選択'}</span></>,person.reading||'未入力',<span className="whitespace-nowrap">{person.jef.trim()||'なし'}{person.jef.trim()&&<small className="mt-1 block">{person.checked?'番号確認済み':'番号未確認'}</small>}</span>,...(kind==='rider'?[person.grade||'未選択',person.sportsMember||'未確認',<>{person.instructorMember||'未確認'}<small className="mt-1 block">地域乗馬指導者資格：{person.qualified?'確認済み':'未確認'}</small></>]:[person.horseGrade||'記載なし・未確認'])]
      return <MasterApplicationReviewRow key={`${app.digest}:${person.key}`} target={target} label={`${kind==='rider'?'選手':'馬'} ${person.name||index+1}`} cells={values} blocking={count} advisories={rowNotes.length-count} index={index} disabled={p.busy||!!p.frozen}><div className="max-w-5xl">
       <h6 className="text-xl font-bold">{person.kind==='rider'?'選手':'馬'}：{person.name||'名前未入力'}</h6>
       {notices(target)}
       <div className="mt-3 rounded-lg bg-blue-50 p-3"><label className="block font-bold">対応する人馬<select className={field} value={choice} disabled={!p.rosterLoaded} onChange={e=>p.onChoice(person.key,e.target.value)}><option value="">確認して選択してください</option><option value="new">{p.frozen?'確定時の選択：新規登録':'新しい人馬として登録'}</option>{choice&&choice!=='new'&&!selected&&<option value={choice}>保存済みの対応（再確認が必要）</option>}{candidates.map(c=><option key={c.id} value={c.id}>登録済み：{c.name} ／ {c.clubs.join('、')||'所属なし'} ／ 日馬連 {c.jef.trim()||'なし'}</option>)}</select></label>
        {p.frozen?<p>確定時の対応を保持しています。</p>:!p.rosterLoaded?<p>既存登録の確認待ちです。</p>:candidates.length===0?<p>一致候補なし。別の表記で登録されていないか確認してください。</p>:candidates.map(c=><p key={c.id} className="mt-2">既存候補：{c.name} ／ {c.reason} ／ 所属 {c.clubs.join('、')||'なし'}</p>)}
        {selected&&<p className="mt-2">既存値：{selected.name} ／ 読み {selected.reading||'空欄'} ／ 日馬連 {selected.jef.trim()||'なし'}。候補を選ぶと番号を下の入力欄に反映します。</p>}
       </div>
       <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{(['name','reading','jef'] as const).map((key,i)=><label key={key}>{['名前・馬名','ふりがな','日馬連番号'][i]}<input aria-label={`${person.key} ${key}`} className={field} maxLength={100} placeholder={key==='jef'?'なし':undefined} value={person[key]} onChange={e=>p.onPerson(person.key,{[key]:e.target.value})}/></label>)}</div>
       {person.readingAutofill&&person.reading===person.readingAutofill&&<p className="mt-2 text-sm">馬名がカタカナ・ひらがなのため、馬名をフリガナに自動入力しました。</p>}
       <label className="mt-3 flex items-center gap-3"><input type="checkbox" className="size-5" disabled={!person.jef.trim()&&!person.checked} checked={person.checked} onChange={e=>p.onPerson(person.key,{checked:e.target.checked})}/>日馬連番号を確認済み</label><p className="mt-1 text-sm">{person.jef.trim()?'選手・馬と番号の対応を確認してからチェックしてください。候補を選ぶだけでは確認済みになりません。':'日馬連番号：なし。番号の確認チェックは不要です。'}</p>
       {person.kind==='rider'&&<div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label>騎乗者資格<select className={field} value={person.grade} onChange={e=>p.onPerson(person.key,{grade:e.target.value})}><option value="">未選択</option>{!['','A','B','C','未登録'].includes(person.grade)&&<option value={person.grade}>{person.grade}（要選択）</option>}{['A','B','C','未登録'].map(x=><option key={x}>{x}</option>)}</select></label>
        {person.gradeAutofill&&<p className="self-end text-sm">日馬連マスター（{person.gradeAutofill.importDate}取得）・会員番号{person.gradeAutofill.memberNo}から{person.gradeAutofill.grade}級を自動入力しました。{old.grade&&old.grade!==person.grade?`申込書の記載：${old.grade}。差を確認してください。`:''}</p>}
        {p.qualificationNotes?.[person.key]&&<p className="self-end text-sm">{p.qualificationNotes[person.key]}</p>}
        {(['sportsMember','instructorMember'] as const).map((key,i)=><label key={key}>{i===0?'乗馬協会':'指導者協会'}の会員区分<select className={field} value={person[key]} onChange={e=>p.onPerson(person.key,{[key]:e.target.value})}><option value="">未確認</option><option>会員</option><option>非会員</option></select></label>)}
        <label className="flex items-center gap-3"><input type="checkbox" className="size-5" checked={person.qualified} onChange={e=>p.onPerson(person.key,{qualified:e.target.checked})}/>地域乗馬指導者資格を確認済み</label>
       </div>}
       {person.kind==='horse'&&<label className="mt-3 block">グレード宣言<select aria-label={`${person.key} グレード宣言`} className={field} value={person.horseGrade??''} onChange={e=>p.onPerson(person.key,{horseGrade:e.target.value})}><option value="">記載なし・未確認</option>{person.horseGrade&&!HORSE_DECLARATIONS.includes(person.horseGrade as typeof HORSE_DECLARATIONS[number])&&<option value={person.horseGrade}>{person.horseGrade}（要確認）</option>}{HORSE_DECLARATIONS.map(value=><option key={value}>{value}</option>)}</select><span className="text-sm">申込書の宣言を確認してください。空欄では保存済みの宣言を消しません。</span></label>}
       <details className="mt-3 text-sm"><summary className="cursor-pointer">Excel原本の値を見る</summary><p>{old.origin.sheet}!{old.origin.cell} ／ {old.name} ／ 読み：{old.reading||'空欄'} ／ 日馬連：{old.jef||'空欄'}{person.kind==='rider'?` ／ 資格：${old.grade||'未選択'}`:` ／ グレード宣言：${old.horseGrade||'記載なし'}`}{old.credentialOrigin&&` ／ ${old.credentialOrigin.sheet}!${old.credentialOrigin.cell}：${old.credentialOrigin.value||'空欄'}`}</p></details>
      </div></MasterApplicationReviewRow>
     })}
      </tbody></table></div></section>})}
    </section>
    <section id="application-entries" tabIndex={-1} aria-label="エントリー確認一覧" className="space-y-3"><h5 className="text-xl font-bold">エントリー確認一覧（全{app.entries.length}件）</h5>
     <p>要確認：{app.entries.filter(e=>notes(applicationEntryTarget(e.key)).some(t=>t.blocking)).length}行。所属は今回の申込団体です。表は縦・横にスクロールできます。</p>
     <div className={tableScroll} tabIndex={0} role="region" aria-label="エントリー一覧の表・スクロール可能"><table className="w-full min-w-[980px] border-separate border-spacing-0 text-sm"><caption className="sr-only">エントリー確認一覧：原本の順に全{app.entries.length}件</caption><thead><tr>{['競技名','選手','馬名','所属（申込団体）','OP','料金','確認・訂正'].map((header,i)=><th key={header} scope="col" className={tableHead+(i===0?' left-0 z-30 min-w-60':i===1||i===2?' min-w-32':'')}>{header}</th>)}</tr></thead><tbody>
     {app.entries.map((e,i)=>{const target=applicationEntryTarget(e.key),rowNotes=notes(target),count=rowNotes.filter(t=>t.blocking).length;return <MasterApplicationReviewRow key={`${app.digest}:${e.key}`} target={target} label={`${i+1}件目のエントリー`} cells={[
      <><span className="mr-2 text-xs font-normal text-slate-500">{i+1}</span>{e.competition}：{p.competitions.find(c=>c.number===e.competition)?.name??'競技を確認してください'}</>,
      app.people.find(p=>p.key===e.rider)?.name||'選手未対応',app.people.find(p=>p.key===e.horse)?.name||'馬未対応',app.club||'団体名未入力',e.op?'OP':'—',<span className="whitespace-nowrap tabular-nums">{yen(p.review?.entryPrices[i]??null)}</span>
     ]} blocking={count} advisories={rowNotes.length-count} index={i} disabled={p.busy||!!p.frozen}><div className="max-w-5xl">
     <p className="font-bold">{i+1}件目 ／ {e.origin.sheet}!{e.origin.cell} ／ {yen(p.review?.entryPrices[i]??null)}</p>{notices(target)}
     <label className="mt-2 block">競技<select aria-label={`${e.key} 競技`} className={field} value={e.competition} onChange={v=>p.onEntry(e.key,{competition:v.target.value})}>{!p.competitions.some(c=>c.number===e.competition)&&<option value={e.competition}>要確認：{e.competition}</option>}{p.competitions.map(c=><option key={c.number} value={c.number}>{c.number}：{c.name}</option>)}</select></label>
     <div className="mt-3 grid gap-3 sm:grid-cols-2">{(['rider','horse'] as const).map(kind=><label key={kind}>{kind==='rider'?'選手':'馬'}<select aria-label={`${e.key} ${kind}`} className={field} value={e[kind]} onChange={v=>p.onEntry(e.key,{[kind]:v.target.value})}><option value="">未対応・選択してください</option>{app.people.filter(person=>person.kind===kind).map(person=><option key={person.key} value={person.key}>{person.name}</option>)}</select></label>)}</div>
     <label className="mt-3 flex items-center gap-3"><input type="checkbox" className="size-5" checked={e.op} onChange={v=>p.onEntry(e.key,{op:v.target.checked})}/>OP参加</label><p className="mt-2 text-sm">原本：{source.entries[i].rawRider} ／ {source.entries[i].rawHorse}</p>
    </div></MasterApplicationReviewRow>})}</tbody></table></div>
     <div aria-label="今回のExcelの料金合計" className="rounded-xl border-2 border-blue-800 bg-blue-50 p-4">
      <h6 className="text-lg font-bold">今回のExcelの料金合計</h6>
      <dl className="mt-3 grid gap-3 sm:grid-cols-3">
       <div><dt className="font-semibold">馬匹登録料</dt><dd>{p.review?`${p.review.horseRegistration.count}頭 × ${yen(p.review.horseRegistration.unit)}`:'未確認'}<strong className="mt-1 block text-xl tabular-nums">{yen(p.review?.amounts.find(a=>a.key==='horse')?.calculated??null)}</strong></dd></div>
       <div><dt className="font-semibold">エントリー合計（{app.entries.length}件）</dt><dd className="mt-1 text-xl font-bold tabular-nums">{yen(p.review?.entryFeeTotal??null)}</dd></div>
       <div className="border-t border-blue-200 pt-2 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0"><dt className="font-semibold">総額</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-blue-950">{yen(p.review?.amounts.find(a=>a.key==='total')?.calculated??null)}</dd></div>
      </dl><p className="mt-3 text-sm">入力内容からの計算額です。既存分との重複は③で照合します。計算できない料金がある場合は「未確認」と表示します。</p>
     </div>
    </section>
   <fieldset disabled={p.busy||p.frozen} className="min-w-0 space-y-5"><legend className="sr-only">原本請求・入金額の確認</legend>
    <section aria-label="原本請求と料金の照合" className="space-y-3"><h5 className="text-xl font-bold">原本請求と料金の照合</h5><p>上の計算額とExcel原本を比べ、違いがあれば確認・訂正してください。</p>
     <div className="overflow-x-auto rounded-lg border border-slate-300"><table className="w-full min-w-[760px] border-separate border-spacing-0 text-sm"><caption className="sr-only">原本と入力額・計算額の比較</caption><thead><tr>{['項目','Excel原本','原本確認後の値','計算額','確認結果'].map(label=><th scope="col" key={label} className={tableHead}>{label}</th>)}</tr></thead><tbody>{p.review?.amounts.map(row=><tr key={row.key} id={`application-amount-${row.key}`} tabIndex={-1} className={row.reason?'bg-amber-50':'bg-white'}>
      <th scope="row" className={cell}>{row.label}</th><td className={cell}>{source.amounts[row.key]?`${source.amounts[row.key]}円`:'空欄'}<details className="mt-1 text-xs"><summary>原本の位置</summary>{source.amountOrigins[row.key].sheet}!{source.amountOrigins[row.key].cell}</details></td><td className={cell}><input aria-label={`${row.label} 原本確認後の値`} className={field+' min-w-32'} inputMode="numeric" value={app.amounts[row.key]} onChange={e=>p.onAmount(row.key,e.target.value)}/></td><td className={cell+' whitespace-nowrap tabular-nums'}>{yen(row.calculated)}</td><td className={cell}>{row.reason?<><strong className="text-amber-900">要確認</strong><p>{row.reason}</p></>:'一致 ✓'}</td>
     </tr>)}</tbody></table></div>
    </section>
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
