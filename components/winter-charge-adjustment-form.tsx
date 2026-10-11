"use client"
import {useEffect,useRef,useState} from 'react'
import type {AdminSession} from '@/lib/supabase-rest'
import type {WinterChargeAdjustment} from '@/lib/winter-settlement'
import {saveWinterChargeAdjustment,UncertainWinterAdjustment,type WinterChargeAdjustmentInput} from '@/lib/winter-charge-adjustment'
const field='mt-2 min-h-14 w-full rounded-xl border-2 p-3 text-xl'
const button='min-h-14 rounded-xl bg-blue-800 px-5 py-3 text-xl font-bold text-white disabled:opacity-50'
const yen=(n:number)=>`${n.toLocaleString('ja-JP')}円`
export function WinterChargeAdjustmentForm({session,orgId,total,adjustments,previousId,onSession,onChanged,onLocked}:{session:AdminSession;orgId:string;total:number;adjustments:WinterChargeAdjustment[];previousId:string|null;onSession:(s:AdminSession)=>void;onChanged:()=>void;onLocked:(locked:boolean)=>void}){
 const [direction,setDirection]=useState<'discount'|'charge'>('discount'),[value,setValue]=useState(''),[reason,setReason]=useState(''),[busy,setBusy]=useState(false),[pending,setPending]=useState<WinterChargeAdjustmentInput|null>(null),[error,setError]=useState(''),[message,setMessage]=useState(''),lock=useRef(false)
 useEffect(()=>{onLocked(busy||!!pending);return()=>onLocked(false)},[busy,pending,onLocked])
 const delta=Number(value)*(direction==='discount'?-1:1)
 async function save(){
  if(lock.current)return;setError('');setMessage('')
  if(!pending&&(!/^\d+$/.test(value)||Number(value)<1||!Number.isSafeInteger(delta)||Math.abs(delta)>2147483647||total+delta<0||!reason.trim())){setError('1円以上の訂正金額と理由を入力してください。請求総額を0円未満にはできません。');return}
  const input=pending??{id:crypto.randomUUID(),orgId,delta,reason:reason.trim(),expectedTotal:total,previousId}
  if(!pending&&!window.confirm(`請求総額を ${yen(total)} → ${yen(total+delta)} に訂正しますか？入金額と元の競技料金は変更しません。`))return
  lock.current=true;setBusy(true)
  try{const result=await saveWinterChargeAdjustment(session,input);onSession(result.session);setPending(null);setValue('');setReason('');setMessage('訂正と理由を保存し、履歴を確認しました。');onChanged()}
  catch(e){if(e instanceof UncertainWinterAdjustment)setPending(input);setError(e instanceof Error?e.message:'訂正を確認できません')}
  finally{lock.current=false;setBusy(false)}
 }
 return <section className="space-y-3 rounded-xl border-2 p-4"><h3 className="text-2xl font-bold">請求金額の訂正（本部専用）</h3><p>割引・追加請求などの差額を理由とともに記録します。誤った訂正は反対方向の差額を記録してください。元の競技料金・馬匹登録料・入金履歴は残ります。</p><fieldset className="space-y-3" disabled={busy||!!pending}><label className="block text-xl">訂正の方向<select className={field} value={direction} onChange={e=>setDirection(e.target.value as typeof direction)}><option value="discount">請求額を減らす</option><option value="charge">請求額を増やす</option></select></label><label className="block text-xl">増減する金額（円）<input className={field} inputMode="numeric" value={value} onChange={e=>setValue(e.target.value)}/></label><label className="block text-xl">訂正理由<input className={field} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/></label><p>現在の請求総額：{yen(total)}{value&&Number.isSafeInteger(delta)&&<span> → 訂正後：{yen(total+delta)}</span>}</p></fieldset>{error&&<p role="alert" className="rounded-xl bg-red-100 p-3">{error}</p>}{message&&<p role="status">{message}</p>}{pending&&<p role="status">保存結果未確認：{pending.id}。同じ登録番号で再確認してください。画面を閉じた場合は訂正履歴を先に確認してください。</p>}<button className={button} disabled={busy} onClick={()=>void save()}>{busy?'保存・確認中…':pending?'同じ登録番号で訂正を再確認':'訂正を保存'}</button><details><summary className="cursor-pointer py-3 text-xl">金額訂正の履歴（{adjustments.length}件）</summary>{adjustments.map(x=><div key={x.id} className="border-b p-3"><p>{yen(x.before_total)} → {yen(x.after_total)}（{x.delta>0?'+':''}{yen(x.delta)}）</p><p>{x.reason}</p><small>{new Date(x.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ 記録番号 {x.id}</small></div>)}</details></section>
}
