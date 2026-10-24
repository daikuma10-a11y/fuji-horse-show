'use client'

import {useState,type ReactNode} from 'react'

/** Keep each item on one summary row; expansion never replaces editable values. */
export function MasterApplicationReviewRow({target,label,cells,blocking,advisories,index,disabled,children}:{
 target:string;label:string;cells:ReactNode[];blocking:number;advisories:number;index:number;disabled:boolean;children:ReactNode
}){
 const [open,setOpen]=useState(false)
 const background=blocking?'bg-amber-50':index%2?'bg-slate-50':'bg-white'
 return <>
  <tr id={target} tabIndex={-1} data-review-row className={`${background} scroll-mt-16 focus:outline-2 focus:outline-blue-700`}>
   {cells.map((value,i)=>{const Cell=i===0?'th':'td';return <Cell key={i} scope={i===0?'row':undefined} className={`border border-slate-300 px-3 py-3 text-left align-top ${i===0?`sticky left-0 z-10 ${background} font-semibold`:''}`}>{value}</Cell>})}
   <td className="border border-slate-300 px-3 py-2 align-top">
    {blocking>0?<p className="mb-1 whitespace-nowrap font-bold text-amber-900">要確認 {blocking}件</p>:advisories>0?<p className="mb-1 whitespace-nowrap text-blue-900">補足 {advisories}件</p>:null}
    <button type="button" data-review-toggle aria-label={`${label}を確認・訂正`} aria-expanded={open} aria-controls={`${target}-details`} onClick={()=>setOpen(v=>!v)} className="min-h-11 whitespace-nowrap rounded-lg border border-blue-800 bg-white px-3 py-2 font-semibold text-blue-900">{open?'閉じる':'確認・訂正'}</button>
   </td>
  </tr>
  <tr id={`${target}-details`} hidden={!open}>
   <td colSpan={cells.length+1} className="border border-slate-300 bg-blue-50/40 p-4">
    <fieldset disabled={disabled} className="min-w-0"><legend className="sr-only">{label}の確認・訂正</legend>{children}</fieldset>
   </td>
  </tr>
 </>
}
