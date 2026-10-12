"use client"

import { useEffect, useState } from "react"
import {MasterRequestGroups,MasterRequestCard,type MasterRequestView} from "@/components/master/request-list"
import { useStore } from "@/lib/store"
import { startEntries as originalEntries } from "@/lib/mock-data"
import { ActionButton } from "@/components/action-button"
import { ADMIN_SESSION_KEY, applyReceptionRequest, cancelReceptionRequest, refreshAdminSession, type AdminSession } from "@/lib/supabase-rest"
import type { AppRequest } from "@/lib/types"
import { compareOrganizations } from "@/lib/organization-order"
import { canonicalOrgId } from "@/lib/organization-aliases"

export function RequestPanel({canManage = true}:{canManage?:boolean}) {
  const { requests, getCompetition, getPlayer, getHorse, getOrg, entriesByCompetition } = useStore()
  const [positions, setPositions] = useState<Record<string, string>>({})
  const [applyingId, setApplyingId] = useState<string | null>(null)
  const [batchApplying, setBatchApplying] = useState(false)
  const [batchResult, setBatchResult] = useState("")
  const [applyErrors, setApplyErrors] = useState<Record<string, string>>({})
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null)
  const [cancelReason, setCancelReason] = useState("")
  const [restoreWait, setRestoreWait] = useState(true)
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(null)
  useEffect(()=>{const t=window.setTimeout(()=>setRestoreWait(false),2500);return()=>window.clearTimeout(t)},[])
  if (requests.length === 0 && restoreWait) return <p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-10 text-center text-xl text-muted-foreground">前回の申請を復元しています…</p>
  if (requests.length === 0) return <p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-10 text-center text-xl text-muted-foreground">まだ受付された申請はありません。受付タブレットから追加・変更・棄権を申請すると、ここに表示されます。</p>
  // 申請の所属先を基準に集計する。受付に来た方の団体とは区別する。
  const groups = Array.from(requests.reduce((map, request) => {
    const id = canonicalOrgId(request.orgId)
    const group = map.get(id) ?? { id, name: getOrg(id)?.name ?? getOrg(request.orgId)?.name ?? "団体不明", requests: [] as AppRequest[], pending: 0 }
    group.requests.push(request)
    if (request.status === "pending") group.pending++
    map.set(id, group)
    return map
  }, new Map<string, { id: string; name: string; requests: AppRequest[]; pending: number }>()).values()).sort((a, b) => compareOrganizations(
    getOrg(a.id) ?? { id: a.id, name: a.name },
    getOrg(b.id) ?? { id: b.id, name: b.name },
  ))
  const selectedGroup = groups.find(group => group.id === selectedOrgId)
  function compText(id: string) { const c=getCompetition(id); return c?`競技${c.number}. ${c.name}${c.official?"（★公認）":""}`:"―" }
  function targetCompetitionId(r:AppRequest){if(r.add)return r.add.competitionId;if(r.change?.treatedAsWithdrawAdd)return r.change.toCompetitionId;return null}
  async function handleReflect(requestId:string,targetOrder?:number){
    if(applyingId||batchApplying||batchResult)return
    setApplyingId(requestId)
    setApplyErrors(prev=>({...prev,[requestId]:""}))
    try{
      const raw=sessionStorage.getItem(ADMIN_SESSION_KEY)
      if(!raw)throw new Error("本部ログインが確認できません。いったんログアウトして再ログインしてください")
      const saved=JSON.parse(raw) as AdminSession
      const session=await refreshAdminSession(saved)
      sessionStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify(session))
      const request=requests.find(row=>row.id===requestId)
      const targetId=request?.add?.competitionId??(request?.change?.treatedAsWithdrawAdd?request.change.toCompetitionId:undefined)
      const automaticOrder=targetId&&getCompetition(targetId)?.official?1:undefined
      await applyReceptionRequest(requestId,targetOrder??automaticOrder,session.accessToken)
      // The RPC writes the request and official entry atomically. Reload both from
      // the database instead of making a second client-side PATCH or mock entry.
      window.location.reload()
    }catch(error){
      setApplyErrors(prev=>({...prev,[requestId]:error instanceof Error?error.message:"正式出番表への反映に失敗しました"}))
    }finally{setApplyingId(null)}
  }
  async function handleReflectGroup(group:{id:string;requests:AppRequest[]}){
    if(applyingId||batchApplying||batchResult)return
    const pending=group.requests.filter(request=>request.status==="pending")
    if(!pending.length)return
    setBatchApplying(true)
    let applied=0
    try{
      const raw=sessionStorage.getItem(ADMIN_SESSION_KEY)
      if(!raw)throw new Error("本部ログインが確認できません。再ログインしてください")
      const session=await refreshAdminSession(JSON.parse(raw) as AdminSession)
      sessionStorage.setItem(ADMIN_SESSION_KEY,JSON.stringify(session))
      for(const request of pending){
        setApplyingId(request.id)
        setApplyErrors(previous=>({...previous,[request.id]:""}))
        const targetId=targetCompetitionId(request)
        const chosen=targetId&&positions[request.id]?Number(positions[request.id]):undefined
        const automatic=targetId&&getCompetition(targetId)?.official?1:undefined
        try{
          await applyReceptionRequest(request.id,chosen??automatic,session.accessToken)
          applied++
        }catch(error){
          const message=error instanceof Error?error.message:"正式出番表への反映に失敗しました"
          setApplyErrors(previous=>({...previous,[request.id]:message}))
          throw new Error(`${applied}件を反映しました。次の申請で停止しました：${message}`)
        }
      }
      window.location.reload()
    }catch(error){
      setBatchResult(error instanceof Error?error.message:"団体の一括反映に失敗しました")
    }finally{setApplyingId(null);setBatchApplying(false)}
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
    if(applyingId||batchApplying||batchResult)return
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

  if (!selectedGroup) return <MasterRequestGroups groups={groups} onSelect={setSelectedOrgId}/>

  return <div className="flex flex-col gap-4">
    <button type="button" onClick={() => setSelectedOrgId(null)} className="w-fit min-h-12 rounded-xl border-2 border-border bg-card px-5 py-3 text-xl font-bold">← 団体一覧へ</button>
    <div className="rounded-2xl border-2 border-border bg-card p-5"><h2 className="text-2xl font-bold">{selectedGroup.name}</h2><p className="mt-2 text-lg font-semibold">申請 {selectedGroup.requests.length}件 ／ {selectedGroup.pending > 0 ? <span className="text-destructive">未反映 {selectedGroup.pending}件</span> : "未反映なし"}</p>{canManage&&selectedGroup.pending>0&&<div className="mt-4"><p className="mb-2 text-sm text-muted-foreground">下の各申請の出番位置を確認してから反映してください。順番に保存し、失敗した申請で停止します。</p><button type="button" disabled={applyingId!==null||batchApplying||!!batchResult} onClick={()=>void handleReflectGroup(selectedGroup)} className="min-h-12 rounded-xl bg-primary px-5 py-3 text-lg font-bold text-primary-foreground disabled:opacity-50">{batchApplying?`反映中… ${selectedGroup.requests.filter(row=>row.status==='pending').findIndex(row=>row.id===applyingId)+1}／${selectedGroup.pending}件`:`この団体の未反映 ${selectedGroup.pending}件をまとめて反映`}</button></div>}{batchResult&&<div role="alert" className="mt-3 rounded-xl bg-destructive/10 p-3 font-semibold text-destructive"><p>{batchResult}</p><button type="button" onClick={()=>window.location.reload()} className="mt-2 min-h-10 rounded-lg border border-destructive px-3">正式DBから再読み込み</button></div>}</div>
    <p className="text-lg text-muted-foreground">追加と、棄権＋追加として扱う変更は出番位置を指定できます。自動配置では公認競技は先頭、非公認競技は末尾に入ります。通常の変更は元の出番位置を維持します。</p>
    {selectedGroup.requests.map(r=>{const org=getOrg(r.orgId),targetId=targetCompetitionId(r),maxPosition=targetId?entriesByCompetition(targetId).filter(e=>!e.withdrawn).length+1:0,isApplying=applyingId===r.id;const view:MasterRequestView={type:r.type,status:r.status,organization:org?.name??'―',createdAt:r.createdAt,actor:r.visitorName?(r.onSiteAdmin?r.visitorName:`${getOrg(r.visitorOrgId??'')?.name??'団体不明'} ／ ${r.visitorName}`):undefined,actorLabel:r.onSiteAdmin?'本部登録担当者':'受付に来た方',period:r.onSiteAdmin?(r.postDeadlinePeriod==='before_event'?'締切後〜大会前・本部登録':'大会期間中・本部登録'):undefined,before:r.change?{competition:compText(r.change.fromCompetitionId),rider:getPlayer(r.change.fromPlayerId)?.name??'―',horse:getHorse(r.change.fromHorseId)?.name??'―',isOp:r.change.fromIsOp}:undefined,after:{competition:compText(r.add?.competitionId??r.change?.toCompetitionId??r.withdraw?.competitionId??''),rider:getPlayer(r.add?.playerId??r.change?.toPlayerId??r.withdraw?.playerId??'')?.name??'―',horse:getHorse(r.add?.horseId??r.change?.toHorseId??r.withdraw?.horseId??'')?.name??'―',isOp:r.add?.isOp??r.change?.toIsOp},note:r.add?.note,treatedAsWithdrawAdd:r.change?.treatedAsWithdrawAdd,amount:r.fee.total};return <MasterRequestCard key={r.id} request={view} actions={<>
        {r.status==="pending"&&canManage&&<div className="w-full space-y-3 sm:w-auto sm:min-w-72">{targetId?<label className="block text-lg font-bold">反映する出番位置<select disabled={applyingId!==null||batchApplying||!!batchResult} value={positions[r.id]??""} onChange={e=>setPositions(prev=>({...prev,[r.id]:e.target.value}))} className="mt-1 min-h-12 w-full rounded-xl border-2 border-border bg-background px-3 text-lg disabled:opacity-50"><option value="">自動配置（{getCompetition(targetId)?.official?"公認：先頭":"非公認：末尾"}）</option>{Array.from({length:maxPosition},(_,i)=><option key={i+1} value={i+1}>{i+1}番</option>)}</select></label>:r.change&&!r.change.treatedAsWithdrawAdd?<p className="text-base font-semibold text-muted-foreground">元の出番位置を維持します</p>:null}{applyErrors[r.id]&&<p className="rounded-xl bg-destructive/10 p-3 font-semibold text-destructive">{applyErrors[r.id]}</p>}<ActionButton disabled={applyingId!==null||batchApplying||!!batchResult} onClick={()=>void handleReflect(r.id,targetId&&positions[r.id]?Number(positions[r.id]):undefined)}>{isApplying?"正式出番表へ反映中…":"出番表へ反映"}</ActionButton></div>}
        {canManage&&r.status!=="cancelled"&&<div className="w-full space-y-2 sm:w-auto sm:min-w-72">
          {confirmCancelId===r.id?<><label className="block text-base font-bold">取消理由<input value={cancelReason} onChange={e=>setCancelReason(e.target.value)} placeholder="例：申請内容の誤り" className="mt-1 min-h-12 w-full rounded-xl border-2 border-border bg-background px-3 text-lg" /></label><p className="text-sm text-muted-foreground">追加は出番と追加料金から外します。変更・棄権は変更前の人馬を出番表へ戻し、元の通常料金を維持します。</p><div className="flex gap-2"><button type="button" disabled={applyingId!==null||batchApplying||!!batchResult} onClick={()=>void handleCancel(r)} className="min-h-12 rounded-xl bg-destructive px-4 font-bold text-white disabled:opacity-50">{isApplying?"取消中…":"取り消しを確定"}</button><button type="button" onClick={()=>setConfirmCancelId(null)} className="min-h-12 rounded-xl border border-border px-4">戻る</button></div></>:<button type="button" disabled={applyingId!==null||batchApplying||!!batchResult} onClick={()=>{setConfirmCancelId(r.id);setCancelReason("");setApplyErrors(prev=>({...prev,[r.id]:""}))}} className="min-h-12 rounded-xl border-2 border-destructive px-4 font-bold text-destructive disabled:opacity-50">この申請を取り消す</button>}
          {applyErrors[r.id]&&r.status!=="pending"&&<p className="rounded-xl bg-destructive/10 p-3 font-semibold text-destructive">{applyErrors[r.id]}</p>}
        </div>}
      </>}/>})}
  </div>
}
