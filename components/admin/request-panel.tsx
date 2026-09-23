"use client"

import { useState } from "react"
import { CheckCircle2, Clock } from "lucide-react"
import { useStore } from "@/lib/store"
import { formatYen } from "@/lib/fees"
import { ActionButton } from "@/components/action-button"
import type { AppRequest } from "@/lib/types"

const typeLabel: Record<AppRequest["type"], { text: string; cls: string }> = {
  add: { text: "追加", cls: "bg-primary text-primary-foreground" },
  change: { text: "変更", cls: "bg-accent text-accent-foreground" },
  withdraw: { text: "棄権", cls: "bg-destructive text-white" },
}

export function RequestPanel() {
  const { requests, reflectRequest, getCompetition, getPlayer, getHorse, getOrg, entriesByCompetition } = useStore()
  const [positions, setPositions] = useState<Record<string, string>>({})
  if (requests.length === 0) return <p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-10 text-center text-xl text-muted-foreground">まだ受付された申請はありません。受付タブレットから追加・変更・棄権を申請すると、ここに表示されます。</p>
  function compText(id: string) { const c=getCompetition(id); return c?`競技${c.number}. ${c.name}${c.official?"（★公認）":""}`:"―" }
  function targetCompetitionId(r:AppRequest){if(r.add)return r.add.competitionId;if(r.change)return r.change.toCompetitionId;return null}

  return <div className="flex flex-col gap-4">
    <p className="text-lg text-muted-foreground">受付された申請の一覧です。追加・変更は反映する出番位置を本部で指定できます。未指定の場合は従来どおり自動配置します。</p>
    {requests.map(r=>{const label=typeLabel[r.type],org=getOrg(r.orgId),targetId=targetCompetitionId(r),maxPosition=targetId?entriesByCompetition(targetId).filter(e=>!e.withdrawn).length+1:0;return <div key={r.id} className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3"><span className={`rounded-lg px-3 py-1 text-xl font-bold ${label.cls}`}>{label.text}</span><span className="text-xl font-bold text-foreground">{org?.name??"―"}</span><span className="ml-auto flex items-center gap-2 text-lg font-semibold">{r.status==="reflected"?<span className="flex items-center gap-1 text-primary"><CheckCircle2 className="size-6"/>反映済み</span>:<span className="flex items-center gap-1 text-muted-foreground"><Clock className="size-6"/>未反映</span>}</span></div>
      <div className="mt-3 space-y-1 text-xl text-foreground">
        {r.type==="add"&&r.add&&<><p>{compText(r.add.competitionId)}</p><p>選手：{getPlayer(r.add.playerId)?.name??"―"} ／ 馬：{getHorse(r.add.horseId)?.name??"―"}</p>{r.add.note.trim()&&<p className="text-lg text-muted-foreground">要望：{r.add.note}</p>}</>}
        {r.type==="withdraw"&&r.withdraw&&<><p>{compText(r.withdraw.competitionId)}</p><p>選手：{getPlayer(r.withdraw.playerId)?.name??"―"} ／ 馬：{getHorse(r.withdraw.horseId)?.name??"―"}</p></>}
        {r.type==="change"&&r.change&&<>{r.change.treatedAsWithdrawAdd&&<p className="font-bold text-accent-foreground">※棄権＋追加として扱う</p>}<p className="text-lg text-muted-foreground">変更前</p><p>{compText(r.change.fromCompetitionId)}／{getPlayer(r.change.fromPlayerId)?.name??"―"}／{getHorse(r.change.fromHorseId)?.name??"―"}</p><p className="text-lg text-muted-foreground">変更後</p><p>{compText(r.change.toCompetitionId)}／{getPlayer(r.change.toPlayerId)?.name??"―"}／{getHorse(r.change.toHorseId)?.name??"―"}</p></>}
      </div>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t-2 border-border pt-4">
        <span className="text-xl font-bold text-foreground">料金：<span className="text-primary">{formatYen(r.fee.total)}</span></span>
        {r.status==="pending"&&<div className="w-full space-y-3 sm:w-auto sm:min-w-72">{targetId&&<label className="block text-lg font-bold">反映する出番位置<select value={positions[r.id]??""} onChange={e=>setPositions(prev=>({...prev,[r.id]:e.target.value}))} className="mt-1 min-h-12 w-full rounded-xl border-2 border-border bg-background px-3 text-lg"><option value="">自動配置</option>{Array.from({length:maxPosition},(_,i)=><option key={i+1} value={i+1}>{i+1}番</option>)}</select></label>}<ActionButton onClick={()=>reflectRequest(r.id,positions[r.id]?Number(positions[r.id]):undefined)}>出番表へ反映</ActionButton></div>}
      </div>
    </div>})}
  </div>
}
