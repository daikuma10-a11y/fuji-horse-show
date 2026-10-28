'use client'

import {useState} from 'react'
import {MasterApplicationReviewField} from './application-review-row'
import {applicationCountMessage,entryCountTarget,type ApplicationCountReview} from '@/lib/master/application-entry-counts'
import type {ApplicationPerson,ApplicationEntry} from '@/lib/master/application'
import type {ApplicationCountEntryInput} from '@/lib/master/application-additions'

const field='mt-1 min-h-11 w-full min-w-0 rounded border border-slate-500 bg-white p-2 text-base disabled:bg-slate-100'
type AddCountEntry=(key:string,input:ApplicationCountEntryInput)=>string|undefined
type Props={
 rows:ApplicationCountReview[];disabled:boolean;competitions?:{number:string;name:string}[]
 people?:ApplicationPerson[];entries?:ApplicationEntry[]
 onChange?:(key:string,value:string)=>void;onAddEntry?:AddCountEntry
 onEntry?:(key:string,input:Partial<ApplicationEntry>)=>void;onRemoveEntry?:(key:string)=>void
}

/** Selection is provisional until the operator presses Add; amounts/counts are never invented. */
export function ApplicationCountEntryAdder({row,people,disabled,onAdd}:{row:ApplicationCountReview;people:ApplicationPerson[];disabled:boolean;onAdd:AddCountEntry}){
 const [input,setInput]=useState<ApplicationCountEntryInput>({rider:'',horse:'',op:false})
 const [error,setError]=useState(''),[message,setMessage]=useState('')
 const change=(patch:Partial<ApplicationCountEntryInput>)=>{if(disabled)return;setInput(v=>({...v,...patch}));setError('');setMessage('')}
 return <fieldset disabled={disabled} className="min-w-0 space-y-3 rounded-lg border border-blue-300 bg-blue-50 p-3">
  <legend className="px-1 font-bold">人馬の書き忘れの場合</legend>
  <p className="text-sm">出場する選手と馬を選んで追加してください。この競技の人数と料金に反映します。</p>
  <div className="grid gap-3 sm:grid-cols-2">{(['rider','horse'] as const).map(kind=><label key={kind} className="min-w-0 text-sm font-semibold">{kind==='rider'?'選手':'馬名'}<select aria-label={`${row.key} 追加する${kind==='rider'?'選手':'馬'}`} className={field} value={input[kind]} onChange={e=>change({[kind]:e.target.value})}><option value="">選んでください</option>{people.filter(p=>p.kind===kind).map(p=><option key={p.key} value={p.key}>{p.name}</option>)}</select></label>)}</div>
  {row.buckets.some(b=>b.kind==='op')&&<label className="flex min-h-11 items-center gap-2"><input aria-label={`${row.key} 追加する出場者のOP参加`} type="checkbox" className="size-5" checked={input.op} onChange={e=>change({op:e.target.checked})}/>OP参加</label>}
  {error&&<p role="alert" className="font-semibold text-red-800">{error}</p>}
  {message&&<p role="status" className="font-semibold text-emerald-900">{message}</p>}
  <button type="button" className="min-h-12 rounded-lg bg-blue-800 px-4 py-2 font-bold text-white disabled:opacity-40" disabled={disabled||!input.rider||!input.horse} onClick={()=>{
   if(disabled)return
   const failure=onAdd(row.key,input)
   if(failure){setError(failure);setMessage('');return}
   setInput({rider:'',horse:'',op:false});setError('');setMessage('出場者を追加しました。人数と料金を再計算しました。')
  }}>この競技に出場者を追加</button>
 </fieldset>
}

/** Count corrections belong to this review; the workbook's saved cells remain unchanged. */
export function MasterApplicationCountReview({rows,disabled,competitions=[],people=[],entries=[],onChange,onAddEntry,onEntry,onRemoveEntry}:Props){
 const pending=rows.filter(row=>row.changed||row.buckets.some(b=>b.reason)),pendingKeys=new Set(pending.map(row=>row.key)),matched=rows.filter(row=>!pendingKeys.has(row.key)),entriesByKey=new Map(entries.map(e=>[e.key,e]))
 const render=(items:ApplicationCountReview[])=>items.map(row=>{
  const problem=row.buckets.some(b=>b.reason),target=entryCountTarget(row.key),name=competitions.find(c=>c.number===row.competition)?.name
  const rowEntries=row.entryKeys.flatMap(key=>{const entry=entriesByKey.get(key);return entry?[entry]:[]})
  const explanations=row.buckets.filter(b=>b.reason||b.value!==b.origin.value)
  return <fieldset key={row.key} id={target} tabIndex={-1} disabled={disabled} className={`min-w-0 scroll-mt-16 space-y-4 rounded-lg border-2 p-4 ${problem?'border-amber-600 bg-amber-50':'border-emerald-700 bg-emerald-50'}`}>
   <legend className="px-1 font-bold">第{row.competition}競技{name&&` ／ ${name}`}</legend>
   {row.scopeLabel&&<p className="text-sm">{row.scopeLabel}</p>}
   <div id={`${target}-explanation`} className="space-y-2 font-semibold" role="status">{explanations.map(b=><p key={b.key}>{b.label}：{applicationCountMessage(b)}</p>)}
    {!problem&&<p className="text-emerald-950">{row.changed?'訂正後の人数が一致しました。':'人数が一致しています。'}</p>}
   </div>
   <section className="space-y-2" aria-label="人数の入力ミスの訂正">
    <h6 className="font-bold">人数の入力ミスの場合</h6>
    <p className="text-sm">正しい人数に訂正してください。出場者がいない場合は0名です。</p>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{row.buckets.map(b=>{const id=`${entryCountTarget(b.key)}-value`;return <MasterApplicationReviewField key={b.key} id={id} notes={b.reason?[{label:b.label,message:b.actual===null?'選手の会員区分を確認してください。':'人数を訂正するか、下で書き忘れた人馬を追加してください。',target,blocking:true}]:[]}>
     <label className="block text-sm font-bold" htmlFor={`${id}-input`}>{b.label}・確認後の人数</label>
     <input id={`${id}-input`} aria-label={`第${row.competition}競技 ${b.label} 集計人数`} aria-invalid={!!b.reason||undefined} aria-describedby={`${target}-explanation`} className={field} inputMode="numeric" maxLength={100} disabled={!onChange} value={b.value} onChange={e=>{if(!disabled)onChange?.(b.key,e.target.value)}}/>
    </MasterApplicationReviewField>})}</div>
   </section>
   {!!rowEntries.length&&<section className="space-y-2" aria-label="この競技の出場者の訂正"><h6 className="font-bold">この競技の出場者（{rowEntries.length}名）</h6><div className="space-y-2">{rowEntries.map((entry,i)=><fieldset key={entry.key} disabled={disabled||!onEntry} className="min-w-0 rounded border border-slate-300 bg-white p-3">
    <legend className="px-1 text-sm font-semibold">{i+1}人目{entry.added?'（この画面で追加）':''}</legend>
    <div className="grid gap-3 sm:grid-cols-2">{(['rider','horse'] as const).map(kind=><label key={kind} className="min-w-0 text-sm font-semibold">{kind==='rider'?'選手':'馬名'}<select aria-label={`${row.key} ${entry.key} ${kind==='rider'?'選手':'馬'}`} className={field} value={entry[kind]} onChange={e=>{if(!disabled)onEntry?.(entry.key,{[kind]:e.target.value})}}><option value="">選んでください</option>{people.filter(p=>p.kind===kind).map(p=><option key={p.key} value={p.key}>{p.name}</option>)}</select></label>)}</div>
    {(entry.op||row.buckets.some(b=>b.kind==='op'))&&<label className="mt-2 flex min-h-11 items-center gap-2"><input aria-label={`${row.key} ${entry.key} OP参加`} type="checkbox" className="size-5" checked={entry.op} onChange={e=>{if(!disabled)onEntry?.(entry.key,{op:e.target.checked})}}/>OP参加</label>}
    {entry.added&&onRemoveEntry&&<button type="button" className="min-h-11 text-sm text-red-800 underline" onClick={()=>{if(!disabled)onRemoveEntry(entry.key)}}>追加した出場者を取り消す</button>}
   </fieldset>)}</div></section>}
   {onAddEntry&&<ApplicationCountEntryAdder row={row} people={people} disabled={disabled||entries.length>=5000} onAdd={onAddEntry}/>}
  </fieldset>
 })
 return <section id="application-entry-counts" aria-label="競技ごとの集計人数の照合" className="space-y-3 rounded-xl border-2 border-slate-300 p-4">
  <h5 className="text-xl font-bold">競技ごとの集計人数の照合</h5>
  <p>要確認：{rows.filter(row=>row.buckets.some(b=>b.reason)).length}競技欄。合計金額が同じでも、競技ごとの人数を確認します。</p>
  <p className="text-sm">人数の入力ミスと人馬の書き忘れを、この場で訂正できます。通常参加・OP・会員区分は分けて照合します。元のExcelは変更しません。</p>
  {render(pending)}
  {!!matched.length&&<details><summary className="cursor-pointer font-semibold">一致した競技欄を見る（{matched.length}件）</summary><div className="mt-3 space-y-3">{render(matched)}</div></details>}
 </section>
}
