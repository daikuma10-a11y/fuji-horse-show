"use client"

import {MasterRequestGroups,MasterRequestCard} from './master/request-list'
import {MasterRequestActions,MasterRequestGroupHeader,MasterRequestPlacementNotice} from './master/request-actions'
import {winterRequestPositionTarget,reflectWinterMasterRequest,cancelWinterMasterRequest,reflectWinterGroup,WinterGroupReflectError} from '@/lib/winter-request-actions'
import { useEffect, useRef, useState } from 'react'
import { verifyAdminSession, type AdminSession } from '@/lib/supabase-rest'
import { loadWinterData } from '@/lib/winter-data'
import { loadWinterRequests, submitWinterWithdraw, type WinterRequestRow } from '@/lib/winter-reception'

type Data = Awaited<ReturnType<typeof loadWinterData>>
type Props = { mode?: "admin" | "withdraw"; initialOrgId?: string; session: AdminSession; onSession: (session: AdminSession) => void; data: Data; refresh: number; onChanged: () => void; showWithdraw?: boolean }
const button = 'min-h-14 rounded-xl border-2 border-blue-800 bg-blue-800 p-3 text-xl font-bold text-white disabled:opacity-50'

export function WinterRequestPanel({ mode = "admin", initialOrgId, session, onSession, data, refresh, onChanged, showWithdraw = true }: Props) {
  const [requests, setRequests] = useState<WinterRequestRow[]>([])
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [reload, setReload] = useState(0)
  const [orgId, setOrgId] = useState(initialOrgId ?? '')
  const [entryId, setEntryId] = useState('')
  const [visitorName, setVisitorName] = useState('')
  const [review, setReview] = useState<{ id: string; entryId: string; visitorName: string } | null>(null)
  const [positions,setPositions]=useState<Record<string,string>>({}),[batchResult,setBatchResult]=useState(''),[batchApplying,setBatchApplying]=useState(false),[applyingId,setApplyingId]=useState<string|null>(null),[progress,setProgress]=useState(0),[actionErrors,setActionErrors]=useState<Record<string,string>>({})
  const lock = useRef(false)
  const [restore,setRestore]=useState<{id:string;reason:string;attempted:boolean}|null>(null)
  useEffect(() => { setOrgId(initialOrgId ?? ""); setEntryId(""); setReview(null) }, [initialOrgId])
  useEffect(() => {
    let active = true
    setLoaded(false); setError('')
    loadWinterRequests(session.accessToken).then(rows => { if (active) { setRequests(rows); setLoaded(true) } }).catch(reason => { if (active) setError(reason instanceof Error ? reason.message : '一覧を取得できません') })
    return () => { active = false }
  }, [session.accessToken, refresh, reload])
  const orgName = (id: string) => data.organizations.find(row => row.id === id)?.name ?? '所属を確認してください'
  const entryLabel = (id: string) => {
    const entry = data.entries.find(row => row.entry_id === id)
    if (!entry) return '対象人馬を確認してください'
    const competition = data.competitions.find(row => row.id === entry.competition_id)
    return `第${competition?.competition_no}競技・${entry.start_order ?? '―'}番　${data.riders.find(row => row.id === entry.rider_id)?.name} ／ ${data.horses.find(row => row.id === entry.horse_id)?.name}${entry.is_op ? '（OP）' : ''}`
  }
  async function run(action: (token: string) => Promise<unknown>, success: string, onFailure?:(reason:unknown)=>void) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const verified = await verifyAdminSession(session); onSession(verified)
      await action(verified.accessToken)
      setMessage(success); setReview(null); setReload(value => value + 1); onChanged()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '処理できませんでした。同じ内容で再試行してください');onFailure?.(reason) }
    finally { lock.current = false; setBusy(false) }
  }
  async function reflect(row:WinterRequestRow){
    if(lock.current||batchResult||restore)return
    const value=positions[row.id],position=value?Number(value):null
    if(position!==null&&(!Number.isSafeInteger(position)||position<1)){setActionErrors(previous=>({...previous,[row.id]:'反映位置を確認してください'}));return}
    setApplyingId(row.id);setActionErrors(previous=>({...previous,[row.id]:''}))
    await run(token=>reflectWinterMasterRequest(row.id,position,token),'出番表へ反映しました',reason=>setActionErrors(previous=>({...previous,[row.id]:reason instanceof Error?reason.message:'反映結果を確認してください'})))
    setApplyingId(null)
  }
  async function reflectGroup(){
    if(lock.current||batchResult||restore)return
    lock.current=true;setBusy(true);setBatchApplying(true);setError('');setMessage('');setProgress(0)
    const selected=requests.filter(row=>row.organization_id===orgId&&row.status==='pending')
    try{const verified=await verifyAdminSession(session);onSession(verified);await reflectWinterGroup(selected,orgId,{...positions},verified.accessToken,(id,index)=>{setApplyingId(id);setProgress(index)});setMessage('この団体の未反映申請を出番表へ反映しました');setReload(value=>value+1);onChanged()}
    catch(reason){setBatchResult(reason instanceof Error?reason.message:'団体の一括反映に失敗しました');if(reason instanceof WinterGroupReflectError)setActionErrors(previous=>({...previous,[reason.failedId]:reason.message}))}
    finally{lock.current=false;setBusy(false);setBatchApplying(false);setApplyingId(null)}
  }
  async function cancel(){
    if(!restore||lock.current)return
    if(!restore.reason.trim()||restore.reason.trim().length>300){setActionErrors(previous=>({...previous,[restore.id]:'取消理由は1〜300文字で入力してください'}));return}
    const frozen={...restore,attempted:true};setRestore(frozen);setApplyingId(frozen.id);setActionErrors(previous=>({...previous,[frozen.id]:''}))
    await run(async token=>{await cancelWinterMasterRequest(frozen.id,frozen.reason,token);setRestore(null)},'申請を取り消しました。復元対象の人馬は最後尾へ戻しました',reason=>{setActionErrors(previous=>({...previous,[frozen.id]:reason instanceof Error?reason.message:'取消結果を確認できません'}));const status=(reason as {status?:number})?.status;if(status&&status>=400&&status<500)setRestore({...frozen,attempted:false})})
    setApplyingId(null)
  }
  const activeEntries = data.entries.filter(row => !['wd','withdrawn'].includes(row.status.toLowerCase()) && (!orgId || data.riders.find(rider => rider.id === row.rider_id)?.organization_id === orgId))
  return <div className="space-y-5 border-t-2 pt-5">
    {mode === "admin" && <>
    <h2 className="text-2xl font-bold">本部：申請一覧・出番表への反映</h2>
    <p>反映前は「未反映」、反映後も一覧に残します。反映ボタンは出番表を変更します。</p>
    <button className={button} disabled={busy||!!restore?.attempted} onClick={() => { setReload(value => value + 1); onChanged() }}>最新の情報を確認</button>
    {!loaded&&!error&&<p role="status">申請一覧を読み込んでいます…</p>}
    {loaded&&!requests.length&&<p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-10 text-center text-xl text-muted-foreground">まだ受付された申請はありません。受付タブレットから追加・変更・棄権を申請すると、ここに表示されます。</p>}
    {loaded&&requests.length>0&&!orgId&&<MasterRequestGroups groups={data.organizations.filter(o=>requests.some(q=>q.organization_id===o.id)).map(o=>({id:o.id,name:o.name,pending:requests.filter(q=>q.organization_id===o.id&&q.status==='pending').length}))} onSelect={id=>{setOrgId(id);setEntryId('');setReview(null)}}/>}
    {loaded&&orgId&&<><button type="button" disabled={busy||!!restore} onClick={()=>setOrgId('')} className="w-fit min-h-12 rounded-xl border-2 border-border bg-card px-5 py-3 text-xl font-bold">← 団体一覧へ</button><MasterRequestGroupHeader name={orgName(orgId)} count={requests.filter(q=>q.organization_id===orgId).length} pending={requests.filter(q=>q.organization_id===orgId&&q.status==='pending').length} disabled={busy||!!restore||!!batchResult} batchApplying={batchApplying} progress={progress} batchResult={batchResult} onReflectGroup={()=>void reflectGroup()} onReload={()=>{setBatchResult('');setReload(value=>value+1);onChanged()}}/><MasterRequestPlacementNotice/></>}
    {loaded&&orgId&&requests.filter(row=>row.organization_id===orgId).map(row=>{
      const comp=(id:string)=>{const c=data.competitions.find(c=>c.id===id);return c?`競技${c.competition_no}. ${c.name}${c.official?'（★公認）':''}`:'―'},rider=(id:string)=>data.riders.find(r=>r.id===id)?.name??'―',horse=(id:string)=>data.horses.find(h=>h.id===id)?.name??'―';
      return <MasterRequestCard key={row.id} request={{type:row.request_type,status:row.status,organization:orgName(row.organization_id),createdAt:row.created_at,actor:row.payload.visitorName,actorLabel:'受付担当者',before:row.payload.before?{competition:comp(row.payload.before.competitionId),rider:rider(row.payload.before.riderId),horse:horse(row.payload.before.horseId),isOp:row.payload.before.isOp}:undefined,after:{competition:comp(row.target_competition_id),rider:rider(row.rider_id),horse:horse(row.horse_id),isOp:row.payload.add?.isOp??row.payload.change?.toIsOp??row.payload.before?.isOp},note:row.payload.add?.note,changedFields:row.payload.changedFields?.map(field=>({competition:'競技変更',player:'選手変更',horse:'馬変更',op:'参加区分変更',membership:'会員区分変更'}[field]??field)),treatedAsWithdrawAdd:row.payload.treatedAsWithdrawAdd,amount:row.fee_amount}} actions={<MasterRequestActions status={row.status} type={row.request_type} target={winterRequestPositionTarget(row,data)} normalChange={row.request_type==='change'&&!row.payload.treatedAsWithdrawAdd} position={positions[row.id]??''} disabled={busy||!!batchResult||(!!restore&&restore.id!==row.id)} reflectDisabled={busy||!!batchResult||!!restore} isApplying={applyingId===row.id} error={actionErrors[row.id]} confirmCancel={restore?.id===row.id} cancelReason={restore?.reason??''} cancelLocked={restore?.id===row.id&&restore.attempted} cancelHint="追加は出番と追加料金から外します。変更・棄権は変更前の人馬を最後尾へ戻します。保存済みの料金・入金履歴は削除せず、取消申請を精算対象から外します。" onPosition={value=>setPositions(previous=>({...previous,[row.id]:value}))} onReflect={()=>void reflect(row)} onBeginCancel={()=>{setRestore({id:row.id,reason:'',attempted:false});setActionErrors(previous=>({...previous,[row.id]:''}))}} onCancelReason={reason=>{if(restore&&!restore.attempted)setRestore({...restore,reason})}} onCancel={()=>void cancel()} onCancelBack={()=>setRestore(null)}/>}/>
    })}
    </>}
    {restore?.attempted&&<div role="status" className="space-y-3 rounded-xl border-2 border-orange-400 p-4"><p>取消結果が確認できるまで、申請 {restore.id} と同じ理由で再確認してください。</p><p>取消理由：{restore.reason}</p><button type="button" className={button} disabled={busy} onClick={()=>void cancel()}>同じ内容で取消結果を再確認</button></div>}
    {showWithdraw && <>
    <h2 className="text-2xl font-bold">棄権受付（0円）</h2>
    {review ? <div className="space-y-3 rounded-xl bg-orange-50 p-4"><p className="text-xl font-bold">この人馬の棄権を保存します</p><p>{entryLabel(review.entryId)}</p><p>受付担当者：{review.visitorName} ／ 料金：0円</p><button className={button} disabled={busy} onClick={() => void run(token => submitWinterWithdraw(review.id, review.entryId, review.visitorName, token), '棄権申請を保存しました。一覧で出番表へ反映してください')}>棄権申請を保存</button><button className={button} disabled={busy} onClick={() => setReview(null)}>入力に戻る</button></div> : <div className="space-y-3">
      <label className="block text-xl">対象の人馬<select className="mt-2 min-h-14 w-full rounded-xl border-2 p-3" value={entryId} onChange={event => setEntryId(event.target.value)}><option value="">人馬を選択</option>{activeEntries.map(row => <option key={row.entry_id} value={row.entry_id}>{entryLabel(row.entry_id)}</option>)}</select></label>
      {!activeEntries.length && <p>対象の出番がありません。追加申請を出番表へ反映すると選択できます。</p>}
      <label className="block text-xl">棄権の受付担当者名<input className="mt-2 min-h-14 w-full rounded-xl border-2 p-3" maxLength={100} value={visitorName} onChange={event => setVisitorName(event.target.value)} /></label>
      <button className={button} disabled={busy || !entryId || !visitorName.trim()} onClick={() => { setError(''); setReview({ id: crypto.randomUUID(), entryId, visitorName: visitorName.trim() }) }}>棄権内容を確認</button>
    </div>}
    </>}
    {message && <p role="status" className="rounded-xl bg-green-100 p-4 text-xl">{message}</p>}
    {error && <p role="alert" className="rounded-xl bg-red-100 p-4 text-xl">{error}</p>}
  </div>
}
