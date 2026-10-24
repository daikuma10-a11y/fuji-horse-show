'use client'

import type {ReactNode} from 'react'
import type {ApplicationTodo} from '@/lib/master/application-guide'

/** Inline controls stay mounted, including while validation and totals are recalculated. */
export function MasterApplicationReviewRow({target,cells,index,disabled}:{
 target:string;cells:{label:string;content:ReactNode}[];index:number;disabled:boolean
}){
 return <tr id={target} tabIndex={-1} data-review-row className={`${index%2?'bg-slate-50':'bg-white'} scroll-mt-16 focus:outline-2 focus:outline-blue-700 @max-[760px]:mb-3 @max-[760px]:grid @max-[760px]:grid-cols-2 @max-[760px]:border-2 @max-[760px]:border-slate-400`}>
  {cells.map(({label,content},i)=>{const Cell=i===0?'th':'td';return <Cell key={label} scope={i===0?'row':undefined} className="min-w-0 border border-slate-300 p-1.5 text-left align-top font-normal [overflow-wrap:anywhere]">
   <span className="mb-1 hidden text-xs font-bold @max-[760px]:block">{label}</span>
   <fieldset disabled={disabled} className="min-w-0 space-y-1"><legend className="sr-only">{label}</legend>{content}</fieldset>
  </Cell>})}
 </tr>
}

/** Only the affected control is colored; text and linked descriptions also identify the issue. */
export function MasterApplicationReviewField({id,notes,children}:{id:string;notes:ApplicationTodo[];children:ReactNode}){
 const blocking=notes.some(n=>n.blocking),status=blocking?'blocking':notes.length?'advisory':undefined
 return <div id={id} tabIndex={notes.length?-1:undefined} data-review-issue={status} className={`min-w-0 rounded p-1 ${blocking?'border-2 border-amber-600 bg-amber-100':notes.length?'border-2 border-sky-600 bg-sky-50':''}`}>
  {children}
  {notes.length>0&&<div id={`${id}-message`} className={`mt-1 text-xs leading-relaxed ${blocking?'text-amber-950':'text-sky-950'}`}><strong>{blocking?'要確認':'補足'}</strong>{notes.map((n,i)=><p key={i}>{n.message}</p>)}</div>}
 </div>
}
