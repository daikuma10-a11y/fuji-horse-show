"use client"

import { useEffect, useState } from "react"
import {MasterRequestGroups,MasterRequestCard,type MasterRequestView} from "@/components/master/request-list"
import { useStore } from "@/lib/store"
import { startEntries as originalEntries } from "@/lib/mock-data"
import {MasterRequestActions,MasterRequestGroupHeader,MasterRequestPlacementNotice} from "@/components/master/request-actions"
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
    <MasterRequestGroupHeader name={selectedGroup.name} count={selectedGroup.requests.length} pending={selectedGroup.pending} canManage={canManage} disabled={applyingId!==null||batchApplying||!!batchResult} batchApplying={batchApplying} progress={selectedGroup.requests.filter(row=>row.status==='pending').findIndex(row=>row.id===applyingId)+1} batchResult={batchResult} onReflectGroup={()=>void handleReflectGroup(selectedGroup)} onReload={()=>window.location.reload()}/>
    <MasterRequestPlacementNotice/>
    {selectedGroup.requests.map(r=>{const org=getOrg(r.orgId),targetId=targetCompetitionId(r),maxPosition=targetId?entriesByCompetition(targetId).filter(e=>!e.withdrawn).length+1:0,isApplying=applyingId===r.id;const view:MasterRequestView={type:r.type,status:r.status,organization:org?.name??'―',createdAt:r.createdAt,actor:r.visitorName?(r.onSiteAdmin?r.visitorName:`${getOrg(r.visitorOrgId??'')?.name??'団体不明'} ／ ${r.visitorName}`):undefined,actorLabel:r.onSiteAdmin?'本部登録担当者':'受付に来た方',period:r.onSiteAdmin?(r.postDeadlinePeriod==='before_event'?'締切後〜大会前・本部登録':'大会期間中・本部登録'):undefined,before:r.change?{competition:compText(r.change.fromCompetitionId),rider:getPlayer(r.change.fromPlayerId)?.name??'―',horse:getHorse(r.change.fromHorseId)?.name??'―',isOp:r.change.fromIsOp}:undefined,after:{competition:compText(r.add?.competitionId??r.change?.toCompetitionId??r.withdraw?.competitionId??''),rider:getPlayer(r.add?.playerId??r.change?.toPlayerId??r.withdraw?.playerId??'')?.name??'―',horse:getHorse(r.add?.horseId??r.change?.toHorseId??r.withdraw?.horseId??'')?.name??'―',isOp:r.add?.isOp??r.change?.toIsOp},note:r.add?.note,treatedAsWithdrawAdd:r.change?.treatedAsWithdrawAdd,amount:r.fee.total};return <MasterRequestCard key={r.id} request={view} actions={<MasterRequestActions status={r.status} type={r.type} target={targetId?{official:!!getCompetition(targetId)?.official,maxPosition}:null} normalChange={!!r.change&&!r.change.treatedAsWithdrawAdd} position={positions[r.id]??''} disabled={applyingId!==null||batchApplying||!!batchResult} isApplying={isApplying} error={applyErrors[r.id]} confirmCancel={confirmCancelId===r.id} cancelReason={cancelReason} canManage={canManage} onPosition={value=>setPositions(prev=>({...prev,[r.id]:value}))} onReflect={()=>void handleReflect(r.id,targetId&&positions[r.id]?Number(positions[r.id]):undefined)} onBeginCancel={()=>{setConfirmCancelId(r.id);setCancelReason('');setApplyErrors(prev=>({...prev,[r.id]:''}))}} onCancelReason={setCancelReason} onCancel={()=>void handleCancel(r)} onCancelBack={()=>setConfirmCancelId(null)}/>}/>})}
  </div>
}
