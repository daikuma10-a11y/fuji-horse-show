"use client"

import {masterTimetableChoices,type MasterTimetableTimeKind} from '@/lib/master/timetable'

export function MasterTimetableTimeField({kind,label,value,disabled,onChange}:{kind:MasterTimetableTimeKind;label:string;value:string;disabled:boolean;onChange:(value:string)=>void}){
 const choices:readonly string[]=masterTimetableChoices[kind]
 const mode=choices.includes(value)?value:'time'
 const field='ml-3 min-h-14 max-w-full rounded-xl border-2 bg-white p-3 text-slate-950'
 return <div className="space-y-2">
  <label className="block text-xl">{label}の指定方法<select className={field} disabled={disabled} value={mode} onChange={e=>onChange(e.target.value==='time'?'':e.target.value)}><option value="time">時刻を指定（空欄は未定）</option>{choices.map(choice=><option key={choice} value={choice}>{choice}</option>)}</select></label>
  {mode==='time'&&<label className="block text-xl">{label}<input type="time" className={field} value={value} disabled={disabled} onChange={e=>onChange(e.target.value)}/></label>}
 </div>
}
