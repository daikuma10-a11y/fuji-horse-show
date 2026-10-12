"use client"
import {WinterExerciseNotice} from '@/components/winter-exercise-notice'
import {winterCompetitionLabel} from '@/lib/winter-display-order'
import {useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {winterCompetition,type WinterFeeSelection} from '@/lib/winter-event'
import type {loadWinterData} from '@/lib/winter-data'
import {reviewWinterSettlementOnly,saveWinterSettlementOnlyBatch} from '@/lib/winter-settlement-only'
import {reviewWinterInitialEntry,reviewWinterInitialBatch,saveWinterInitialBatch,WinterInitialBatchFailure,type WinterInitialEntryInput} from '@/lib/winter-initial-entry'
const field='mt-2 min-h-14 w-full rounded-xl border-2 p-3 text-xl'
const button='min-h-14 rounded-xl bg-blue-800 p-3 text-xl font-bold text-white disabled:opacity-50'
type Draft={key:string;riderId:string;horseId:string;compId:string;selection:WinterFeeSelection}
const blank=(key:string,horseId=''):Draft=>({key,riderId:'',horseId,compId:'',selection:{}})
export function WinterInitialEntryRegistration({data,session,onChanged,onChooseParticipants,settlementOnly=false}:{data:Awaited<ReturnType<typeof loadWinterData>>;session:AdminSession;onChanged:()=>void;onChooseParticipants:()=>void;settlementOnly?:boolean}){
 const[orgId,setOrgId]=useState(''),[drafts,setDrafts]=useState<Draft[]>([])
 const[review,setReview]=useState<WinterInitialEntryInput[]|null>(null),[completed,setCompleted]=useState<string[]>([]),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),lock=useRef(false)
 const reviewBatch=settlementOnly?reviewWinterSettlementOnly:reviewWinterInitialBatch
 const org=data.organizations.find(x=>x.id===orgId)
 const riders=data.riders,horses=data.horses.filter(x=>x.organization_id===orgId)
 function patch(key:string,update:Partial<Draft>){setDrafts(rows=>rows.map(row=>row.key===key?{...row,...update}:row));setError('');setMessage('')}
 function confirm(){setError('');setMessage('');try{
  if(!org)throw new Error('所属団体を選択してください')
  const inputs=drafts.filter(row=>row.riderId||row.compId).map((row,i)=>{
   const rider=riders.find(x=>x.id===row.riderId),horse=horses.find(x=>x.id===row.horseId),competition=data.competitions.find(x=>x.id===row.compId)
   if(!rider||!horse||!competition)throw new Error(`${i+1}行目：選手・馬・競技をすべて選択してください`)
   const input={id:crypto.randomUUID(),organization:org,rider,horse,competition,selection:{...row.selection}}
   try{reviewWinterInitialEntry(input)}catch(e){throw new Error(`${i+1}行目：${e instanceof Error?e.message:'内容を確認してください'}`)}
   if(!settlementOnly&&data.entries.some(e=>e.competition_id===competition.id&&e.rider_id===rider.id&&e.horse_id===horse.id&&!['wd','withdrawn'].includes(e.status.toLowerCase())))throw new Error(`${i+1}行目：この競技・選手・馬は登録済みです`)
   return input
  })
  reviewBatch(inputs);setCompleted([]);setUncertain(false);setReview(inputs)
 }catch(e){setError(e instanceof Error?e.message:'入力を確認してください')}}
 async function save(){if(!review||lock.current)return;lock.current=true;setBusy(true);setError('');try{
  const verified=await verifyAdminSession(session)
  await (settlementOnly?saveWinterSettlementOnlyBatch:saveWinterInitialBatch)(review,verified.accessToken,completed,ids=>setCompleted(ids))
  setMessage(settlementOnly?`${review.length}件を精算だけに保存しました。出番表は変更していません。`:`${org?.name??''}の事前エントリー ${review.length}件を仮出番表に登録しました`);setUncertain(false);setReview(null);setCompleted([]);setDrafts([]);onChanged()
 }catch(e){if(e instanceof WinterInitialBatchFailure){setCompleted(e.completedIds);setUncertain(e.uncertain);if(e.completedIds.length)onChanged()}setError(e instanceof Error?e.message:'保存できません')}finally{lock.current=false;setBusy(false)}}
 const participantSetup=<div className="space-y-3 rounded-xl bg-blue-50 p-4"><p className="text-xl">「人馬名簿」で団体を選び、参加する選手と馬にチェックして「参加チェックを保存」を押してください。</p><button type="button" className={button} onClick={onChooseParticipants}>人馬名簿で参加人馬を選ぶ</button></div>
 if(!data.organizations.length)return <section className="space-y-4 rounded-xl border-2 border-blue-300 p-4"><h2 className="text-2xl font-bold">{settlementOnly?'現場追加・再走行の登録':'事前エントリーをまとめて登録'}</h2><p>Winterの参加名簿はまだ登録されていません。</p>{participantSetup}</section>
 return <section className="space-y-4 rounded-xl border-2 border-blue-300 p-4"><h2 className="text-2xl font-bold">{settlementOnly?'現場追加・再走行を精算だけに登録':'クラブ単位で事前エントリーをまとめて登録'}</h2><WinterExerciseNotice organizationId={orgId}/>{settlementOnly&&<p className="rounded-xl bg-orange-100 p-4 text-xl font-bold">出番表は変更しません。競技料＋追加手数料3,000円を1件ずつ請求します。確認済み入金は本部の精算欄で別途記録してください。</p>}<p>馬の所属団体を選び、所属馬ごとに出場する競技と騎乗する選手を入力します。1頭で複数競技・複数選手の登録ができます。他団体の選手も所属を確認して選べます。精算は選択した選手の所属に計上します。</p>
 {!review?<fieldset disabled={busy} className="space-y-4">
 <label className="block text-xl">馬の所属団体<select className={field} value={orgId} onChange={e=>{if(drafts.some(r=>r.riderId||r.horseId||r.compId)&&!window.confirm('入力中の一覧を消して団体を変更しますか？'))return;setOrgId(e.target.value);setDrafts([]);setError('');setMessage('')}}><option value="">団体を選択</option>{data.organizations.map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
 {org&&(!riders.length||!horses.length)&&participantSetup}
 {org&&<label className="block text-xl">所属馬を選択して入力欄を追加<select className={field} value="" onChange={e=>{if(e.target.value)setDrafts(rows=>[...rows,blank(crypto.randomUUID(),e.target.value)]);setError('');setMessage('')}}><option value="">馬を選択</option>{horses.map(x=><option key={x.id} value={x.id} disabled={drafts.some(r=>r.horseId===x.id)}>{x.name}{drafts.some(r=>r.horseId===x.id)?'（入力欄あり）':''}</option>)}</select></label>}
 {org&&[...new Set(drafts.map(r=>r.horseId))].map(horseId=>{const horse=horses.find(h=>h.id===horseId);if(!horse)return null;return <div key={horseId} className="space-y-4 rounded-xl border-2 border-blue-300 p-4"><h3 className="rounded-lg bg-blue-50 p-3 text-2xl font-bold">{horse.name}<small className="block text-base font-normal">所属：{org.name}</small></h3>
 {drafts.filter(r=>r.horseId===horseId).map((row,index)=>{const comp=data.competitions.find(c=>c.id===row.compId);return <div key={row.key} className="space-y-3 border-b pb-4"><h4 className="text-lg font-bold">出場 {index+1}</h4><div className="grid gap-3 lg:grid-cols-2">
 <label>競技<select aria-label={`${horse.name} ${index+1}行目の競技`} className={field} value={row.compId} onChange={e=>patch(row.key,{compId:e.target.value,selection:{}})}><option value="">競技を選択</option>{data.competitions.map(x=><option key={x.id} value={x.id}>{winterCompetitionLabel(x)}</option>)}</select></label>
 <label>騎乗する選手<select aria-label={`${horse.name} ${index+1}行目の選手`} className={field} value={row.riderId} onChange={e=>patch(row.key,{riderId:e.target.value})}><option value="">選手を選択</option>{riders.map(x=><option key={x.id} value={x.id}>{x.name} ／ {data.organizations.find(o=>o.id===x.organization_id)?.name??'所属未確認'}</option>)}</select></label></div>
 {comp&&!comp.official&&<label className="block text-xl">出場区分<select aria-label={`${horse.name} ${index+1}行目の出場区分`} className={field} value={row.selection.isOp?'op':'normal'} onChange={e=>patch(row.key,{selection:{...row.selection,isOp:e.target.value==='op'}})}><option value="normal">通常参加（OPではない）</option>{comp.op_fee!==null&&<option value="op">OP参加</option>}</select>{comp.op_fee===null&&<small>この競技はOP料金の設定がありません。</small>}</label>}
 {comp&&(comp.member_fee!==null||comp.nonmember_fee!==null)&&<label className="block text-xl">会員区分<select aria-label={`${horse.name} ${index+1}行目の会員区分`} className={field} value={row.selection.membership??''} onChange={e=>patch(row.key,{selection:{...row.selection,membership:e.target.value==='member'?'member':e.target.value==='nonmember'?'nonmember':undefined}})}><option value="">会員・非会員を選択</option><option value="member">会員</option><option value="nonmember">非会員</option></select></label>}
 {comp&&winterCompetition(comp.competition_no).instructorRequired&&<label className="flex items-center gap-3 text-xl"><input className="size-7" type="checkbox" checked={!!row.selection.instructorConfirmed} onChange={e=>patch(row.key,{selection:{...row.selection,instructorConfirmed:e.target.checked}})}/>地域乗馬指導者資格を確認しました</label>}
 <button type="button" className="min-h-14 rounded-xl border-2 p-3" onClick={()=>setDrafts(rows=>rows.filter(r=>r.key!==row.key))}>この出場を削除</button>
 </div>})}
 <div className="flex flex-wrap gap-3"><button type="button" className={button} onClick={()=>setDrafts(rows=>[...rows,blank(crypto.randomUUID(),horseId)])}>この馬の出場を追加</button><button type="button" className="min-h-14 rounded-xl border-2 p-3" onClick={()=>{if(window.confirm(`${horse.name}の入力中の出場をすべて削除しますか？`))setDrafts(rows=>rows.filter(r=>r.horseId!==horseId))}}>この馬を一覧から外す</button></div>
 </div>})}
 {org&&drafts.length>0&&<div className="space-y-3 rounded-xl bg-blue-50 p-4"><label className="block text-xl font-bold">続けて次の馬を追加<select className={field} value="" onChange={e=>{if(e.target.value)setDrafts(rows=>[...rows,blank(crypto.randomUUID(),e.target.value)]);setError('');setMessage('')}}><option value="">次の馬を選択</option>{horses.filter(x=>!drafts.some(r=>r.horseId===x.id)).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label><p>入力済みの馬の内容は残ります。同じ団体の馬を続けて入力し、最後にまとめて登録してください。</p>{horses.every(x=>drafts.some(r=>r.horseId===x.id))&&<p role="status">この団体の参加馬はすべて入力欄に追加済みです。</p>}</div>}
 {org&&<button type="button" className={button} disabled={!drafts.some(r=>r.riderId||r.compId)} onClick={confirm}>全ての馬の登録内容を確認</button>}
 </fieldset>:<div className="space-y-4 rounded-xl bg-blue-50 p-4"><h3 className="text-2xl font-bold">{review[0].organization.name}：{review.length}件の登録内容</h3>{[...new Set(review.map(r=>r.horse.id))].map(horseId=>{const entries=review.filter(r=>r.horse.id===horseId);return <div key={horseId} className="space-y-2 rounded-xl border-2 bg-white p-3"><h4 className="text-2xl font-bold">{entries[0].horse.name}</h4><div className="overflow-x-auto"><table className="w-full border-collapse text-lg"><thead><tr>{['競技','騎乗する選手','区分',settlementOnly?'手数料込み金額':'競技料','登録状況'].map(s=><th key={s} className="border p-2 text-left">{s}</th>)}</tr></thead><tbody>{entries.map(row=><tr key={row.id}><td className="border p-2">{winterCompetitionLabel(row.competition)}</td><td className="border p-2">{row.rider.name}<small className="block">{data.organizations.find(o=>o.id===row.rider.organization_id)?.name}</small></td><td className="border p-2">{row.selection.isOp?'OP':'通常'}{row.selection.membership&&` ／ ${row.selection.membership==='member'?'会員':'非会員'}`}</td><td className="whitespace-nowrap border p-2">¥{(reviewWinterInitialEntry(row).entryFee+(settlementOnly?3000:0)).toLocaleString('ja-JP')}</td><td className="border p-2">{completed.includes(row.id)?'登録済み':'未確認'}</td></tr>)}</tbody></table></div></div>})}
 <p className="text-2xl font-bold">今回の料金合計 ¥{reviewBatch(review).total.toLocaleString('ja-JP')}</p><p>{settlementOnly?'競技料＋1件3,000円の追加手数料。出番表を変更せず精算だけに記録します。':'追加手数料 ¥0。'}入金済みにはしません。厩舎料等は含みません。</p><p role="status">登録確認済み {completed.length} ／ {review.length}件</p><p>{settlementOnly?'全件を同時保存します。通信結果が不明な場合は同じ一覧で再確認してください。':'順に登録します。途中で止まった場合は登録済みを残し、同じ一覧で続きから再確認します。'}</p>
 <button className={button} type="button" disabled={busy} onClick={()=>void save()}>{busy?'まとめて登録中…':completed.length||uncertain?'未確認分の登録を続ける':settlementOnly?'この一覧を精算だけに登録する':'この一覧を仮出番表に登録する'}</button>
 <button type="button" className="ml-3 min-h-14 rounded-xl border-2 p-3 text-xl" disabled={busy||uncertain} onClick={()=>{if(completed.length){setDrafts(review.filter(r=>!completed.includes(r.id)).map(r=>({key:crypto.randomUUID(),riderId:r.rider.id,horseId:r.horse.id,compId:r.competition.id,selection:{...r.selection}})))}setReview(null);setCompleted([]);setError('')}}>{completed.length?'未登録分を入力に戻す':'入力に戻る'}</button>
 </div>}
 {error&&<p role="alert" className="rounded-xl bg-red-100 p-3 text-xl">{error}</p>}{message&&<p role="status" className="rounded-xl bg-green-100 p-3 text-xl">{message}</p>}
 </section>
}
