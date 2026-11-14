"use client"
import {WinterInitialEntryRegistration} from './winter-initial-entry-registration'
import {useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import type {loadWinterData} from '@/lib/winter-data'
import {winterAllowsOp,winterCompetition,type WinterFeeSelection} from '@/lib/winter-event'
import {RosterOptions} from '@/components/master/roster-options'
import {winterAffiliatedOrganizations,winterCompetitionLabel} from '@/lib/winter-display-order'
import {reviewWinterChange} from '@/lib/winter-change'
import {reviewSettlementChange,saveWinterSettlementActions,type WinterSettlementAction} from '@/lib/winter-settlement-actions'
import {WinterInitialBatchFailure} from '@/lib/winter-initial-entry'
type Data=Awaited<ReturnType<typeof loadWinterData>>
const field='mt-2 min-h-14 w-full rounded-xl border-2 p-3 text-xl',button='min-h-14 rounded-xl border-2 border-blue-800 bg-blue-800 p-3 text-xl font-bold text-white disabled:opacity-50'
type Item={row:WinterSettlementAction;label:string}
type Props={data:Data;session:AdminSession;onSession:(s:AdminSession)=>void;onChanged:()=>void}
export function WinterPostRegistration(props:Props & {onChooseParticipants:()=>void}){
 const [mode,setMode]=useState<'add'|'change'>('add')
 return <section className="space-y-4" aria-label="事後登録">
  <h2 className="text-2xl font-bold">事後登録（追加・変更）</h2>
  <fieldset className="flex gap-3"><legend className="mb-2 text-lg font-bold">登録内容</legend>
   {(['add','change'] as const).map(value=><label key={value} className="flex min-h-14 items-center gap-3 rounded-xl border-2 px-5 text-xl font-bold">
    <input className="size-6" type="radio" name="winter-post-registration-mode" checked={mode===value} onChange={()=>setMode(value)}/>{value==='add'?'追加・再走行':'変更'}
   </label>)}
  </fieldset>
  <div hidden={mode!=='add'}><WinterInitialEntryRegistration settlementOnly data={props.data} session={props.session} onChanged={props.onChanged} onChooseParticipants={props.onChooseParticipants}/></div>
  <div hidden={mode!=='change'}><WinterSettlementChanges {...props}/></div>
 </section>
}
function WinterSettlementChanges({data,session,onSession,onChanged}:Props){
 const[org,setOrg]=useState(''),[entryId,setEntry]=useState(''),[compId,setComp]=useState(''),[riderId,setRider]=useState(''),[horseId,setHorse]=useState('')
 const[fromSelection,setFrom]=useState<WinterFeeSelection>({}),[selection,setSelection]=useState<WinterFeeSelection>({}),[visitor,setVisitor]=useState(session.email??''),[note,setNote]=useState('')
 const[review,setReview]=useState<Item|null>(null),[staged,setStaged]=useState<Item[]>([]),[busy,setBusy]=useState(false),[uncertain,setUncertain]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),lock=useRef(false)
 const original=data.entries.find(x=>x.entry_id===entryId),from=data.competitions.find(x=>x.id===original?.competition_id),comp=data.competitions.find(x=>x.id===compId),rider=data.riders.find(x=>x.id===riderId),horse=data.horses.find(x=>x.id===horseId)
 const orgName=(id:string)=>data.organizations.find(x=>x.id===id)?.name??'所属未確認'
 const entries=data.entries.filter(x=>!['wd','withdrawn'].includes(x.status.toLowerCase())&&data.riders.find(r=>r.id===x.rider_id)?.organization_id===org&&!staged.some(s=>s.row.inputs.entryId===x.entry_id))
 const labelEntry=(id:string)=>{const e=data.entries.find(x=>x.entry_id===id),c=data.competitions.find(x=>x.id===e?.competition_id);return e&&c?`${winterCompetitionLabel(c)} ／ ${e.start_order??'―'}番 ／ ${data.riders.find(x=>x.id===e.rider_id)?.name} ／ ${data.horses.find(x=>x.id===e.horse_id)?.name}${e.is_op?'（OP）':''}`:''}
 function choose(id:string){const e=data.entries.find(x=>x.entry_id===id);setEntry(id);setComp(e?.competition_id??'');setRider(e?.rider_id??'');setHorse(e?.horse_id??'');setFrom({isOp:!!e?.is_op});setSelection({isOp:!!e?.is_op});setReview(null);setError('');setMessage('')}
 function confirm(){setError('');try{
  if(!original||!from)throw new Error('対象の出番を選択してください')
  const organization=data.organizations.find(x=>x.id===horse?.organization_id)
  if(!organization||!rider||!horse||!comp)throw new Error('変更後の競技・人馬を選択してください')
  const input={original:{...original},from:{...from},fromSelection:{...fromSelection},target:{id:crypto.randomUUID(),organization,competition:comp,rider,horse,visitorName:visitor,selection:{...selection}}}
  const row=reviewSettlementChange(input,note)
  const fee=reviewWinterChange(input,{allowCrossClub:true})
  const label=`変更前：${labelEntry(original.entry_id)} → 変更後：${winterCompetitionLabel(comp)} ／ ${rider.name} ／ ${horse.name}${selection.isOp?'（OP）':''} ／ 請求先：${orgName(rider.organization_id)} ／ ${fee.treatedAsWithdrawAdd?'追加料金扱い':fee.fee.total===0?'無料変更':'変更手数料＋増額差分'} ${row.inputs.expectedTotal?.toLocaleString('ja-JP')}円`
  setReview({row,label})
 }catch(e){setError(e instanceof Error?e.message:'内容を確認してください')}}
 async function save(){if(lock.current||!staged.length)return;lock.current=true;setBusy(true);setError('');setMessage('');try{const verified=await verifyAdminSession(session);onSession(verified);await saveWinterSettlementActions(staged.map(x=>x.row),verified.accessToken);setMessage(`${staged.length}件の現場変更を精算に保存しました。続けて次の変更を入力できます。`);setStaged([]);setUncertain(false);onChanged()}catch(e){setUncertain(e instanceof WinterInitialBatchFailure&&e.uncertain);setError(e instanceof Error?e.message:'保存を確認できません')}finally{lock.current=false;setBusy(false)}}
 return <section className="space-y-4 rounded-xl border-2 border-orange-300 p-4"><h2 className="text-2xl font-bold">現場変更を精算に登録</h2><p className="rounded-xl bg-orange-100 p-4 text-xl">出番表は変更しません。フレンドシップ間の変更は無料です。その他の変更は2,000円＋競技料の増額分、競技・選手・馬のうち2項目以上の変更は3,000円＋変更後競技料。</p><p>同じ出番への精算専用変更は1件です。訂正する場合は精算欄の現場履歴を取り消してから登録し直してください。</p><fieldset disabled={busy||uncertain} className="space-y-3">{review?<div className="space-y-3 rounded-xl bg-blue-50 p-4"><h3 className="text-2xl font-bold">確認内容</h3><p className="text-xl">{review.label}</p><p>受付担当者：{review.row.inputs.visitorName} ／ 理由：{review.row.note}</p><button className={button} onClick={()=>{setStaged(x=>[...x,review]);setReview(null);choose('');setNote('')}}>確認一覧に追加して入力を続ける</button><button className={button} onClick={()=>setReview(null)}>入力へ戻る</button></div>:<>
 <label className="block text-xl">元の出番の所属団体<select className={field} value={org} onChange={e=>{setOrg(e.target.value);choose('')}}><option value="">団体を選択</option>{data.organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
 <label className="block text-xl">対象の出番<select className={field} value={entryId} onChange={e=>choose(e.target.value)}><option value="">出番を選択</option>{entries.map(e=><option key={e.entry_id} value={e.entry_id}>{labelEntry(e.entry_id)}</option>)}</select></label>{org&&!entries.length&&<p>対象の出番はありません。正式出番が登録されると選択できます。</p>}
 {original&&from&&<><FeeCategory label="変更前" competition={from} value={fromSelection} onChange={setFrom}/><label className="block text-xl">変更後の競技<select className={field} value={compId} onChange={e=>{setComp(e.target.value);setSelection({})}}>{data.competitions.map(c=><option key={c.id} value={c.id}>{winterCompetitionLabel(c)}</option>)}</select></label><label className="block text-xl">変更後の馬<select className={field} value={horseId} onChange={e=>setHorse(e.target.value)}><RosterOptions members={data.horses} groups={winterAffiliatedOrganizations(data)}/></select></label><label className="block text-xl">騎乗する選手<select className={field} value={riderId} onChange={e=>setRider(e.target.value)}><RosterOptions members={data.riders} groups={winterAffiliatedOrganizations(data)}/></select></label>{rider&&<p>変更料金の請求先：{orgName(rider.organization_id)}</p>}{comp&&<FeeCategory label="変更後" competition={comp} value={selection} onChange={setSelection} editableOp/>}</>}
 <label className="block text-xl">受付担当者<input className={field} maxLength={100} value={visitor} onChange={e=>setVisitor(e.target.value)}/></label><label className="block text-xl">受付内容・理由<textarea className={field} maxLength={500} value={note} onChange={e=>setNote(e.target.value)}/></label><button className={button} disabled={!original} onClick={confirm}>内容と料金を確認</button></>}
 </fieldset>{staged.length>0&&<section className="space-y-3 rounded-xl border-2 p-4"><h3 className="text-2xl font-bold">確認一覧（{staged.length}件・まだ未保存）</h3>{staged.map(x=><div key={x.row.id} className="space-y-2 border-b p-3"><p>{x.label}</p><p>{x.row.note}</p><button className={button} disabled={busy||uncertain} onClick={()=>setStaged(items=>items.filter(i=>i.row.id!==x.row.id))}>一覧から外す</button></div>)}<p className="text-xl font-bold">合計 {staged.reduce((n,x)=>n+(x.row.inputs.expectedTotal??0),0).toLocaleString('ja-JP')}円</p><p>全件成功または全件未保存です。保存結果未確認の場合は入力を固定し、同じ登録番号で再確認します。</p><button className={button} disabled={busy} onClick={()=>void save()}>{busy?'保存内容を確認中…':uncertain?'同じ一覧で保存を再確認':'この一覧を精算だけに保存'}</button></section>}{error&&<p role="alert" className="rounded-xl bg-red-100 p-3">{error}</p>}{message&&<p role="status">{message}</p>}</section>
}
function FeeCategory({label,competition:c,value,onChange,editableOp=false}:{label:string;competition:Data['competitions'][number];value:WinterFeeSelection;onChange:(value:WinterFeeSelection)=>void;editableOp?:boolean}){return <div className="space-y-3 rounded-xl border p-3"><h3 className="text-xl font-bold">{label}の料金区分</h3>{(c.member_fee!==null||c.nonmember_fee!==null)&&<label className="block">会員区分<select className={field} value={value.membership??''} onChange={e=>onChange({...value,membership:e.target.value==='member'?'member':e.target.value==='nonmember'?'nonmember':undefined})}><option value="">選択してください</option><option value="member">会員</option><option value="nonmember">非会員</option></select></label>}{winterCompetition(c.competition_no).instructorRequired&&<label className="flex items-center gap-3"><input type="checkbox" className="size-7" checked={!!value.instructorConfirmed} onChange={e=>onChange({...value,instructorConfirmed:e.target.checked})}/>地域乗馬指導者資格を確認しました</label>}{editableOp&&winterAllowsOp(c.competition_no,c.official,c.op_fee)?<label className="flex items-center gap-3"><input type="checkbox" className="size-7" checked={!!value.isOp} onChange={e=>onChange({...value,isOp:e.target.checked})}/>OP参加</label>:<p>出場区分：{value.isOp?'OP':'通常'}</p>}</div>}
