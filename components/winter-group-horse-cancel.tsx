'use client'
import {useCallback,useEffect,useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import type {loadWinterData,WinterHorseRow} from '@/lib/winter-data'
import {winterRpc} from '@/lib/winter-reception'
import {winterStorageKey} from '@/lib/winter-event'
import {winterCompetitionLabel} from '@/lib/winter-display-order'
import type {CancellationQuote} from './master/entry-cancellation'
import {groupActionClass} from './master/group-registration-tools'

type Data=Awaited<ReturnType<typeof loadWinterData>>
type Quote={horseId:string;organizationId:string;name:string;number:string|null;registration:number;
 entries:CancellationQuote[];billing:{id:string;before:number;after:number;remaining:number}[]}
type Attempt={operation:string;quote:Quote}
export const horseCancelKey=(email:string,org:string)=>winterStorageKey('horse-cancellation')+':'+email+':'+org
const yen=(value:number)=>value.toLocaleString('ja-JP')+'円'
function validQuote(q:Quote,org:string,id:string){
 return q?.horseId===id&&q.organizationId===org&&Number.isSafeInteger(q.registration)&&Array.isArray(q.entries)&&
   q.entries.every(e=>e.horseId===id&&typeof e.entryId==='string'&&Number.isSafeInteger(e.fee))&&Array.isArray(q.billing)&&
   q.billing.some(b=>b.id===org)&&q.billing.every(b=>[b.before,b.after,b.remaining].every(Number.isSafeInteger))
}
export function WinterGroupHorseCancel({horse,data,session,onSession,onSaved}:{horse:WinterHorseRow;data:Data;session:AdminSession;onSession:(s:AdminSession)=>void;onSaved:()=>void}){
 const [review,setReview]=useState<Quote|null>(null),[attempt,setAttempt]=useState<Attempt|null>(null)
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false)
 const sessionRef=useRef(session);sessionRef.current=session
 const org=horse.organization_id,id=horse.id,key=horseCancelKey(session.email,org)
 const call=useCallback(async(operation:string|null,expected:Quote|null)=>{
   const verified=await verifyAdminSession(sessionRef.current);onSession(verified)
   const q=await winterRpc('winter_cancel_registered_horse',{p_org:org,p_horse:id,p_operation:operation,p_expected:expected},verified.accessToken,AbortSignal.timeout(25000)) as Quote
   if(!validQuote(q,org,id))throw Error('参加取消の結果を確認できません。同じ内容で再確認してください。')
   return q
 },[org,id,onSession])
 const [refresh,setRefresh]=useState(0)
 useEffect(()=>{
   let active=true
   setReview(null);setError('')
   try{
     const raw=sessionStorage.getItem(key)
     if(raw){
       const previous=JSON.parse(raw) as Attempt
       if(!previous.operation||!validQuote(previous.quote,org,id))throw Error('この団体に結果未確認の取消があります。団体の登録内容に戻り「参加取消の確定結果を再確認」を開いてください。')
       setAttempt(previous);setReview(previous.quote);return
     }
   }catch(e){setError(e instanceof Error?e.message:'端末記録を確認できません。');return}
   setBusy(true)
   call(null,null).then(q=>{if(active)setReview(q)}).catch(e=>{if(active)setError(e.message)}).finally(()=>{if(active)setBusy(false)})
   return ()=>{active=false}
 },[call,key,org,id,refresh])
 async function confirm(){
   if(lock.current||!review)return
   lock.current=true;setBusy(true);setError('')
   try{
     const next=attempt??{operation:crypto.randomUUID(),quote:review}
     const previous=sessionStorage.getItem(key)
     if(previous&&previous!==JSON.stringify(next))throw Error('別の取消の確定結果を先に確認してください。')
     sessionStorage.setItem(key,JSON.stringify(next));setAttempt(next)
     try{await call(next.operation,next.quote)}catch(e){
       // A PostgreSQL rejection rolled the whole transaction back. A lost reply must reuse the same operation.
       if(e instanceof Error&&'status' in e&&e.status===400){
         sessionStorage.removeItem(key);setAttempt(null);setReview(null)
       }
       throw e
     }
     sessionStorage.removeItem(key);onSaved()
   }catch(e){setError(e instanceof Error?e.message:'保存結果を確認できません。')}finally{lock.current=false;setBusy(false)}
 }
 return <section className="space-y-3"><h3 className="text-xl font-bold">{horse.name}の参加取消</h3>
   {review&&<><p>馬匹登録料 {yen(review.registration)} → 0円　／　取り消す事前エントリー {review.entries.length}件</p>
     <ul>{review.entries.map(e=>{const c=data.competitions.find(c=>c.id===e.competitionId);return <li key={e.entryId}>{c?winterCompetitionLabel(c):'競技'}　{e.position}番　{data.riders.find(r=>r.id===e.riderId)?.name}　{yen(e.fee)} → 0円</li>})}</ul>
     {review.billing.map(b=><p key={b.id}>{data.organizations.find(o=>o.id===b.id)?.name}　請求合計 {yen(b.before)} → <strong>{yen(b.after)}</strong>　{b.remaining<0?'取消後の過入金 '+yen(-b.remaining):'取消後の残額 '+yen(b.remaining)}</p>)}
     <p>確定すると今大会の参加馬と出番表から外れます。共通名簿と入金記録は保持します。</p>
     <button className={groupActionClass} disabled={busy} onClick={()=>void confirm()}>{attempt?'同じ取消の確定結果を再確認':'この馬の参加取消を確定'}</button>
   </>}
   {busy&&<p role="status">取消内容を確認中…</p>}
   {error&&<p role="alert" className="text-red-800">{error}</p>}
   {!busy&&!attempt&&!review&&<button className={groupActionClass} onClick={()=>setRefresh(n=>n+1)}>最新の取消内容を確認</button>}
 </section>
}
