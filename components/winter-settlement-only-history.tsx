"use client"
import {useEffect,useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {cancelWinterSettlementOnly,type WinterSettlementOnlyRow} from '@/lib/winter-settlement-only'
import {WinterInitialBatchFailure} from '@/lib/winter-initial-entry'
import type {winterSettlementAccount} from '@/lib/winter-settlement'
const button='min-h-14 rounded-xl border-2 p-3 text-xl font-bold disabled:opacity-50'
export function WinterSettlementOnlyHistory({account,session,onSession,onChanged,onLocked}:{account:ReturnType<typeof winterSettlementAccount>;session:AdminSession;onSession:(s:AdminSession)=>void;onChanged:()=>void;onLocked:(locked:boolean)=>void}){
 const[busy,setBusy]=useState(false),[pending,setPending]=useState<{id:string;row:WinterSettlementOnlyRow;reason:string}|null>(null),[error,setError]=useState(''),lock=useRef(false)
 useEffect(()=>{onLocked(busy||!!pending);return()=>onLocked(false)},[busy,pending,onLocked])
 async function cancel(row:WinterSettlementOnlyRow){
  if(lock.current)return;setError('')
  let input=pending
  if(!input){const reason=window.prompt('現場追加を取り消す理由を入力してください。入金記録と出番表は変更しません。');if(reason===null)return;if(!reason.trim()||reason.trim().length>500){setError('取消理由を1〜500文字で入力してください');return}if(!window.confirm(`${row.fee_amount.toLocaleString('ja-JP')}円の現場追加を取り消しますか？元の履歴は残ります。`))return;input={id:crypto.randomUUID(),row,reason:reason.trim()}}
  lock.current=true;setBusy(true)
  try{const verified=await verifyAdminSession(session);onSession(verified);await cancelWinterSettlementOnly(input.row,input.id,input.reason,verified.accessToken);setPending(null);onChanged()}
  catch(e){if(e instanceof WinterInitialBatchFailure&&e.uncertain)setPending(input);else setPending(null);setError(e instanceof Error?e.message:'取消を確認できません')}
  finally{lock.current=false;setBusy(false)}
 }
 return <section className="space-y-3 rounded-xl border-2 p-4"><h3 className="text-2xl font-bold">現場追加・再走行の履歴</h3><p>出番表を変更せず精算だけに登録した分です。取消は料金を差し引く履歴を残します。入金済みの場合の返金・充当は本部で別途確認してください。</p>{!account.onsite.length&&<p>現場追加の登録はありません。</p>}{account.onsite.map(row=>{const detail=account.lines.find(x=>x.id===row.id);return <div key={row.id} className="space-y-2 border-b p-3"><p>{detail?.action} ／ {detail?.competitionLabel} ／ {detail?.rider} ／ {detail?.horse} ／ {(detail?.amount??0).toLocaleString('ja-JP')}円</p><p>{row.note}</p><p>保存日時：{new Date(row.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ 番号：{row.id}</p>{!row.reverses_id&&(account.onsiteReversed.has(row.id)?<p>取消済み</p>:<button className={button} disabled={busy||!!pending} onClick={()=>void cancel(row)}>この現場追加を取り消す</button>)}</div>})}{error&&<p role="alert" className="rounded-xl bg-red-100 p-3">{error}</p>}{pending&&<><p role="status">取消結果未確認の番号：{pending.id}。同じ番号で再確認してください。</p><button className={button} disabled={busy} onClick={()=>void cancel(pending.row)}>同じ番号で取消を再確認</button></>}</section>
}
