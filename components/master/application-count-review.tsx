'use client'

import {MasterApplicationReviewField} from './application-review-row'
import {entryCountTarget,type ApplicationCountReview} from '@/lib/master/application-entry-counts'

/** Count corrections belong to this review; the workbook's saved cells remain visible. */
export function MasterApplicationCountReview({rows,disabled,onChange}:{rows:ApplicationCountReview[];disabled:boolean;onChange?:(key:string,value:string)=>void}){
 const pending=rows.filter(row=>row.changed||row.buckets.some(b=>b.reason)),matched=rows.filter(row=>!pending.includes(row))
 const render=(items:ApplicationCountReview[])=>items.map(row=><fieldset key={row.key} id={entryCountTarget(row.key)} tabIndex={-1} disabled={disabled||!onChange} className={`min-w-0 scroll-mt-16 space-y-2 rounded-lg border-2 p-3 ${row.buckets.some(b=>b.reason)?'border-amber-600 bg-amber-50':'border-emerald-700 bg-emerald-50'}`}>
  <legend className="px-1 font-bold">第{row.competition}競技 ／ {row.key}</legend>
  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{row.buckets.map(b=>{const id=`${entryCountTarget(b.key)}-value`;return <MasterApplicationReviewField key={b.key} id={id} notes={b.reason?[{label:b.label,message:b.reason,target:entryCountTarget(row.key),blocking:true}]:[]}>
   <label className="block text-sm font-bold" htmlFor={`${id}-input`}>{b.label}・確認後の集計人数</label>
   <input id={`${id}-input`} aria-label={`${b.origin.sheet}!${b.origin.cell} 第${row.competition}競技 ${b.label} 集計人数`} aria-invalid={!!b.reason||undefined} aria-describedby={b.reason?`${id}-message`:undefined} className="mt-1 min-h-10 w-full min-w-0 rounded border border-slate-500 bg-white p-2 text-base" inputMode="numeric" maxLength={100} value={b.value} onChange={e=>onChange?.(b.key,e.target.value)}/>
   <p className="mt-1 text-sm">Excel原本：{b.origin.value.trim()||'空欄（0名）'} ／ 出場者：{b.actual===null?'区分未確認':`${b.actual}名`}</p>
   <p className="text-xs">{b.origin.sheet}!{b.origin.cell}{b.origin.formula&&` ／ 数式：${b.origin.formula}`}</p>
  </MasterApplicationReviewField>})}</div>
  {row.names.length?<details className="text-sm"><summary className="cursor-pointer">この競技・申込欄の出場者（{row.names.length}名）</summary><ul>{row.names.map((name,i)=><li key={row.entryKeys[i]}>{name}</li>)}</ul></details>:<p className="text-sm">この申込欄には出場者がいません。</p>}
  <p className={`text-sm font-bold ${row.buckets.some(b=>b.reason)?'text-amber-950':'text-emerald-950'}`}>{row.buckets.some(b=>b.reason)?'要確認：出場者の記載と集計欄を確認してください。':row.changed?'訂正後の人数が一致しました。':'人数が一致しています。'}</p>
 </fieldset>)
 return <section id="application-entry-counts" aria-label="競技ごとの集計人数の照合" className="space-y-3 rounded-xl border-2 border-slate-300 p-4">
  <h5 className="text-xl font-bold">競技ごとの集計人数の照合</h5>
  <p>合計金額が同じでも、競技・申込シート・通常参加／OP・会員区分ごとに人数を照合します。要確認：{rows.filter(row=>row.buckets.some(b=>b.reason)).length}競技欄。</p>
  <p className="text-sm">黄色い欄は、原本を確かめてこの場で集計人数を訂正できます。出場者の入力漏れは上の「出番を追加」で補ってください。人数だけでは出番を作成しません。Excel原本の数値は保持します。</p>
  {render(pending)}
  {!!matched.length&&<details><summary className="cursor-pointer font-semibold">一致した競技欄を見る（{matched.length}件）</summary><div className="mt-3 space-y-3">{render(matched)}</div></details>}
 </section>
}
