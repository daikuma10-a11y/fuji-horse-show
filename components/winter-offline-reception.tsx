"use client"
import {useEffect,useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {listOfflineReceipts,offlineStatusLabel,offlineUrgentNotice,draftContext,type WinterOfflineReceipt,type OfflineItem,type WinterData} from '@/lib/winter-offline'
import {reviewOfflineReceipts,sendOfflineItem,updateOfflineItem} from '@/lib/winter-offline-sync'
import {winterDraftSummary,type WinterDraft} from '@/lib/winter-batch'
import type {WinterFeeSelection} from '@/lib/winter-event'
const button='min-h-14 rounded-xl border-2 border-blue-800 bg-white px-4 py-3 text-lg font-bold text-blue-900 disabled:opacity-50'
const field='mt-1 min-h-12 w-full rounded-lg border-2 bg-white p-2 text-lg'
const statusLabel={...offlineStatusLabel,queued:'端末に保存済み・本部未受付',sent:'申請一覧に登録済み'}
type Current=()=>boolean
export function WinterOfflineReception({session,onSession,active,onChanged}:{session:AdminSession;onSession:(s:AdminSession)=>void;active:boolean;onChanged:()=>void}){
 const[receipts,setReceipts]=useState<WinterOfflineReceipt[]>([]),[data,setData]=useState<WinterData|null>(null)
 const[loaded,setLoaded]=useState(false),[reload,setReload]=useState(0),[unlocked,setUnlocked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
 const lock=useRef(false),alive=useRef(active),generation=useRef(0)
 // Only counts are shown on entry. Names and details require an explicit admin
 // action, and are hidden again on tab changes/backgrounding/logout.
 useEffect(()=>{
  let live=true
  async function read(){
   const version=++generation.current
   alive.current=active&&!document.hidden
   setUnlocked(false);setReceipts([]);setData(null);setLoaded(false);setError('');setMessage('')
   if(!alive.current)return
   try{const rows=await listOfflineReceipts();if(live&&alive.current&&generation.current===version){setReceipts(rows);setLoaded(true)}}
   catch(e){if(live&&alive.current&&generation.current===version){setError(e instanceof Error?e.message:'端末の受付を確認できません');setLoaded(true)}}
  }
  void read()
  const visibility=()=>void read()
  document.addEventListener('visibilitychange',visibility)
  return()=>{live=false;alive.current=false;generation.current++;document.removeEventListener('visibilitychange',visibility)}
 },[active,reload])
 async function run(fn:(token:string,current:Current)=>Promise<void>){
  if(lock.current||!active||!alive.current)return
  const version=generation.current,current=()=>alive.current&&generation.current===version
  lock.current=true;setBusy(true);setError('');setMessage('')
  try{const s=await verifyAdminSession(session);if(!current())return;onSession(s);await fn(s.accessToken,current)}
  catch(e){if(current())setError(e instanceof Error?e.message:'処理できません')}
  finally{lock.current=false;setBusy(false)}
 }
 async function refresh(token:string,current:Current){
  if(!current())return
  setData(null)
  const result=await reviewOfflineReceipts(token)
  if(current()){setReceipts(result.receipts);setData(result.data);setMessage('本部の受付状況と照合しました。未送信分は内容を確認して取り込んでください');onChanged()}
 }
 async function open(){await run(async(token,current)=>{
  const rows=await listOfflineReceipts();if(!current())return
  setReceipts(rows);setUnlocked(true);setData(null)
  // A failed remote check leaves the local contents visible and import disabled.
  await refresh(token,current)
 })}
 async function send(token:string,current:Current,only?:{id:string;index:number}){
  const targets=only?[only]:receipts.flatMap(r=>r.items.flatMap((i,index)=>i.status==='queued'?[{id:r.id,index}]:[]))
  try{
   for(const t of targets){if(!current())break;setMessage(`申請一覧へ取り込み中（受付番号：${t.id}）`);await sendOfflineItem(t.id,t.index,token)}
  }finally{
   // Refresh the existing request list even if a later item fails after an
   // earlier success. A running item keeps its original durable retry record.
   if(current()){setData(null);onChanged();const rows=await listOfflineReceipts();if(current()){setReceipts(rows);setMessage('取り込み結果を更新しました。登録済みの受付は下の申請一覧に表示されます。出番表への反映は一覧の反映ボタンで行ってください')}}
  }
 }
 const items=receipts.flatMap(r=>r.items),pending=items.filter(i=>!['sent','cancelled'].includes(i.status))
 const count=(status:OfflineItem['status'])=>items.filter(i=>i.status===status).length
 if(!active)return null
 if(!loaded)return <p role="status" className="print-hide">このiPadの受付を確認しています…</p>
 if(!receipts.length&&!error)return null
 return <section id="winter-offline-reception" aria-label="このiPadの受付" className="print-hide space-y-4 rounded-xl border-2 p-4">
 <h2 className="text-2xl font-bold">{count('queued')?'このiPadに未送信の受付があります':pending.length?'このiPadに確認が必要な受付があります':'このiPadの受付記録'}</h2>
 {pending.length>0&&<p>未送信・確認待ちの内訳：追加{pending.filter(i=>i.draft.type==='add').length}件 ／ 変更{pending.filter(i=>i.draft.type==='change').length}件 ／ 棄権{pending.filter(i=>i.draft.type==='withdraw').length}件</p>}
 {receipts.length>0&&<p>未送信 {count('queued')}件 ／ 要確認 {count('review')}件 ／ 結果確認待ち {count('unknown')}件 ／ 申請一覧に登録済み {count('sent')}件 ／ 端末内で取下げ {count('cancelled')}件</p>}
 {!unlocked?<button type="button" className={button} disabled={busy} aria-expanded={false} aria-controls="winter-device-receipts" onClick={()=>void open()}>{busy?'管理者権限を確認中…':'内容を確認する'}</button>:<>
 <button type="button" className={button} disabled={busy} aria-expanded={true} aria-controls="winter-device-receipts" onClick={()=>{setUnlocked(false);setData(null);setMessage('')}}>内容を閉じる</button>
 <div id="winter-device-receipts" className="space-y-4">
 <p>このiPadの保存内容を確認し、本部の申請一覧へ取り込みます。通信復旧だけでは取り込みません。</p>
 {pending.length>0&&<p className="rounded-xl bg-amber-50 p-4 font-bold">{offlineUrgentNotice}</p>}<details className="space-y-2 rounded-xl bg-amber-50 p-4"><summary className="cursor-pointer font-bold">保存・取り込み時の注意</summary><p>端末の故障・紛失、サイトデータの消去、プライベートブラウズの終了、OSによる保存領域の削除までは保証できません。十分な空き容量を確保し、同じ端末・同じURL・同じ開き方で使ってください。未送信がある間はサイトデータを消去しないでください。</p><p>ここで取り込むのは受付申請です。出番表への反映は下の申請一覧で行います。オフラインで精算確定・入金は行いません。</p></details>
 <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={()=>void run(refresh)}>本部の受付状況を確認する</button><button type="button" className={button+' bg-blue-800 text-white'} disabled={busy||!data||!count('queued')} onClick={()=>void run((token,current)=>send(token,current))}>確認した未送信分を申請一覧へ取り込む</button></div>
 {[...receipts].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(receipt=><section key={receipt.id} className="space-y-3 rounded-xl border-2 p-4"><h3 className="break-all text-lg font-bold">受付番号：{receipt.id}</h3><p>{new Date(receipt.createdAt).toLocaleString('ja-JP')}</p>{receipt.items.map((item,index)=>{const summary=winterDraftSummary(item.draft);return <article key={summary.id} className={`space-y-2 rounded-lg border-2 p-3 ${item.status==='sent'?'bg-green-50':['review','unknown'].includes(item.status)?'border-amber-600 bg-amber-50':'bg-white'}`}><h4 className="text-xl font-bold">{statusLabel[item.status]} ／ {summary.organizationName} ／ {summary.type}</h4><p>{summary.label}</p><p>受付に来た方：{summary.visitorName} ／ {summary.category} ／ ¥{summary.total.toLocaleString('ja-JP')}</p><p className="break-all text-sm">申請ID：{summary.id}</p><p role="status">{item.message}</p>
 {item.locked&&['unknown','review'].includes(item.status)&&<div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy} onClick={()=>void run(refresh)}>結果を確認する</button><button type="button" className={button} disabled={busy||!data} onClick={()=>void run((token,current)=>send(token,current,{id:receipt.id,index}))}>同じ受付番号で取り込みを再試行</button></div>}
 {!item.locked&&!['sent','cancelled'].includes(item.status)&&data&&<OfflineItemEditor key={receipt.revision+':'+index} item={item} data={data} disabled={busy} onSave={(draft,reason)=>void run(async(_token,current)=>{const next:OfflineItem={...item,draft,context:draftContext(draft,data),status:'queued',message:'管理者が訂正・確認しました。送信前に再照合します',history:[...item.history,{at:new Date().toISOString(),note:reason,draft:item.draft}]};await updateOfflineItem(receipt,index,next);const rows=await listOfflineReceipts();if(current()){setReceipts(rows);setData(null)}})} onCancel={reason=>void run(async(_token,current)=>{if(window.confirm('この申請を本部へ送らず、端末内で取下げにします。記録は残します。')){await updateOfflineItem(receipt,index,{...item,status:'cancelled',message:'端末内で取下げ（本部未送信）：'+reason,history:[...item.history,{at:new Date().toISOString(),note:reason}]});const rows=await listOfflineReceipts();if(current()){setReceipts(rows);setData(null)}}})}/>}
 </article>})}</section>)}
 </div></>}
 {busy&&<p role="status" className="rounded-xl bg-blue-100 p-4 text-lg font-bold">{message||'処理中…'}</p>}{!busy&&message&&<p role="status" className="rounded-xl bg-blue-50 p-4">{message}</p>}{error&&<div role="alert" className="space-y-2 rounded-xl bg-red-100 p-4 text-lg"><p>{error} 保存済み受付は消していません。</p>{!unlocked&&<button type="button" className={button} disabled={busy} onClick={()=>setReload(v=>v+1)}>端末の受付を読み直す</button>}</div>}
 </section>
}
function OfflineItemEditor({item,data,disabled,onSave,onCancel}:{item:OfflineItem;data:WinterData;disabled:boolean;onSave:(draft:WinterDraft,reason:string)=>void;onCancel:(reason:string)=>void}){
 const d=item.draft,target=d.type==='add'?d.input:d.type==='change'?d.input.target:null,original=d.type==='change'?d.input.original:d.type==='withdraw'?d.entry:null
 const[org,setOrg]=useState(winterDraftSummary(d).organizationId),[rider,setRider]=useState(target?.rider.id??original?.rider_id??''),[horse,setHorse]=useState(target?.horse.id??original?.horse_id??''),[competition,setCompetition]=useState(target?.competition.id??original?.competition_id??''),[entry,setEntry]=useState(original?.entry_id??''),[visitor,setVisitor]=useState(winterDraftSummary(d).visitorName)
 const[selection,setSelection]=useState<WinterFeeSelection>(target?.selection??{}),[fromSelection,setFromSelection]=useState<WinterFeeSelection>(d.type==='change'?d.input.fromSelection:{}),[reason,setReason]=useState(''),[accepted,setAccepted]=useState(false)
 const[error,setError]=useState('')
 function draft():WinterDraft{
  const organization=data.organizations.find(r=>r.id===org),r=data.riders.find(r=>r.id===rider),h=data.horses.find(r=>r.id===horse),c=data.competitions.find(r=>r.id===competition),e=data.entries.find(r=>r.entry_id===entry)
  if(!visitor.trim())throw new Error('受付に来た方のお名前を入力してください')
  if(d.type==='withdraw'){if(!e||!organization||e.organization_id!==org)throw new Error('対象の出番と団体を確認してください');return {...d,entry:e,organizationId:org,organizationName:organization.name,riderName:data.riders.find(r=>r.id===e.rider_id)?.name??'',horseName:data.horses.find(h=>h.id===e.horse_id)?.name??'',visitorName:visitor.trim()}}
  if(!organization||!r||!h||!c||!target)throw new Error('名簿・競技から選択してください')
  const next={...target,organization,rider:r,horse:h,competition:c,selection,visitorName:visitor.trim()}
  if(d.type==='add')return {type:'add',input:next}
  const from=data.competitions.find(c=>c.id===e?.competition_id);if(!e||!from)throw new Error('変更元の出番を選んでください')
  return {type:'change',input:{...d.input,original:e,from,fromSelection:{...fromSelection,isOp:!!e.is_op},target:next}}
 }
 let amount:string;try{amount='¥'+winterDraftSummary(draft()).total.toLocaleString('ja-JP')}catch{amount='入力内容を確認してください'}
 const select=(label:string,value:string,change:(v:string)=>void,rows:{id:string;name:string}[])=><label className="block">{label}<select className={field} value={value} disabled={disabled} onChange={e=>{change(e.target.value);setAccepted(false)}}><option value="">選択してください</option>{rows.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
 function fees(label:string,value:WinterFeeSelection,change:(v:WinterFeeSelection)=>void){return <fieldset className="space-y-2 border p-3"><legend>{label}</legend><label>会員区分<select className={field} value={value.membership??''} onChange={e=>{change({...value,membership:e.target.value==='member'?'member':e.target.value==='nonmember'?'nonmember':undefined});setAccepted(false)}}><option value="">区分なし</option><option value="member">会員</option><option value="nonmember">非会員</option></select></label><label className="flex min-h-12 items-center gap-3"><input className="size-6" type="checkbox" checked={!!value.isOp} onChange={e=>{change({...value,isOp:e.target.checked});setAccepted(false)}}/>OP参加</label><label className="flex min-h-12 items-center gap-3"><input className="size-6" type="checkbox" checked={!!value.instructorConfirmed} onChange={e=>{change({...value,instructorConfirmed:e.target.checked});setAccepted(false)}}/>地域乗馬指導者資格を確認済み</label></fieldset>}
 return <details className="rounded-lg border-2 p-3"><summary className="cursor-pointer text-lg font-bold">管理者：この申請を訂正・確認／取下げ</summary><fieldset disabled={disabled} className="mt-3 space-y-3">
 {select('団体',org,setOrg,data.organizations)}
 {original&&select('変更・棄権対象の出番',entry,setEntry,data.entries.filter(e=>!['wd','withdrawn'].includes(e.status.toLowerCase())).map(e=>({id:e.entry_id,name:`${e.organization_name} ／ 第${e.competition_no}競技 ${e.start_order}番 ／ ${data.riders.find(r=>r.id===e.rider_id)?.name} ／ ${data.horses.find(h=>h.id===e.horse_id)?.name}`})))}
 {target&&<>{select('競技',competition,setCompetition,data.competitions.map(c=>({id:c.id,name:`第${c.competition_no}競技 ${c.name}`})))}{select('選手',rider,setRider,data.riders)}{select('馬',horse,setHorse,data.horses)}{d.type==='change'&&fees('変更前の参加区分',fromSelection,setFromSelection)}{fees('変更後・追加の参加区分',selection,setSelection)}</>}
 <label className="block">受付に来た方<input className={field} maxLength={100} value={visitor} onChange={e=>{setVisitor(e.target.value);setAccepted(false)}}/></label><p className="text-xl font-bold">訂正後の申請金額：{amount}</p><label className="block">訂正・確認・取下げの理由<input className={field} value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label><label className="flex min-h-14 items-center gap-3"><input type="checkbox" className="size-6" checked={accepted} onChange={e=>setAccepted(e.target.checked)}/>受付者と確認し、最新の出番・所属・参加区分・金額で取り込む内容を確認しました</label>
 <div className="flex flex-wrap gap-3"><button className={button} disabled={!accepted||!reason.trim()||disabled} onClick={()=>{try{const next=draft();winterDraftSummary(next);onSave(next,reason.trim())}catch(e){setError(e instanceof Error?e.message:'訂正内容を確認してください')}}}>訂正・確認内容を端末に保存</button><button className={button} disabled={!reason.trim()||disabled} onClick={()=>{if(window.confirm('この申請を本部へ送らず、端末内で取下げにします。記録は残します。'))onCancel(reason.trim())}}>本部に送らず取下げ</button></div>{error&&<p role="alert" className="bg-red-100 p-3">{error}</p>}
 </fieldset></details>
}
