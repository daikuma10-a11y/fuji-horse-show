"use client"
import {useEffect,useRef,useState} from 'react'
import type {AdminSession} from '@/lib/supabase-rest'
import type {WinterExtraPayment} from '@/lib/winter-settlement'
import {saveWinterExtraPayment,UncertainWinterPayment,type WinterExtraPaymentInput} from '@/lib/winter-extra-payment'
const field='mt-2 min-h-14 w-full rounded-xl border-2 p-3 text-xl'
const button='min-h-14 rounded-xl bg-blue-800 px-5 py-3 text-xl font-bold text-white disabled:opacity-50'
const yen=(n:number)=>n.toLocaleString('ja-JP')+'円'
type Props={session:AdminSession;orgId:string;remaining:number;payments:WinterExtraPayment[];onSession:(s:AdminSession)=>void;onChanged:()=>void;onLocked:(locked:boolean)=>void}
export function WinterExtraPaymentForm({session,orgId,remaining,payments,onSession,onChanged,onLocked}:Props){
 const [mode,setMode]=useState('payment'),[amount,setAmount]=useState(''),[method,setMethod]=useState<'cash_at_venue'|'bank_transfer'>('cash_at_venue')
 const [note,setNote]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState<WinterExtraPaymentInput|null>(null)
 const [error,setError]=useState(''),[message,setMessage]=useState(''),lock=useRef(false)
 useEffect(()=>{onLocked(busy||!!pending);return()=>onLocked(false)},[busy,pending,onLocked])
 const reversed=new Set(payments.map(x=>x.reverses_id).filter(Boolean))
 const active=payments.filter(x=>!x.reverses_id&&!reversed.has(x.id))
 const original=active.find(x=>x.id===mode)
 const refund=mode==='refund'||!!original&&original.amount<0
 const label=refund?'返金':'入金'
 function choose(value:string){setMode(value);setAmount('');setNote('');setMessage('');setError('')}
 async function save(){
  if(lock.current)return
  setError('');setMessage('')
  const numeric=original?Math.abs(original.amount):Number(amount)
  if(!pending&&((mode!=='refund'&&mode!=='payment'&&!original)||(!original&&(!/^\d+$/.test(amount)||numeric<1))||!note.trim())){setError('金額と確認内容を入力してください。');return}
  if(!pending&&mode==='refund'&&numeric> -remaining){setError('返金額は現在の過入金額以内で入力してください。');return}
  const input=pending??{id:crypto.randomUUID(),orgId,amount:numeric,method:original?.payment_method??method,note:note.trim(),reversesId:original?.id??null,...(refund?{refundBalance:remaining}:{})}
  if(!pending&&!window.confirm((original?label+'記録を取り消します':label+'済みとして記録します')+'。'+yen(input.amount)+'でよろしいですか？'))return
  lock.current=true;setBusy(true)
  try{
   const result=await saveWinterExtraPayment(session,input);onSession(result.session);setPending(null);choose('payment');setMessage(label+'の履歴を保存しました。');onChanged()
  }catch(e){if(e instanceof UncertainWinterPayment)setPending(input);setError(e instanceof Error?e.message:'保存結果を確認できません')}
  finally{lock.current=false;setBusy(false)}
 }
 return <section className="space-y-3 rounded-xl border-2 p-4"><h3 className="text-2xl font-bold">入金・返金の記録</h3>
  {remaining<0&&<p className="font-bold text-amber-800">現在の過入金額　{yen(-remaining)}</p>}
  <fieldset className="space-y-3" disabled={busy||!!pending}>
   <label className="block text-xl">操作<select className={field} value={mode} onChange={e=>choose(e.target.value)}>
    <option value="payment">確認した入金を追加</option>{(remaining<0||mode==='refund')&&<option value="refund">過入金の返金を記録</option>}
    {active.map(x=><option key={x.id} value={x.id}>{x.amount<0?'返金':'入金'}記録の取消　{yen(Math.abs(x.amount))} ／ {x.note}</option>)}
   </select></label>
   {!original&&<><label className="block text-xl">{refund?'実際に返金した額':'今回確認した入金額'}（円）<input className={field} inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
    <label className="block text-xl">{label}方法<select className={field} value={method} onChange={e=>setMethod(e.target.value as typeof method)}><option value="cash_at_venue">{refund?'現金で返金済み':'現金を受領済み'}</option><option value="bank_transfer">{refund?'銀行振込で返金済み':'銀行入金を確認済み'}</option></select></label></>}
   <label className="block text-xl">{original?'記録の取消理由':refund?'返金理由・返金日など':'確認内容・入金日など'}<input className={field} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label>
  </fieldset>
  {error&&<p role="alert">{error}</p>}{message&&<p role="status">{message}</p>}{pending&&<p>結果未確認の登録番号　{pending.id}</p>}
  <button className={button} disabled={busy} onClick={()=>void save()}>{busy?'保存・確認中…':pending?'同じ登録番号で保存を再確認':original?'記録の取消を保存':refund?'返金済みとして記録':'確認した入金を記録'}</button>
  <details><summary className="cursor-pointer py-3 text-xl">入金・返金・取消履歴（{payments.length}件）</summary>{payments.map(x=><div key={x.id} className="border-b p-3"><p>{x.amount<0?'返金':'入金'}{x.reverses_id?'記録の取消':''}　{yen(Math.abs(x.amount))} ／ {x.payment_method==='bank_transfer'?'銀行':'現金'}{reversed.has(x.id)?' ／ 取消済み':''}</p><p>{x.note}</p><small>{new Date(x.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ {x.id}</small></div>)}</details>
 </section>
}
