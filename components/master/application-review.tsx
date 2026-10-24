'use client'

import {MasterApplicationReviewRow,MasterApplicationReviewField} from './application-review-row'
import {HORSE_DECLARATIONS} from '@/lib/master/application-credentials'

import type {Application,ApplicationPerson,ApplicationEntry,ApplicationDifference,IdentityCandidate} from '@/lib/master/application'
import {applicationPersonTarget,applicationEntryTarget,type ApplicationTodo,type ApplicationClubSummary,type ApplicationIssueField} from '@/lib/master/application-guide'
import {Fragment as ReactFragment,type ReactNode} from 'react'

const field='mt-1 min-h-12 w-full rounded-lg border-2 border-slate-400 bg-white p-2 text-base text-slate-900'
const buttonBase='min-h-12 rounded-xl border-2 border-blue-800 px-4 py-3 text-base font-bold disabled:opacity-40'
const button=buttonBase+' bg-white text-blue-900'
const primaryButton=buttonBase+' bg-blue-800 text-white'
const cell='min-w-0 border border-slate-300 p-1.5 align-top [overflow-wrap:anywhere]'
const inlineField='min-h-10 w-full min-w-0 max-w-full rounded border border-slate-500 bg-white px-1.5 py-2 text-sm text-slate-950 focus:outline-2 focus:outline-blue-700 disabled:bg-slate-100'
const inlineTable='w-full table-fixed border-separate border-spacing-0 text-sm @max-[760px]:block'
const tableHead='sticky top-0 z-20 border border-slate-300 bg-slate-100 px-2 py-2 text-left font-bold [overflow-wrap:anywhere]'
const tableScroll='@container w-full min-w-0 max-w-full max-h-[70vh] overflow-y-auto rounded-lg border border-slate-300'
const yen=(v:number|null)=>v===null?'未確認':`${v.toLocaleString('ja-JP')}円`
function go(id:string){
 const el=document.getElementById(id)
 if(el instanceof HTMLDetailsElement)el.open=true
 const issue=el?.querySelector<HTMLElement>('[data-review-issue=blocking]')??el?.querySelector<HTMLElement>('[data-review-issue]')
 const focus=issue?.querySelector<HTMLElement>('input:not(:disabled),select:not(:disabled),textarea:not(:disabled)')??issue??el
 requestAnimationFrame(()=>{focus?.scrollIntoView({block:'center',inline:'nearest',behavior:'smooth'});focus?.focus({preventScroll:true})})
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
 const fieldNotes=(target:string,key:ApplicationIssueField)=>notes(target).filter(n=>n.fields?.includes(key)||(!n.fields?.length&&(key==='name'||key==='competition')))
 const attributes=(target:string,key:ApplicationIssueField)=>{const ns=fieldNotes(target,key);return {id:`${target}-${key}-input`,'aria-invalid':ns.some(n=>n.blocking)||undefined,'aria-describedby':ns.length?`${target}-${key}-message`:undefined}}
 const inline=(target:string,key:ApplicationIssueField,content:ReactNode)=><MasterApplicationReviewField id={`${target}-${key}`} notes={fieldNotes(target,key)}>{content}</MasterApplicationReviewField>
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
    <section aria-label="人馬名簿：原本と読取・訂正値" className="min-w-0 space-y-4"><h5 className="text-xl font-bold">選手・馬の確認</h5><p>表の入力欄でそのまま訂正できます。候補は所属・日馬連番号も確認して選びます。</p>
     <p className="flex flex-wrap gap-2 text-sm"><span className="rounded border-2 border-amber-600 bg-amber-100 px-2 py-1">黄色：取り込み前に確認・訂正が必要</span><span className="rounded border-2 border-sky-600 bg-sky-50 px-2 py-1">水色：補足・任意の確認</span></p>
     {(['rider','horse'] as const).map(kind=>{const people=app.people.filter(person=>person.kind===kind),title=kind==='rider'?'選手一覧':'馬一覧',headers=kind==='rider'?['選手名・登録先','フリガナ','日馬連番号','所有資格級','乗馬協会','指導者協会']:['馬名・登録先','フリガナ','日馬連番号','グレード宣言'];return <section key={kind} aria-label={title} className="min-w-0 space-y-2">
      <h6 className="text-lg font-bold">{title}（{people.length}{kind==='rider'?'名':'頭'}）</h6>
      <div className={tableScroll} tabIndex={0} role="region" aria-label={`${title}の表`}><table className={inlineTable}>
       <caption className="sr-only">{title}：読み込んだ全{people.length}件。表内で直接訂正できます。</caption>
       <colgroup className="@max-[760px]:hidden">{(kind==='rider'?[24,17,16,14,13,16]:[32,23,20,25]).map((width,i)=><col key={i} style={{width:`${width}%`}}/>)}</colgroup>
       <thead className="@max-[760px]:sr-only"><tr>{headers.map(header=><th scope="col" key={header} className={tableHead}>{header}</th>)}</tr></thead><tbody className="@max-[760px]:block">
     {people.map((person,index)=>{
      const old=source.people.find(x=>x.key===person.key)!,candidates=p.candidates[person.key]??[],choice=p.choices[person.key]??'',selected=candidates.find(c=>c.id===choice),target=applicationPersonTarget(person.key)
      const textInput=(key:'name'|'reading')=>inline(target,key,<textarea {...attributes(target,key)} aria-label={`${person.key} ${key}`} className={inlineField+' resize-y'} rows={2} maxLength={100} value={person[key]} onChange={e=>p.onPerson(person.key,{[key]:e.target.value.replace(/[\r\n]/g,'')})}/>)
      const values:ReactNode[]=[<>
       <span className="text-xs text-slate-600">{index+1}</span>{textInput('name')}
       {inline(target,'choice',<><label className="block text-xs font-semibold" htmlFor={`${target}-choice-input`}>登録先</label><select {...attributes(target,'choice')} aria-label={`${person.key} 対応する人馬`} className={inlineField} title={selected?`${selected.name} ／ ${selected.clubs.join('、')||'所属なし'} ／ 日馬連 ${selected.jef.trim()||'なし'}`:choice==='new'?'新しい人馬として登録':'確認して選択してください'} value={choice} disabled={!p.rosterLoaded} onChange={e=>p.onChoice(person.key,e.target.value)}><option value="">確認して選択</option><option value="new">{p.frozen?'確定時：新規登録':'新しい人馬として登録'}</option>{choice&&choice!=='new'&&!selected&&<option value={choice}>保存済みの対応（再確認が必要）</option>}{candidates.map(c=><option key={c.id} value={c.id}>登録済み：{c.name} ／ {c.clubs.join('、')||'所属なし'} ／ 日馬連 {c.jef.trim()||'なし'}</option>)}</select>
        {selected&&<p className="mt-1 text-xs">登録済み：{selected.name} ／ {selected.clubs.join('、')||'所属なし'} ／ 日馬連 {selected.jef.trim()||'なし'}</p>}
        {!p.rosterLoaded&&<p className="text-xs">既存登録の確認待ちです。</p>}
       </>)}
       <details className="text-xs"><summary className="cursor-pointer">Excel原本・候補の情報</summary><p>{old.origin.sheet}!{old.origin.cell} ／ {old.name} ／ 読み：{old.reading||'空欄'} ／ 日馬連：{old.jef||'空欄'}{person.kind==='rider'?` ／ 資格：${old.grade||'未選択'}`:` ／ グレード宣言：${old.horseGrade||'記載なし'}`}{old.credentialOrigin&&` ／ ${old.credentialOrigin.sheet}!${old.credentialOrigin.cell}：${old.credentialOrigin.value||'空欄'}`}</p>
        {p.frozen?<p>確定時の対応を保持しています。</p>:p.rosterLoaded&&candidates.length===0?<p>一致候補なし。別の表記で登録されていないか確認してください。</p>:candidates.map(c=><p key={c.id}>既存候補：{c.name} ／ {c.reason} ／ 所属 {c.clubs.join('、')||'なし'}</p>)}
        {selected&&<p>既存の読み：{selected.reading||'空欄'}。候補の番号を入力欄に反映します。名前だけで統合しません。</p>}
       </details>
      </>,<>{textInput('reading')}{person.readingAutofill&&person.reading===person.readingAutofill&&<p className="text-xs text-slate-600">カナの馬名から自動入力</p>}</>,<>
       {inline(target,'jef',<input {...attributes(target,'jef')} aria-label={`${person.key} jef`} className={inlineField} maxLength={100} placeholder="なし" value={person.jef} onChange={e=>p.onPerson(person.key,{jef:e.target.value})}/>)}
       {inline(target,'checked',<label className="flex items-start gap-1 text-xs"><input {...attributes(target,'checked')} aria-label={`${person.key} 日馬連番号を確認済み`} type="checkbox" className="mt-0.5 size-5 shrink-0" disabled={!person.jef.trim()&&!person.checked} checked={person.checked} onChange={e=>p.onPerson(person.key,{checked:e.target.checked})}/>番号を確認済み</label>)}
       <p className="text-xs text-slate-600">{person.jef.trim()?'本人・馬と番号の対応を確認':'日馬連番号：なし。チェック不要'}</p>
      </>]
      if(kind==='rider')values.push(<>
       {inline(target,'grade',<select {...attributes(target,'grade')} aria-label={`${person.key} 騎乗者資格`} className={inlineField} value={person.grade} onChange={e=>p.onPerson(person.key,{grade:e.target.value})}><option value="">未選択</option>{!['','A','B','C','未登録'].includes(person.grade)&&<option value={person.grade}>{person.grade}（要選択）</option>}{['A','B','C','未登録'].map(x=><option key={x}>{x}</option>)}</select>)}
       {person.gradeAutofill&&<p className="text-xs">日馬連から自動入力（{person.gradeAutofill.importDate}取得）{old.grade&&old.grade!==person.grade?`。申込書：${old.grade}`:''}</p>}
       {p.qualificationNotes?.[person.key]&&<p className="text-xs">{p.qualificationNotes[person.key]}</p>}
      </>,...(['sportsMember','instructorMember'] as const).map((key,i)=><ReactFragment key={key}>
       {inline(target,key,<select {...attributes(target,key)} aria-label={`${person.key} ${i===0?'乗馬協会':'指導者協会'}の会員区分`} className={inlineField} value={person[key]} onChange={e=>p.onPerson(person.key,{[key]:e.target.value})}><option value="">未確認</option>{person[key]&&!['会員','非会員'].includes(person[key])&&<option value={person[key]}>{person[key]}（要選択）</option>}<option>会員</option><option>非会員</option></select>)}
       {key==='instructorMember'&&inline(target,'qualified',<label className="flex items-start gap-1 text-xs"><input {...attributes(target,'qualified')} aria-label={`${person.key} 地域乗馬指導者資格を確認済み`} type="checkbox" className="mt-0.5 size-5 shrink-0" checked={person.qualified} onChange={e=>p.onPerson(person.key,{qualified:e.target.checked})}/>地域乗馬指導者資格を確認済み</label>)}
      </ReactFragment>))
      else values.push(<>{inline(target,'horseGrade',<select {...attributes(target,'horseGrade')} aria-label={`${person.key} グレード宣言`} className={inlineField} value={person.horseGrade??''} onChange={e=>p.onPerson(person.key,{horseGrade:e.target.value})}><option value="">記載なし・未確認</option>{person.horseGrade&&!HORSE_DECLARATIONS.includes(person.horseGrade as typeof HORSE_DECLARATIONS[number])&&<option value={person.horseGrade}>{person.horseGrade}（要確認）</option>}{HORSE_DECLARATIONS.map(value=><option key={value}>{value}</option>)}</select>)}<p className="text-xs text-slate-600">申込書の宣言を確認。空欄では保存済みの宣言を消しません。</p></>)
      return <MasterApplicationReviewRow key={`${app.digest}:${person.key}`} target={target} cells={values.map((content,i)=>({label:headers[i],content}))} index={index} disabled={p.busy||!!p.frozen}/>
     })}
      </tbody></table></div></section>})}
    </section>
    <section id="application-entries" tabIndex={-1} aria-label="エントリー確認一覧" className="min-w-0 space-y-3"><h5 className="text-xl font-bold">エントリー確認一覧（全{app.entries.length}件）</h5>
     <p>要確認：{app.entries.filter(e=>notes(applicationEntryTarget(e.key)).some(t=>t.blocking)).length}行。競技・選手・馬・OPを表の中で訂正できます。所属は今回の申込団体です。</p>
     <div className={tableScroll} tabIndex={0} role="region" aria-label="エントリー一覧の表"><table className={inlineTable}><caption className="sr-only">エントリー確認一覧：原本の順に全{app.entries.length}件</caption>
      <colgroup className="@max-[760px]:hidden">{[29,19,19,14,7,12].map((width,i)=><col key={i} style={{width:`${width}%`}}/>)}</colgroup>
      <thead className="@max-[760px]:sr-only"><tr>{['競技名','選手','馬名','所属（申込団体）','OP','料金'].map(header=><th key={header} scope="col" className={tableHead}>{header}</th>)}</tr></thead><tbody className="@max-[760px]:block">
     {app.entries.map((e,i)=>{const target=applicationEntryTarget(e.key),competitionLabel=`${e.competition}：${p.competitions.find(c=>c.number===e.competition)?.name??'競技を確認してください'}`;return <MasterApplicationReviewRow key={`${app.digest}:${e.key}`} target={target} cells={[
      {label:'競技名',content:<><span className="text-xs text-slate-600">{i+1}</span>{inline(target,'competition',<><select {...attributes(target,'competition')} aria-label={`${e.key} 競技`} title={competitionLabel} className={inlineField} value={e.competition} onChange={v=>p.onEntry(e.key,{competition:v.target.value})}>{!p.competitions.some(c=>c.number===e.competition)&&<option value={e.competition}>要確認：{e.competition}</option>}{p.competitions.map(c=><option key={c.number} value={c.number}>{c.number}：{c.name}</option>)}</select><p className="mt-1 text-xs">{competitionLabel}</p></>)}<details className="text-xs"><summary className="cursor-pointer">Excel原本</summary><p>{e.origin.sheet}!{e.origin.cell} ／ {source.entries[i].rawRider} ／ {source.entries[i].rawHorse}</p></details></>},
      ...(['rider','horse'] as const).map(kind=>{const person=app.people.find(p=>p.key===e[kind]),label=kind==='rider'?'選手':'馬名';return {label,content:inline(target,kind,<><select {...attributes(target,kind)} aria-label={`${e.key} ${kind}`} title={person?.name??'未対応'} className={inlineField} value={e[kind]} onChange={v=>p.onEntry(e.key,{[kind]:v.target.value})}><option value="">未対応・選択</option>{app.people.filter(p=>p.kind===kind).map(person=><option key={person.key} value={person.key}>{person.name}</option>)}</select><p className="mt-1 text-xs">{person?.name||'未対応'}</p>{person&&fieldNotes(target,kind).length>0&&<button type="button" className="mt-1 text-xs text-blue-900 underline" onClick={()=>go(applicationPersonTarget(person.key))}>{label}の確認箇所へ</button>}</>)}}),
      {label:'所属（申込団体）',content:<p>{app.club||'団体名未入力'}</p>},
      {label:'OP',content:inline(target,'op',<label className="flex flex-wrap items-center gap-1"><input {...attributes(target,'op')} aria-label={`${e.key} OP参加`} type="checkbox" className="size-5 shrink-0" checked={e.op} onChange={v=>p.onEntry(e.key,{op:v.target.checked})}/><span className="text-xs">OP</span></label>)},
      {label:'料金',content:inline(target,'fee',<span className="font-semibold tabular-nums">{yen(p.review?.entryPrices[i]??null)}</span>)}
     ]} index={i} disabled={p.busy||!!p.frozen}/>})}</tbody></table></div>
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
     <div className={tableScroll} role="region" aria-label="原本請求と料金の比較表" tabIndex={0}><table className={inlineTable}><caption className="sr-only">原本と入力額・計算額の比較</caption><colgroup className="@max-[760px]:hidden">{[15,18,20,17,30].map((width,i)=><col key={i} style={{width:`${width}%`}}/>)}</colgroup><thead className="@max-[760px]:sr-only"><tr>{['項目','Excel原本','原本確認後の値','計算額','確認結果'].map(label=><th scope="col" key={label} className={tableHead}>{label}</th>)}</tr></thead><tbody className="@max-[760px]:block">{p.review?.amounts.map((row,i)=>{const target=`application-amount-${row.key}`;return <MasterApplicationReviewRow key={row.key} target={target} index={i} disabled={p.busy||!!p.frozen} cells={[
      {label:'項目',content:<strong>{row.label}</strong>},
      {label:'Excel原本',content:<>{source.amounts[row.key]?`${source.amounts[row.key]}円`:'空欄'}<details className="mt-1 text-xs"><summary>原本の位置</summary>{source.amountOrigins[row.key].sheet}!{source.amountOrigins[row.key].cell}</details></>},
      {label:'原本確認後の値',content:<MasterApplicationReviewField id={`${target}-value`} notes={row.reason?[{label:row.label,message:row.reason,target,blocking:true}]:[]}><input aria-label={`${row.label} 原本確認後の値`} aria-invalid={!!row.reason||undefined} aria-describedby={row.reason?`${target}-value-message`:undefined} className={inlineField} inputMode="numeric" value={app.amounts[row.key]} onChange={e=>p.onAmount(row.key,e.target.value)}/></MasterApplicationReviewField>},
      {label:'計算額',content:<span className="tabular-nums">{yen(row.calculated)}</span>},
      {label:'確認結果',content:row.reason?<strong className="text-amber-900">要確認</strong>:'一致 ✓'}
     ]}/>})}</tbody></table></div>
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
