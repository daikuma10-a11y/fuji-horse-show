'use client'
import {useState,type ReactNode} from 'react'
import type {RegistrationOverviewPerson} from '@/lib/master/registration-overview'

export const groupActionClass='min-h-11 rounded-lg border border-blue-800 bg-white px-3 py-2 font-bold text-blue-900 disabled:opacity-50'
export type GroupEdit =
  | {kind:'payment'|'stable'|'source'}
  | {kind:'identity';type:'rider'|'horse';id:string}
  | {kind:'cancelHorse'|'substitute'|'editEntry'|'cancelEntry';id:string}

export function GroupRegistrationTools({edit,open,close,children,message}:{edit:GroupEdit|null;open:(task:GroupEdit)=>void;close:()=>void;children:ReactNode;message:string}){
  return <section className="space-y-3" aria-label="団体の登録内容を修正">
    <div className="flex flex-wrap gap-2">
      {([['payment','入金情報'],['stable','入退厩日時・厩舎割要望'],['source','Excelの取込記録']] as const).map(([kind,label])=>
        <button type="button" key={kind} className={groupActionClass} aria-pressed={edit?.kind===kind} onClick={()=>open({kind})}>{label}</button>)}
    </div>
    {message&&<p role="status" className="rounded-lg bg-emerald-50 p-3 font-bold">{message}</p>}
    {edit&&<div id="group-registration-editor" tabIndex={-1} className="space-y-4 rounded-xl border-2 border-primary p-4">
      {children}<button type="button" className={groupActionClass} onClick={close}>団体の登録内容に戻る</button>
    </div>}
  </section>
}

export function RegistrationPersonFields({person,reading,onSave,kind}:{person:RegistrationOverviewPerson;reading:string;kind:'rider'|'horse';onSave:(name:string,reading:string,number:string)=>Promise<void>}){
 const [name,setName]=useState(person.name),[kana,setKana]=useState(reading),[number,setNumber]=useState(person.number)
 const [busy,setBusy]=useState(false),[error,setError]=useState('')
 async function save(){
   setBusy(true);setError('')
   try{await onSave(name,kana,number)}catch(e){setError(e instanceof Error?e.message:'保存結果を確認してください。')}finally{setBusy(false)}
 }
 return <fieldset disabled={busy} className="space-y-2">
   <legend className="text-xl font-bold">{person.name}の登録内容を修正</legend>
   <p>共通名簿と、同じ登録IDの今大会の名簿・出番に反映します。</p>
   {([[kind==='rider'?'選手名':'馬名',name,setName],['読み仮名',kana,setKana],['日馬連番号',number,setNumber]] as const).map(([label,value,change])=>
     <label key={label} className="block">{label}<input className="block min-h-12 w-full rounded-lg border p-2" value={value} onChange={e=>change(e.target.value)}/></label>)}
   <button type="button" className={groupActionClass} disabled={!name.trim()||!kana.trim()} onClick={()=>void save()}>名簿の訂正を保存</button>
   {error&&<p role="alert">{error}</p>}
 </fieldset>
}
