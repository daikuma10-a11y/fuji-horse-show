"use client"
import {useRef,useState} from 'react'
import {type AdminSession} from '@/lib/supabase-rest'
import {saveWinterPaymentInstruction,type WinterPaymentInstruction} from '@/lib/winter-settlement'
type Props={session:AdminSession;orgId:string;instruction:WinterPaymentInstruction|null;onSession:(s:AdminSession)=>void;onChanged:()=>void}
const field='mt-2 min-h-14 w-full rounded-xl border-2 p-3 text-xl'
const button='min-h-14 rounded-xl bg-blue-800 px-5 py-3 text-xl font-bold text-white disabled:opacity-50'
export function WinterPaymentInstructionForm({session,orgId,instruction,onSession,onChanged}:Props){
 const [method,setMethod]=useState<WinterPaymentInstruction['payment_method']|''>(instruction?.payment_method??'')
 const [details,setDetails]=useState(instruction?.bank_details??''),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState('')
 const lock=useRef(false)
 async function save(){
  if(lock.current||uncertain)return
  setError('')
  if(!method){setError('支払方法を選択してください');return}
  if(method==='bank_transfer'&&!details.trim()){setError('振込先を入力してください');return}
  if(!window.confirm(`支払方法を「${method==='bank_transfer'?'後日振込':'当日現金'}」に保存しますか？ 入金済みにはなりません。`))return
  lock.current=true;setBusy(true)
  try{const result=await saveWinterPaymentInstruction(session,orgId,method,details,instruction);onSession(result.session);onChanged()}
  catch(e){setError(e instanceof Error?e.message:'保存を確認できません');setUncertain(true)}
  finally{lock.current=false;setBusy(false)}
 }
 return <section className="space-y-3 rounded-xl border-2 p-4"><h3 className="text-2xl font-bold">支払方法の保存</h3><p>支払い予定の方法を保存します。現金の受領・振込の確認、精算内容の確定は行いません。</p><fieldset disabled={busy||uncertain}><label className="block text-xl">支払方法<select className={field} value={method} onChange={e=>setMethod(e.target.value as typeof method)}><option value="">選択してください</option><option value="cash_at_venue">当日現金</option><option value="bank_transfer">後日振込</option></select></label>{method==='bank_transfer'&&<label className="block text-xl">振込先（銀行・支店・口座番号・口座名義）<textarea className={field} rows={3} maxLength={2000} value={details} onChange={e=>setDetails(e.target.value)}/></label>}</fieldset>{instruction&&<p>保存日時：{new Date(instruction.updated_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>}{error&&<p role="alert" className="rounded-xl bg-red-100 p-3">{error}</p>}{uncertain?<button className={button} onClick={onChanged}>保存内容を再読み込みして確認</button>:<button className={button} disabled={busy} onClick={()=>void save()}>{busy?'保存・確認中…':'支払方法を保存'}</button>}</section>
}
