"use client"

import { useEffect, useState } from "react"
import { CheckCircle2, Clock } from "lucide-react"
import { useStore } from "@/lib/store"
import { formatYen } from "@/lib/fees"
import { ActionButton } from "@/components/action-button"
import { loadReceptionRequests, markRequestReflected, type PersistedReceptionRequest } from "@/lib/reception-api"

const labels = { add: "追加", change: "変更", withdraw: "棄権" } as const

export function RequestPanel() {
  const { getCompetition, getPlayer, getHorse, getOrg } = useStore()
  const [requests, setRequests] = useState<PersistedReceptionRequest[]>([])
  const [loading, setLoading] = useState(true)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [error, setError] = useState("")

  useEffect(() => { loadReceptionRequests().then(setRequests).catch(e => setError(e instanceof Error ? e.message : "申請を読み込めませんでした")).finally(() => setLoading(false)) }, [])

  function compText(id?: string | null) { const c = id ? getCompetition(id) : undefined; return c ? `競技${c.number}. ${c.name}${c.official ? "（★公認）" : ""}` : "―" }
  async function reflect(id: string) { setSavingId(id); setError(""); try { const row = await markRequestReflected(id); setRequests(prev => prev.map(r => r.id === id ? { ...r, ...row } : r)) } catch (e) { setError(e instanceof Error ? e.message : "反映状態を保存できませんでした") } finally { setSavingId(null) } }

  if (loading) return <p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-10 text-center text-xl text-muted-foreground">受付申請を読み込み中...</p>
  if (requests.length === 0 && !error) return <p className="rounded-2xl border-2 border-dashed border-border bg-card px-5 py-10 text-center text-xl text-muted-foreground">まだ受付された申請はありません。</p>

  return <div className="flex flex-col gap-4">
    <p className="text-lg text-muted-foreground">Supabaseに保存された受付申請の一覧です。「出番表へ反映」を押すと反映済みとして永続保存します。</p>
    {error && <p className="rounded-xl border-2 border-destructive/40 bg-destructive/5 p-3 font-semibold text-destructive">{error}</p>}
    {requests.map(r => { const p = r.payload ?? {}; const type = r.request_type ?? "add"; const org = r.organization_id ? getOrg(r.organization_id) : undefined; const fromPlayer = String(p.fromPlayerId ?? r.rider_id ?? ""); const fromHorse = String(p.fromHorseId ?? r.horse_id ?? ""); const toPlayer = String(p.toPlayerId ?? r.rider_id ?? ""); const toHorse = String(p.toHorseId ?? r.horse_id ?? ""); return <div key={r.id} className="rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center gap-3"><span className="rounded-lg bg-secondary px-3 py-1 text-xl font-bold">{labels[type]}</span><span className="text-xl font-bold">{org?.name ?? "―"}</span><span className="ml-auto text-lg font-semibold">{r.status === "reflected" ? <span className="flex items-center gap-1 text-primary"><CheckCircle2 className="size-6"/>反映済み</span> : <span className="flex items-center gap-1 text-muted-foreground"><Clock className="size-6"/>未反映</span>}</span></div>
      <div className="mt-3 space-y-1 text-xl">
        {type === "add" && <><p>{compText(r.to_competition_id)}</p><p>選手：{getPlayer(String(p.playerId ?? r.rider_id ?? ""))?.name ?? "―"} ／ 馬：{getHorse(String(p.horseId ?? r.horse_id ?? ""))?.name ?? "―"}</p>{r.note && <p className="text-lg text-muted-foreground">要望：{r.note}</p>}</>}
        {type === "withdraw" && <><p>{compText(r.from_competition_id)}</p><p>選手：{getPlayer(String(p.playerId ?? r.rider_id ?? ""))?.name ?? "―"} ／ 馬：{getHorse(String(p.horseId ?? r.horse_id ?? ""))?.name ?? "―"}</p></>}
        {type === "change" && <>{r.treated_as_withdraw_add && <p className="font-bold">※棄権＋追加として扱う</p>}<p className="text-lg text-muted-foreground">変更前</p><p>{compText(r.from_competition_id)}／{getPlayer(fromPlayer)?.name ?? "―"}／{getHorse(fromHorse)?.name ?? "―"}</p><p className="text-lg text-muted-foreground">変更後</p><p>{compText(r.to_competition_id)}／{getPlayer(toPlayer)?.name ?? "―"}／{getHorse(toHorse)?.name ?? "―"}</p></>}
      </div>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-4 border-t-2 border-border pt-4"><span className="text-xl font-bold">料金：<span className="text-primary">{formatYen(r.fee ?? 0)}</span></span>{r.status === "pending" && <div className="w-full sm:w-auto sm:min-w-64"><ActionButton disabled={savingId === r.id} onClick={() => reflect(r.id)}>{savingId === r.id ? "反映中..." : "出番表へ反映"}</ActionButton></div>}</div>
    </div> })}
  </div>
}
