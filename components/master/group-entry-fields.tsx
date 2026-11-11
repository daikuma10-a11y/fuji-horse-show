'use client'
import type {ReactNode} from 'react'

type Option={id:string;label:string}
export type EntryFields={competition:string;rider:string;horse:string;op:boolean;membership:''|'member'|'nonmember';instructor:boolean}
const field='mt-1 block w-full rounded-lg border-2 bg-white p-2'
export function GroupEntryFields({value,change,competitions,riders,horses,allowOp,membership,instructor,children}:{
  value:EntryFields;change:(value:EntryFields)=>void;competitions:Option[];riders:Option[];horses:Option[]
  allowOp:boolean;membership:boolean;instructor:boolean;children?:ReactNode
}){
  function picker(key:'competition'|'rider'|'horse',label:string,options:Option[]){
    return <label className="block">{label}<select aria-label={label} className={field} value={value[key]} onChange={e=>{
      change(key==='competition'?{...value,competition:e.target.value,op:false,membership:'',instructor:false}:{...value,[key]:e.target.value})
    }}>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
  }
  return <div className="grid gap-3 sm:grid-cols-2">
    {picker('competition','競技',competitions)}{picker('rider','選手',riders)}{picker('horse','馬',horses)}
    <label>出場区分<select aria-label="出場区分" className={field} value={value.op?'op':'regular'} onChange={e=>change({...value,op:e.target.value==='op'})}>
      <option value="regular">通常参加</option>{allowOp&&<option value="op">OP参加</option>}
    </select></label>
    {membership&&<label>会員区分<select aria-label="会員区分" className={field} value={value.membership} onChange={e=>change({...value,membership:e.target.value as EntryFields['membership']})}>
      <option value="">選択してください</option><option value="member">会員</option><option value="nonmember">非会員</option>
    </select></label>}
    {instructor&&<label><input type="checkbox" checked={value.instructor} onChange={e=>change({...value,instructor:e.target.checked})}/> 地域乗馬指導者資格を確認しました</label>}
    {children}
  </div>
}
