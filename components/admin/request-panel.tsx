"use client"

import { useEffect, useMemo, useState } from "react"
import { CheckCircle2, Clock, RefreshCw, ShieldCheck } from "lucide-react"
import { useStore } from "@/lib/store"
import { formatYen } from "@/lib/fees"
import { ActionButton } from "@/components/action-button"
import { applyReceptionRequest, loadReceptionRequests, type PersistedReceptionRequest } from "@/lib/reception-api"

const labels = { add: "追加", change: "変更", withdraw: "棄権" } as const

export function RequestPanel({ accessToken }: { accessToken: string }) {
  const { getCompetition, getPlayer, getHorse, getOrg } = useStore()
  const [requests, setRequests] = useState<PersistedReceptionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [applying, setApplying] = useState<string | null>(null)
  const [error, setError] = useState("")
  async function reload() { setLoading(true); setError(""); try { setRequests(await loadReceptionRequests()) } catch(e){setError(e instanceof Error?e.message:"申請を読み込めませんでした")} finally{setLoading(false)} }
  useEffect(()=>{void reload()},[])
  async function apply(id:string){ if(!window.confirm("この申請を出番表へ反映します。よろしいですか？")) return; setApplying(id); setError(""); try { await applyReceptionRequest(id, accessToken); await reload() } catch(e){setError(e instanceof Error?e.message:"反映できませんでした")} finally{setApplying(null)} }
  const pendingCount=useMemo(()=>requests.filter(r=>r.status==="pending").length,[requests])
  function compText(id?:string|null){const c=id?getCompetition(id):undefined;return c?`競技${c.number}. ${c.name}${c.official?"（★公認）":""}`:"―"}
  if(loading&&requests.length===0)return <p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-10 text-center text-xl text-muted-foreground">受付申請を読み込み中...</p>
  return <div className="flex flex-col gap-4">
    <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-border bg-card p-4"><div><p className="text-lg font-semibold text-muted-foreground">未反映の受付申請</p><p className="text-3xl font-bold">{pendingCount}件</p></div><button onClick={()=>void reload()} disabled={loading} className="ml-auto flex items-center gap-2 rounded-xl border-2 border-border px-4 py-3 text-lg font-bold disabled:opacity-50"><RefreshCw className={`size-5 ${loading?"animate-spin":""}`}/>再読み込み</button></div>
    <p className="flex items-center gap-2 text-lg text-primary"><ShieldCheck className="size-5"/>大会本部として認証済みです。反映ボタンで出番表へ反映できます。</p>
    {error&&<p className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-3 font-semibold text-destructive">{error}</p>}
    {requests.length===0&&!error&&<p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-10 text-center text-xl text-muted-foreground">まだ受付された申請はありません。</p>}
    {requests.map(r=>{const p=r.payload??{};const type=r.request_type??"add";const org=r.organization_id?getOrg(r.organization_id):undefined;const fromPlayer=String(p.fromPlayerId??r.rider_id??"");const fromHorse=String(p.fromHorseId??r.horse_id??"");const toPlayer=String(p.toPlayerId??r.rider_id??"");const toHorse=String(p.toHorseId??r.horse_id??"");return <div key={r.id} className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3"><span className="rounded-lg bg-secondary px-3 py-1 text-xl font-bold">{labels[type]}</span><span className="text-xl font-bold">{org?.name??"―"}</span><span className="ml-auto text-lg font-semibold">{r.status==="reflected"?<span className="flex items-center gap-1 text-primary"><CheckCircle2 className="size-6"/>反映済み</span>:<span className="flex items-center gap-1 text-muted-foreground"><Clock className="size-6"/>未反映</span>}</span></div>
      <div className="mt-3 space-y-1 text-xl">{type==="add"&&<><p>{compText(r.to_competition_id)}</p><p>選手：{getPlayer(String(p.playerId??r.rider_id??""))?.name??"―"} ／ 馬：{getHorse(String(p.horseId??r.horse_id??""))?.name??"―"}</p>{r.note&&<p className="text-lg text-muted-foreground">要望：{r.note}</p>}</>}{type==="withdraw"&&<><p>{compText(r.from_competition_id)}</p><p>選手：{getPlayer(String(p.playerId??r.rider_id??""))?.name??"―"} ／ 馬：{getHorse(String(p.horseId??r.horse_id??""))?.name??"―"}</p></>}{type==="change"&&<>{r.treated_as_withdraw_add&&<p className="font-bold">※棄権＋追加として扱う</p>}<p className="text-lg text-muted-foreground">変更前</p><p>{compText(r.from_competition_id)}／{getPlayer(fromPlayer)?.name??"―"}／{getHorse(fromHorse)?.name??"―"}</p><p className="text-lg text-muted-foreground">変更後</p><p>{compText(r.to_competition_id)}／{getPlayer(toPlayer)?.name??"―"}／{getHorse(toHorse)?.name??"―"}</p></>}</div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t-2 border-border pt-4"><span className="text-xl font-bold">料金：<span className="text-primary">{formatYen(r.fee??0)}</span></span>{r.status==="pending"&&<div className="w-full sm:w-auto sm:min-w-64"><ActionButton onClick={()=>void apply(r.id)} disabled={applying===r.id}>{applying===r.id?"反映中...":"出番表へ反映"}</ActionButton></div>}</div>
    </div>})}
  </div>
}
