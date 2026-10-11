"use client"
import {useEffect,useRef,useState} from 'react'
import type {AdminSession} from '@/lib/supabase-rest'
import type {WinterExtraPayment} from '@/lib/winter-settlement'
import {saveWinterExtraPayment,UncertainWinterPayment,type WinterExtraPaymentInput} from '@/lib/winter-extra-payment'
const field='mt-2 min-h-14 w-full rounded-xl border-2 p-3 text-xl'
const button='min-h-14 rounded-xl bg-blue-800 px-5 py-3 text-xl font-bold text-white disabled:opacity-50'
const yen=(n:number)=>`${n.toLocaleString('ja-JP')}円`
export function WinterExtraPaymentForm({session,orgId,payments,onSession,onChanged,onLocked}:{session:AdminSession;orgId:string;payments:WinterExtraPayment[];onSession:(s:AdminSession)=>void;onChanged:()=>void;onLocked:(locked:boolean)=>void}){
 const [paid,setPaid]=useState(''),[method,setMethod]=useState<'cash_at_venue'|'bank_transfer'>('cash_at_venue'),[note,setNote]=useState(''),[reverse,setReverse]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState<WinterExtraPaymentInput|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),lock=useRef(false)
 useEffect(()=>{onLocked(busy||!!pending);return()=>onLocked(false)},[busy,pending,onLocked])
 const reversed=new Set(payments.map(x=>x.reverses_id).filter(Boolean))
 const active=payments.filter(x=>!x.reverses_id&&!reversed.has(x.id))
 async function save(){
  if(lock.current)return;setError('');setMessage('')
  const original=active.find(x=>x.id===reverse)
  if(!pending&&((reverse&&!original)||(!reverse&&(!/^\d+$/.test(paid)||Number(paid)<1))||!note.trim())){setError('入金額（1円以上）と確認内容、取消時は取消理由を入力してください。');return}
  const input=pending??{id:crypto.randomUUID(),orgId,amount:original?.amount??Number(paid),method:original?.payment_method??method,note:note.trim(),reversesId:original?.id??null}
  if(!pending&&!window.confirm(`${input.reversesId?'入金記録を取り消します':'実際に確認した入金を記録します'}：${yen(input.amount)}。よろしいですか？`))return
  lock.current=true;setBusy(true)
  try{const result=await saveWinterExtraPayment(session,input);onSession(result.session);setPending(null);setPaid('');setNote('');setReverse('');setMessage('保存した入金履歴を確認しました。');onChanged()}
  catch(e){if(e instanceof UncertainWinterPayment)setPending(input);setError(e instanceof Error?e.message:'保存を確認できません')}
  finally{lock.current=false;setBusy(false)}
 }
 return <section className="space-y-3 rounded-xl border-2 p-4"><h3 className="text-2xl font-bold">追加・変更分の入金記録</h3><p>実際に受け取った現金、または銀行で確認した入金だけを記録します。事前入金欄に記録済みの金額は重ねて入力しないでください。取消は記録の訂正であり、実際の返金処理ではありません。</p><fieldset className="space-y-3" disabled={busy||!!pending}><label className="block text-xl">操作<select className={field} value={reverse} onChange={e=>setReverse(e.target.value)}><option value="">確認した入金を追加</option>{active.map(x=><option key={x.id} value={x.id}>入金取消：{yen(x.amount)} ／ {x.note} ／ {new Date(x.created_at).toLocaleString('ja-JP')}</option>)}</select></label>{!reverse&&<><label className="block text-xl">今回確認した入金額（円）<input className={field} inputMode="numeric" value={paid} onChange={e=>setPaid(e.target.value)}/></label><label className="block text-xl">実際の入金方法<select className={field} value={method} onChange={e=>setMethod(e.target.value as typeof method)}><option value="cash_at_venue">現金を受領済み</option><option value="bank_transfer">銀行入金を確認済み</option></select></label></>}<label className="block text-xl">{reverse?'取消理由':'確認内容・入金日など'}<input className={field} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label></fieldset>{error&&<p role="alert" className="rounded-xl bg-red-100 p-3">{error}</p>}{message&&<p role="status">{message}</p>}{pending&&<p role="status">結果未確認の登録番号：{pending.id}。入力を変更せず再確認してください。画面を閉じた場合は、入金履歴を確認してから新しく記録してください。</p>}<button className={button} disabled={busy} onClick={()=>void save()}>{busy?'保存・確認中…':pending?'同じ登録番号で保存を再確認':reverse?'取消を記録':'確認した入金を記録'}</button><details><summary className="cursor-pointer py-3 text-xl">入金・取消履歴（{payments.length}件）</summary>{payments.map(x=><div key={x.id} className="border-b p-3"><p>{x.reverses_id?'取消':'入金'}：{yen(x.amount)} ／ {x.payment_method==='bank_transfer'?'銀行':'現金'}{reversed.has(x.id)?' ／ 取消済み':''}</p><p>{x.note}</p><small>{new Date(x.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ 記録番号 {x.id}</small></div>)}</details></section>
}
