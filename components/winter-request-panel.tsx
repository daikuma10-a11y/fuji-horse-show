"use client"

import {MasterRequestGroups,MasterRequestCard} from './master/request-list'
import { useEffect, useRef, useState } from 'react'
import { verifyAdminSession, type AdminSession } from '@/lib/supabase-rest'
import { loadWinterData } from '@/lib/winter-data'
import { loadWinterRequests, reflectWinterRequest, submitWinterWithdraw, restoreWinterWithdraw, type WinterRequestRow } from '@/lib/winter-reception'

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
  async function run(action: (token: string) => Promise<unknown>, success: string) {
    if (lock.current) return
    lock.current = true; setBusy(true); setError(''); setMessage('')
    try {
      const verified = await verifyAdminSession(session); onSession(verified)
      await action(verified.accessToken)
      setMessage(success); setReview(null); setReload(value => value + 1); onChanged()
    } catch (reason) { setError(reason instanceof Error ? reason.message : '処理できませんでした。同じ内容で再試行してください') }
    finally { lock.current = false; setBusy(false) }
  }
  const activeEntries = data.entries.filter(row => !['wd','withdrawn'].includes(row.status.toLowerCase()) && (!orgId || data.riders.find(rider => rider.id === row.rider_id)?.organization_id === orgId))
  return <div className="space-y-5 border-t-2 pt-5">
    {mode === "admin" && <>
    <h2 className="text-2xl font-bold">本部：申請一覧・出番表への反映</h2>
    <p>反映前は「未反映」、反映後も一覧に残します。反映ボタンは出番表を変更します。</p>
    <button className={button} disabled={busy} onClick={() => { setReload(value => value + 1); onChanged() }}>最新の情報を確認</button>
    {!loaded&&!error&&<p role="status">申請一覧を読み込んでいます…</p>}
    {loaded&&!requests.length&&<p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-10 text-center text-xl text-muted-foreground">まだ受付された申請はありません。受付タブレットから追加・変更・棄権を申請すると、ここに表示されます。</p>}
    {loaded&&requests.length>0&&!orgId&&<MasterRequestGroups groups={data.organizations.filter(o=>requests.some(q=>q.organization_id===o.id)).map(o=>({id:o.id,name:o.name,pending:requests.filter(q=>q.organization_id===o.id&&q.status==='pending').length}))} onSelect={id=>{setOrgId(id);setEntryId('');setReview(null)}}/>}
    {loaded&&orgId&&<><button type="button" disabled={busy} onClick={()=>setOrgId('')} className="w-fit min-h-12 rounded-xl border-2 border-border bg-card px-5 py-3 text-xl font-bold">← 団体一覧へ</button><div className="rounded-2xl border-2 border-border bg-card p-5"><h2 className="text-2xl font-bold">{orgName(orgId)}</h2><p className="mt-2 text-lg font-semibold">申請 {requests.filter(q=>q.organization_id===orgId).length}件 ／ 未反映 {requests.filter(q=>q.organization_id===orgId&&q.status==='pending').length}件</p></div></>}
    {loaded&&orgId&&requests.filter(row=>row.organization_id===orgId).map(row=>{
      const comp=(id:string)=>{const c=data.competitions.find(c=>c.id===id);return c?`競技${c.competition_no}. ${c.name}${c.official?'（★公認）':''}`:'―'},rider=(id:string)=>data.riders.find(r=>r.id===id)?.name??'―',horse=(id:string)=>data.horses.find(h=>h.id===id)?.name??'―';
      return <MasterRequestCard key={row.id} request={{type:row.request_type,status:row.status,organization:orgName(row.organization_id),createdAt:row.created_at,actor:row.payload.visitorName,actorLabel:'受付担当者',before:row.payload.before?{competition:comp(row.payload.before.competitionId),rider:rider(row.payload.before.riderId),horse:horse(row.payload.before.horseId),isOp:row.payload.before.isOp}:undefined,after:{competition:comp(row.target_competition_id),rider:rider(row.rider_id),horse:horse(row.horse_id),isOp:row.payload.add?.isOp??row.payload.change?.toIsOp??row.payload.before?.isOp},note:row.payload.add?.note,changedFields:row.payload.changedFields?.map(field=>({competition:'競技変更',player:'選手変更',horse:'馬変更',op:'参加区分変更',membership:'会員区分変更'}[field]??field)),treatedAsWithdrawAdd:row.payload.treatedAsWithdrawAdd,amount:row.fee_amount}} actions={<>
      {row.status==='pending'&&<button className={button} disabled={busy} onClick={()=>void run(token=>reflectWinterRequest(row.id,token,row.request_type),'出番表へ反映しました')}>出番表へ反映</button>}
      {row.request_type==='withdraw'&&['pending','reflected'].includes(row.status)&&<button className={button} disabled={busy||!!restore} onClick={()=>setRestore({id:row.id,reason:'',attempted:false})}>棄権を取り消す{row.status==='reflected'?'（最後尾へ復元）':''}</button>}
      </>}/>
    })}
    </>}
    {restore&&<div className="space-y-3 rounded-xl border-2 border-orange-400 p-4"><h3 className="text-xl font-bold">棄権の取り消しを確認</h3><p>反映済みなら同じ競技の最後尾へ戻します。未反映なら棄権申請だけを取り消します。登録料・入金額は変わりません。</p><label className="block">取消理由<input className="mt-2 min-h-14 w-full rounded-xl border-2 p-3" maxLength={300} disabled={busy||restore.attempted} value={restore.reason} onChange={e=>setRestore({...restore,reason:e.target.value})}/></label><button className={button} disabled={busy||!restore.reason.trim()} onClick={()=>{const value={...restore,attempted:true};setRestore(value);void run(async token=>{await restoreWinterWithdraw(value.id,value.reason,token);setRestore(null)},'棄権を取り消しました。反映済みの人馬は最後尾へ復元しました')}}>{restore.attempted?'同じ内容で取消結果を再確認':'棄権の取り消しを確定'}</button>{!restore.attempted&&<button className={button} disabled={busy} onClick={()=>setRestore(null)}>戻る</button>}{restore.attempted&&<p>取消結果が確認できるまで同じ内容で再確認してください。</p>}</div>}
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
