"use client"
import {useEffect,useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {prepareReception,readPreparation,listOfflineReceipts,offlineStatusLabel,offlineUrgentNotice,draftContext,type WinterPreparation,type WinterOfflineReceipt,type OfflineItem,type WinterData} from '@/lib/winter-offline'
import {reviewOfflineReceipts,sendOfflineItem,updateOfflineItem} from '@/lib/winter-offline-sync'
import {winterDraftSummary,type WinterDraft} from '@/lib/winter-batch'
import type {WinterFeeSelection} from '@/lib/winter-event'
const button='min-h-14 rounded-xl border-2 border-blue-800 bg-white px-4 py-3 text-lg font-bold text-blue-900 disabled:opacity-50'
const field='mt-1 min-h-12 w-full rounded-lg border-2 bg-white p-2 text-lg'
export function WinterOfflineReception({session,onSession,active,onChanged}:{session:AdminSession;onSession:(s:AdminSession)=>void;active:boolean;onChanged:()=>void}){
 const[p,setP]=useState<WinterPreparation|null>(null),[receipts,setReceipts]=useState<WinterOfflineReceipt[]>([]),[data,setData]=useState<WinterData|null>(null)
 const[unlocked,setUnlocked]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),lock=useRef(false),alive=useRef(active)
 useEffect(()=>{alive.current=active;setUnlocked(false);setReceipts([]);setData(null);const hide=()=>{if(document.hidden){setUnlocked(false);setReceipts([]);setData(null)}};document.addEventListener('visibilitychange',hide);return()=>{alive.current=false;document.removeEventListener('visibilitychange',hide)}},[active])
 async function run(fn:(token:string)=>Promise<void>){if(lock.current||!active)return;lock.current=true;setBusy(true);setError('');try{const s=await verifyAdminSession(session);onSession(s);if(!alive.current)return;await fn(s.accessToken)}catch(e){if(alive.current)setError(e instanceof Error?e.message:'処理できません')}finally{lock.current=false;if(alive.current)setBusy(false)}}
 async function open(){await run(async()=>{const [next,rows]=await Promise.all([readPreparation(),listOfflineReceipts()]);if(alive.current){setP(next);setReceipts(rows);setUnlocked(true)}})}
 async function refresh(token:string){const result=await reviewOfflineReceipts(token);if(alive.current){setReceipts(result.receipts);setData(result.data);setMessage('最新の本部データと照合しました。内容を確認して送信してください')}}
 async function send(token:string,only?:{id:string;index:number}){
  const targets=only?[only]:receipts.flatMap(r=>r.items.flatMap((i,index)=>i.status==='queued'?[{id:r.id,index}]:[]))
  for(const t of targets){if(!alive.current)break;setMessage(`本部へ確認・送信中（受付番号：${t.id}）`);await sendOfflineItem(t.id,t.index,token)}
  if(alive.current){setReceipts(await listOfflineReceipts());setMessage('送信処理を終えました。各申請の状態を確認してください。出番表への反映は本部の申請一覧から行います');onChanged()}
 }
 if(!active)return null
 return <div className="space-y-5"><h2 className="text-2xl font-bold">預かっている受付を確認・送信</h2>
 <p>このiPadの保存内容を管理者だけが確認します。通信復旧だけでは送信しません。</p>
 {!unlocked?<button className={button} disabled={busy} onClick={()=>void open()}>{busy?'管理者権限を確認中…':'管理者として端末の保存内容を開く'}</button>:<>
 <section className="space-y-3 rounded-xl border-2 p-4"><h3 className="text-xl font-bold">受付開始前の準備</h3><p>{p?`${p.eventName} ／ データ取得：${new Date(p.retrievedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}`:'このiPadは未準備です'}</p><p>準備完了後は、通信中も受付を端末に預かります。開始前にSafariまたはホーム画面の、当日使用する方で準備してください。</p><button className={button+' bg-blue-50'} disabled={busy} onClick={()=>void run(async()=>{setMessage('画面・名簿・競技・料金・出番を保存し、読み戻しています…');const next=await prepareReception();if(alive.current){setP(next);setMessage('オフライン受付の準備が完了しました。受付画面を開いて確認してください')}})}>{busy?'処理中…':'このiPadでオフライン受付を準備・更新'}</button><a href="/winter" className={button+' inline-block'}>管理画面を閉じ、来訪者用の受付へ</a></section>
 <div className="space-y-2 rounded-xl bg-amber-50 p-4"><p className="font-bold">{offlineUrgentNotice}</p><p>端末の故障・紛失、サイトデータの消去、プライベートブラウズの終了、OSによる保存領域の削除までは保証できません。十分な空き容量を確保し、同じ端末・同じURL・同じ開き方で使ってください。未送信がある間はサイトデータを消去しないでください。</p><p>ここで保存・送信するのは受付申請です。オフラインで精算確定・入金は行いません。</p></div>
 <div className="flex flex-wrap gap-3"><button className={button} disabled={busy} onClick={()=>void run(refresh)}>最新の本部データと照合・結果確認</button><button className={button+' bg-blue-800 text-white'} disabled={busy||!data||!receipts.some(r=>r.items.some(i=>i.status==='queued'))} onClick={()=>void run(token=>send(token))}>内容を確認した未送信分を本部へまとめて送信</button></div>
 <p>未送信 {receipts.reduce((n,r)=>n+r.items.filter(i=>i.status==='queued').length,0)}件 ／ 要確認 {receipts.reduce((n,r)=>n+r.items.filter(i=>i.status==='review').length,0)}件 ／ 結果確認待ち {receipts.reduce((n,r)=>n+r.items.filter(i=>i.status==='unknown').length,0)}件 ／ 送信済み {receipts.reduce((n,r)=>n+r.items.filter(i=>i.status==='sent').length,0)}件</p>
 {!receipts.length&&<p>この端末に預かっている受付はありません。</p>}
 {[...receipts].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)).map(receipt=><section key={receipt.id} className="space-y-3 rounded-xl border-2 p-4"><h3 className="break-all text-lg font-bold">受付番号：{receipt.id}</h3><p>{new Date(receipt.createdAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>{receipt.items.map((item,index)=>{const summary=winterDraftSummary(item.draft);return <article key={summary.id} className={`space-y-2 rounded-lg border-2 p-3 ${item.status==='sent'?'bg-green-50':['review','unknown'].includes(item.status)?'border-amber-600 bg-amber-50':'bg-white'}`}><h4 className="text-xl font-bold">{offlineStatusLabel[item.status]} ／ {summary.organizationName} ／ {summary.type}</h4><p>{summary.label}</p><p>受付に来た方：{summary.visitorName} ／ {summary.category} ／ ¥{summary.total.toLocaleString('ja-JP')}</p><p className="break-all text-sm">申請ID：{summary.id}</p><p role="status">{item.message}</p>
 {item.locked&&['unknown','review'].includes(item.status)&&<button className={button} disabled={busy} onClick={()=>void run(token=>send(token,{id:receipt.id,index}))}>同じ番号で結果確認・再送</button>}
 {!item.locked&&!['sent','cancelled'].includes(item.status)&&data&&<OfflineItemEditor key={receipt.revision+':'+index} item={item} data={data} disabled={busy} onSave={(draft,reason)=>void run(async()=>{const next:OfflineItem={...item,draft,context:draftContext(draft,data),status:'queued',message:'管理者が訂正・確認しました。送信前に再照合します',history:[...item.history,{at:new Date().toISOString(),note:reason,draft:item.draft}]};await updateOfflineItem(receipt,index,next);setReceipts(await listOfflineReceipts());setData(null)})} onCancel={reason=>void run(async()=>{await updateOfflineItem(receipt,index,{...item,status:'cancelled',message:'端末内で取下げ（本部未送信）：'+reason,history:[...item.history,{at:new Date().toISOString(),note:reason}]});setReceipts(await listOfflineReceipts());setData(null)})}/>}
 </article>})}</section>)}
 </>}
 {busy&&<p role="status" className="rounded-xl bg-blue-100 p-4 text-lg font-bold">{message||'処理中…'}</p>}{!busy&&message&&<p role="status" className="rounded-xl bg-blue-50 p-4">{message}</p>}{error&&<p role="alert" className="rounded-xl bg-red-100 p-4 text-lg">{error} 保存済み受付は消していません。</p>}
 </div>
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
