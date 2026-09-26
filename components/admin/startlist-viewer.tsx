"use client"

import { useEffect, useState } from "react"
import { COMPETITION_DATES } from "@/lib/mock-data"
import { useStore } from "@/lib/store"
import { StartList } from "@/components/start-list"
import { OfficialBadge } from "@/components/official-badge"
import { ADMIN_SESSION_KEY, refreshAdminSession, reorderEntries, type AdminSession } from "@/lib/supabase-rest"
import type { CompetitionDate } from "@/lib/types"

const SAVED_ORDERS_KEY = "fhs-confirmed-start-orders-v1"
type DraftOrder = { ids: string[]; base: string[] }
type SavedOrder = { ids: string[]; savedAt: string }

function sameOrder(a: string[], b: string[]) {
  return a.length === b.length && a.every((id, index) => id === b[index])
}

export function StartListViewer({ canReorder = true }: { canReorder?: boolean }) {
  const { competitionsByDate, entriesByCompetition, applySavedEntryOrder, reconciliation } = useStore()
  const [date, setDate] = useState<CompetitionDate>(COMPETITION_DATES[0].value)
  const [compId, setCompId] = useState<string | null>(null)
  const [drafts, setDrafts] = useState<Record<string, DraftOrder>>({})
  const [savedOrders, setSavedOrders] = useState<Record<string, SavedOrder>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [wideView, setWideView] = useState(false)

  useEffect(() => {
    try {
      setSavedOrders(JSON.parse(localStorage.getItem(SAVED_ORDERS_KEY) || "{}"))
    } catch {
      setSavedOrders({})
    }
  }, [])

  const comps = competitionsByDate(date)
  const selected = comps.find(c => c.id === compId) ?? null
  const officialIds = selected
    ? entriesByCompetition(selected.id).filter(entry => !entry.withdrawn).map(entry => entry.id)
    : []
  const draft = selected ? drafts[selected.id] : undefined
  const orderedIds = draft?.ids ?? officialIds
  const dirty = !sameOrder(orderedIds, officialIds)
  const changedSinceDraft = !!draft && !sameOrder(draft.base, officialIds)
  const canEdit = reconciliation.state === "verified" || reconciliation.state === "warning"
  const saved = selected ? savedOrders[selected.id] : undefined
  const lastSaved = saved && sameOrder(saved.ids, officialIds)
    ? new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(saved.savedAt))
    : null

  function moveDraft(sourceId: string, targetId: string) {
    if (!selected || saving || !canEdit || sourceId === targetId) return
    const competitionId = selected.id
    setDrafts(previous => {
      const current = previous[competitionId] ?? { ids: officialIds, base: officialIds }
      const from = current.ids.indexOf(sourceId)
      const to = current.ids.indexOf(targetId)
      if (from < 0 || to < 0) return previous
      const ids = [...current.ids]
      ids.splice(from, 1)
      ids.splice(to, 0, sourceId)
      return { ...previous, [competitionId]: { ids, base: current.base } }
    })
    setSaveError("")
  }

  async function saveOrder() {
    if (!selected || !dirty || saving || changedSinceDraft) return
    const competitionId = selected.id
    setSaving(true)
    setSaveError("")
    try {
      const raw = sessionStorage.getItem(ADMIN_SESSION_KEY)
      if (!raw) throw new Error("保存には管理者ログインが必要です")
      const session = await refreshAdminSession(JSON.parse(raw) as AdminSession)
      sessionStorage.setItem(ADMIN_SESSION_KEY, JSON.stringify(session))
      await reorderEntries(competitionId, orderedIds, session.accessToken, draft?.base ?? officialIds)
      applySavedEntryOrder(competitionId, orderedIds)
      const next = { ...savedOrders, [competitionId]: { ids: orderedIds, savedAt: new Date().toISOString() } }
      try { localStorage.setItem(SAVED_ORDERS_KEY, JSON.stringify(next)) } catch { /* 保存時刻はこの画面内には表示する */ }
      setSavedOrders(next)
      setDrafts(previous => {
        const updated = { ...previous }
        delete updated[competitionId]
        return updated
      })
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "出番順の保存結果を確認できませんでした")
    } finally {
      setSaving(false)
    }
  }

  const verificationClass = reconciliation.state === "verified"
    ? "border-blue-300 bg-blue-50 text-blue-900"
    : reconciliation.state === "loading"
      ? "border-border bg-muted text-muted-foreground"
      : "border-amber-300 bg-amber-50 text-amber-950"

  return <div className={wideView ? "fixed inset-0 z-50 flex flex-col gap-1 overflow-y-auto bg-background px-3 py-2 lg:px-5" : "flex flex-col gap-3"}>
    <button type="button" onClick={() => setWideView(current => !current)} className={wideView ? "sticky top-0 z-20 self-end rounded-lg border-2 border-primary bg-card px-3 py-1 text-sm font-bold text-primary shadow" : "self-end rounded-lg border-2 border-primary bg-card px-3 py-1 text-sm font-bold text-primary"}>{wideView ? "通常画面へ戻る" : "出番表を一画面で見る"}</button>
    <div className={`rounded-lg border px-3 py-2 text-sm font-bold ${wideView ? "hidden" : ""} ${verificationClass}`}>DB照合状況：{reconciliation.message}</div>
    <p className={wideView ? "sr-only" : "text-sm text-muted-foreground"}>人馬の行を少し長押しすると持ち上がります。そのまま上下に動かし、入れたい位置で指を離してください。右の移動マークならすぐに動かせます。最後に「出番順を保存」を押してください。</p>
    <div className="flex flex-wrap gap-2">{COMPETITION_DATES.map(d => <button key={d.value} type="button" disabled={saving} onClick={() => { setDate(d.value); setCompId(null) }} className={`min-h-10 rounded-lg border-2 px-3 text-base font-bold transition ${wideView ? "lg:min-h-7 lg:px-2 lg:text-xs" : ""} ${date === d.value ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-foreground"}`}>{d.label}</button>)}</div>
    {wideView && <label className="flex items-center gap-2 text-xs font-bold">競技 <select value={compId ?? ""} onChange={event => { setCompId(event.target.value || null); setSaveError("") }} className="h-7 min-w-0 max-w-sm rounded border border-border bg-card px-2 text-sm"><option value="">競技を選択</option>{comps.map(c => <option key={c.id} value={c.id}>{c.number}. {c.name}</option>)}</select></label>}
    <div className={wideView ? "hidden" : "flex flex-wrap gap-1.5"}>{comps.map(c => <button key={c.id} type="button" disabled={saving} onClick={() => { setCompId(c.id); setSaveError("") }} className={`flex min-h-10 items-center gap-1.5 rounded-lg border px-2.5 text-sm font-bold transition ${wideView ? "lg:min-h-7 lg:gap-1 lg:px-1.5 lg:text-xs" : ""} ${compId === c.id ? "border-primary bg-primary/10" : "border-border bg-card"}`}><span className="flex size-6 items-center justify-center rounded bg-secondary text-xs text-secondary-foreground">{c.number}</span><span className="max-w-48 truncate">{c.name}</span>{c.official && <OfficialBadge />}</button>)}</div>
    {selected ? <div>
      <h3 className={wideView ? "mb-1 flex flex-wrap items-center gap-2 text-sm font-bold text-foreground" : "mb-2 flex flex-wrap items-center gap-2 text-lg font-bold text-foreground"}>競技{selected.number}. {selected.name}{selected.official && <OfficialBadge />}</h3>
      <div className={wideView && !dirty && !saveError && !changedSinceDraft ? "sr-only" : wideView ? "mb-1 rounded-lg border border-border bg-card px-2 py-1 text-sm" : "mb-3 rounded-xl border-2 border-border bg-card p-3 text-base"}>
        <p className={`font-bold ${dirty ? "text-amber-800" : "text-primary"}`}>{dirty ? "未保存の変更があります" : lastSaved ? `正式DBへ保存済み：${lastSaved}（この端末）` : "正式DBから読み込み済み"}</p>
        {!canReorder && <p className="mt-1 text-sm text-muted-foreground">閲覧モードでは並べ替えを試せます。保存するには管理者ログインが必要です。</p>}
        {changedSinceDraft && <p className="mt-1 font-bold text-destructive">編集中に正式出番表が更新されました。並べ替えを取り消して、最新の順番からやり直してください。</p>}
        {saveError && <p role="alert" className="mt-1 font-bold text-destructive">{saveError}</p>}
        {dirty && <div className="mt-3 flex flex-wrap gap-2">
          <button type="button" onClick={() => setDrafts(previous => { const updated = { ...previous }; delete updated[selected.id]; return updated })} className="min-h-12 rounded-lg border-2 border-border px-4 font-bold">変更を取り消す</button>
          <button type="button" disabled={!canReorder || saving || changedSinceDraft} onClick={() => void saveOrder()} className="min-h-12 rounded-lg bg-primary px-5 font-bold text-primary-foreground disabled:opacity-40">{saving ? "正式DBへ保存中…" : "出番順を保存"}</button>
        </div>}
      </div>
      <StartList competitionId={selected.id} readOnly showAdminChanges adminReorder={canEdit} compact dense={wideView} orderedIds={orderedIds} onReorder={moveDraft} />
      {dirty && canReorder && <div className="fixed inset-x-4 bottom-4 z-30 mx-auto max-w-lg rounded-xl border-2 border-primary bg-card p-2 shadow-xl"><button type="button" disabled={saving || changedSinceDraft} onClick={() => void saveOrder()} className="min-h-14 w-full rounded-lg bg-primary px-4 text-lg font-bold text-primary-foreground disabled:opacity-40">{saving ? "正式DBへ保存中…" : "未保存：出番順を保存"}</button></div>}
    </div> : <p className="rounded-xl border-2 border-dashed border-border bg-card px-4 py-5 text-center text-base text-muted-foreground">競技を選んでください。</p>}
  </div>
}
