"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Clock } from "lucide-react"
import { useStore } from "@/lib/store"
import { formatYen } from "@/lib/fees"
import { startEntries as originalEntries } from "@/lib/mock-data"
import { ActionButton } from "@/components/action-button"
import { ADMIN_SESSION_KEY, applyReceptionRequest, cancelReceptionRequest, refreshAdminSession, type AdminSession } from "@/lib/supabase-rest"
import type { AppRequest } from "@/lib/types"

const typeLabel: Record<AppRequest["type"], { text: string; cls: string }> = {
  add: { text: "追加", cls: "bg-primary text-primary-foreground" },
  change: { text: "変更", cls: "bg-accent text-accent-foreground" },
  withdraw: { text: "棄権", cls: "bg-destructive text-white" },
}

export function RequestPanel({canManage = true}:{canManage?:boolean}) {
  const { requests, getCompetition, getPlayer, getHorse, getOrg, entriesByCompetition } = useStore()
  const [positions, setPositions] = useState<Record<string, string>>({})
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({})
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [restoreWait, setRestoreWait] = useState(true)
  useEffect(()=>{const t=window.setTimeout(()=>setRestoreWait(false),2500);return()=>window.clearTimeout(t)},[])
  if (requests.length === 0 && restoreWait) return <p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-10 text-center text-xl text-muted-foreground">前回の申請を復元しています…</p>
  if (requests.length === 0) return <p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-10 text-center text-xl text-muted-foreground">まだ受付された申請はありません。受付タブレットから追加・変更・棄権を申請すると、ここに表示されます。</p>
  function compText(id: string) { const c=getCompetition(id); return c?`競技${c.number}. ${c.name}${c.official?"（★公認）":""}`:"―" }
  function targetCompetitionId(r:AppRequest){if(r.add)return r.add.competitionId;if(r.change)return r.change.toCompetitionId;return null}
  async function handleReflect(requestId:string,targetOrder?:number){
    if(applyingId)return
    setApplyingId(requestId)
    setApplyErrors(prev=>({...prev,[requestId]:""}))
    try{
      const raw=sessionStorage.getItem(ADMIN_SESSION_KEY)
      if(!raw)throw new Error("本部ログインが確認できません。いったんログアウトして再ログインしてください")
      const saved=JSON.parse(raw) as AdminSession
      const session=await refreshAdminSession(saved)
      sessionStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify(session))
      await applyReceptionRequest(requestId,targetOrder,session.accessToken)
      // The RPC writes the request and official entry atomically. Reload both from
      // the database instead of making a second client-side PATCH or mock entry.
      window.location.reload()
    }catch(error){
      setApplyErrors(prev=>({...prev,[requestId]:error instanceof Error?error.message:"正式出番表への反映に失敗しました"}))
    }finally{setApplyingId(null)}
  }

  function originalSeedId(request:AppRequest):string|undefined{
    if(request.type==="add")return undefined
    const info=request.change
      ? {entryId:request.change.entryId,competitionId:request.change.fromCompetitionId,playerId:request.change.fromPlayerId,horseId:request.change.fromHorseId}
      : request.withdraw
        ? {entryId:request.withdraw.entryId,competitionId:request.withdraw.competitionId,playerId:request.withdraw.playerId,horseId:request.withdraw.horseId}
        : null
    if(!info)return undefined
    const exact=originalEntries.find(entry=>entry.id===info.entryId)
    if(exact)return exact.id
    const candidate=originalEntries.filter(entry=>entry.competitionId===info.competitionId&&entry.playerId===info.playerId&&entry.horseId===info.horseId)
    return candidate.length===1?candidate[0].id:undefined
  }
  async function handleCancel(request:AppRequest){
    if(applyingId)return
    setApplyingId(request.id)
    setApplyErrors(prev=>({...prev,[request.id]:""}))
    try{
      if(!cancelReason.trim())throw new Error("取消理由を入力してください")
      const seedId=request.status==="reflected"?originalSeedId(request):undefined
      const raw=sessionStorage.getItem(ADMIN_SESSION_KEY)
      if(!raw)throw new Error("本部ログインが確認できません。再ログインしてください")
      const session=await refreshAdminSession(JSON.parse(raw) as AdminSession)
      sessionStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify(session))
      await cancelReceptionRequest(request.id,cancelReason.trim(),seedId,session.accessToken)
      window.location.reload()
    }catch(error){
      setApplyErrors(prev=>({...prev,[request.id]:error instanceof Error?error.message:"取り消しに失敗しました"}))
    }finally{setApplyingId(null)}
  }

  return <div className="flex flex-col gap-4">
    <p className="text-lg text-muted-foreground">受付された申請の一覧です。追加・変更は反映する出番位置を本部で指定できます。未指定の場合は従来どおり自動配置します。</p>
    {requests.map(r=>{const label=typeLabel[r.type],org=getOrg(r.orgId),targetId=targetCompetitionId(r),maxPosition=targetId?entriesByCompetition(targetId).filter(e=>!e.withdrawn).length+1:0,isApplying=applyingId===r.id;return <div key={r.id} className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3"><span className={`rounded-lg px-3 py-1 text-xl font-bold ${label.cls}`}>{label.text}</span><span className="text-xl font-bold text-foreground">{org?.name??"―"}</span><span className="ml-auto flex items-center gap-2 text-lg font-semibold">{r.status==="cancelled"?<span className="text-muted-foreground">取消済み</span>:r.status==="reflected"?<span className="flex items-center gap-1 text-primary"><CheckCircle2 className="size-6"/>反映済み</span>:<span className="flex items-center gap-1 text-muted-foreground"><Clock className="size-6"/>未反映</span>}</span></div>
      <div className="mt-3 space-y-1 text-xl text-foreground">
        {r.type==="add"&&r.add&&<><p>{compText(r.add.competitionId)}</p><p>選手：{getPlayer(r.add.playerId)?.name??"―"} ／ 馬：{getHorse(r.add.horseId)?.name??"―"}</p>{r.add.note.trim()&&<p className="text-lg text-muted-foreground">要望：{r.add.note}</p>}</>}
        {r.type==="withdraw"&&r.withdraw&&<><p>{compText(r.withdraw.competitionId)}</p><p>選手：{getPlayer(r.withdraw.playerId)?.name??"―"} ／ 馬：{getHorse(r.withdraw.horseId)?.name??"―"}</p></>}
        {r.type==="change"&&r.change&&<>{r.change.treatedAsWithdrawAdd&&<p className="font-bold text-accent-foreground">※棄権＋追加として扱う</p>}<p className="text-lg text-muted-foreground">変更前</p><p>{compText(r.change.fromCompetitionId)}／{getPlayer(r.change.fromPlayerId)?.name??"―"}／{getHorse(r.change.fromHorseId)?.name??"―"}</p><p className="text-lg text-muted-foreground">変更後</p><p>{compText(r.change.toCompetitionId)}／{getPlayer(r.change.toPlayerId)?.name??"―"}／{getHorse(r.change.toHorseId)?.name??"―"}</p></>}
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t-2 border-border pt-4">
        <span className="text-xl font-bold text-foreground">料金：<span className="text-primary">{formatYen(r.status==="cancelled"?0:r.fee.total)}</span>{r.status==="cancelled"&&<span className="ml-2 text-sm text-muted-foreground">精算対象外</span>}</span>
        {r.status==="pending"&&canManage&&<div className="w-full space-y-3 sm:w-auto sm:min-w-72">{targetId&&<label className="block text-lg font-bold">反映する出番位置<select disabled={isApplying} value={positions[r.id]??""} onChange={e=>setPositions(prev=>({...prev,[r.id]:e.target.value}))} className="mt-1 min-h-12 w-full rounded-xl border-2 border-border bg-background px-3 text-lg disabled:opacity-50"><option value="">自動配置</option>{Array.from({length:maxPosition},(_,i)=><option key={i+1} value={i+1}>{i+1}番</option>)}</select></label>}{applyErrors[r.id]&&<p className="rounded-xl bg-destructive/10 p-3 font-semibold text-destructive">{applyErrors[r.id]}</p>}<ActionButton disabled={applyingId!==null} onClick={()=>void handleReflect(r.id,positions[r.id]?Number(positions[r.id]):undefined)}>{isApplying?"正式出番表へ反映中…":"出番表へ反映"}</ActionButton></div>}
        {canManage&&r.status!=="cancelled"&&<div className="w-full space-y-2 sm:w-auto sm:min-w-72">
          {confirmCancelId===r.id?<><label className="block text-base font-bold">取消理由<input value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="例：申請内容の誤り" className="mt-1 min-h-12 w-full rounded-xl border-2 border-border bg-background px-3 text-lg" /></label><p className="text-sm text-muted-foreground">追加は出番と追加料金から外します。変更・棄権は変更前の人馬を出番表へ戻し、元の通常料金を維持します。</p><div className="flex gap-2"><button type="button" disabled={applyingId!==null} onClick={()=>void handleCancel(r)} className="min-h-12 rounded-xl bg-destructive px-4 font-bold text-white disabled:opacity-50">{isApplying?"取消中…":"取り消しを確定"}</button><button type="button" onClick={()=>setConfirmCancelId(null)} className="min-h-12 rounded-xl border border-border px-4">戻る</button></div></>:<button type="button" disabled={applyingId!==null} onClick={()=>{setConfirmCancelId(r.id);setCancelReason("");setApplyErrors(prev=>({...prev,[r.id]:""}))}} className="min-h-12 rounded-xl border-2 border-destructive px-4 font-bold text-destructive disabled:opacity-50">この申請を取り消す</button>}
          {applyErrors[r.id]&&r.status!=="pending"&&<p className="rounded-xl bg-destructive/10 p-3 font-semibold text-destructive">{applyErrors[r.id]}</p>}
        </div>}
      </div>
    </div>})}
  </div>
}
