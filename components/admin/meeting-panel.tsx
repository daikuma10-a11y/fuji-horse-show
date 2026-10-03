"use client"

import { useEffect, useRef, useState } from "react"
import { useStore } from "@/lib/store"
import { loadAutumnEntryRows, type AdminSession } from "@/lib/supabase-rest"
import { applyMeetingDraft, archiveMeetingDraft, loadMeetingDraft, meetingEntries, saveMeetingDraft, type MeetingContent, type MeetingDraft, type StagedRegistration } from "@/lib/meeting-drafts"
import { compareOrganizations } from "@/lib/organization-order"
import { formatYen } from "@/lib/fees"
import type { StartEntry } from "@/lib/types"
import { StartList } from "@/components/start-list"
import { monitorRows, type MeetingMonitorSnapshot } from "@/lib/meeting-monitor"
import { OnSiteReception } from "./on-site-reception"

const RECOVERY_KEY = "fhs-autumn-meeting-work-v1"
const clean = (content: MeetingContent): MeetingContent => ({ baseEntries: content.baseEntries, baseOfficial: content.baseOfficial, staged: content.staged, orders: content.orders })
const timestamp = (value: string) => new Intl.DateTimeFormat("ja-JP", { timeZone: "Asia/Tokyo", month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(value))

export function MeetingPanel({ session }: { session: AdminSession }) {
  const { competitions, startEntries, organizations, getOrg, getPlayer, getHorse, reconciliation } = useStore()
  const [draft, setDraft] = useState<MeetingDraft | null>(null)
  const [content, setContent] = useState<MeetingContent | null>(null)
  const [savedContent, setSavedContent] = useState("")
  const [competitionId, setCompetitionId] = useState(competitions[0]?.id ?? "")
  const [selectedEntry, setSelectedEntry] = useState<StartEntry>()
  const [selectedAction, setSelectedAction] = useState<"change" | "withdraw">("change")
  const [actionEntry, setActionEntry] = useState<StartEntry>()
  const actionDialog = useRef<HTMLDialogElement>(null)
  const inputSection = useRef<HTMLFieldSetElement>(null)
  useEffect(() => {
    if (!actionEntry) return
    const dialog = actionDialog.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => { if (dialog?.open) dialog.close() }
  }, [actionEntry])
  function chooseAction(action: "change" | "withdraw") {
    if (!actionEntry) return
    setSelectedEntry({ ...actionEntry }); setSelectedAction(action); setActionEntry(undefined)
    requestAnimationFrame(() => inputSection.current?.scrollIntoView({ behavior: "smooth", block: "start" }))
  }
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")
  const [confirmed, setConfirmed] = useState(false)
  const [loaded, setLoaded] = useState(false)
  useEffect(() => {
    if (loaded || !["verified", "warning"].includes(reconciliation.state)) return
    let active = true
    async function load() {
      try {
        if (reconciliation.unresolved > 0) throw new Error("正式出番表に照合できない人馬があります。本部出番表の照合を確認してから打ち合わせ会を開始してください。")
        const [saved, official] = await Promise.all([loadMeetingDraft(session), loadAutumnEntryRows()])
        if (!active) return
        const normalize = (value: string) => value.normalize("NFKC").replace(/[\s　]+/g, "")
        if (!saved && startEntries.some(entry => {
          const row = official.find(item => item.entry_id === entry.id)
          return !row || row.start_order !== entry.order || Number(row.competition_no) !== competitions.find(comp => comp.id === entry.competitionId)?.number
            || !!entry.withdrawn !== ["wd", "withdrawn"].includes(row.status.toLowerCase()) || !!entry.isOp !== !!row.is_op
            || normalize(row.rider_name) !== normalize(getPlayer(entry.playerId)?.name ?? "") || normalize(row.horse_name) !== normalize(getHorse(entry.horseId)?.name ?? "")
        })) throw new Error("読み込み中に正式出番表が更新されました。画面を再読み込みしてから開始してください。")
        let next = saved ? clean(saved.content) : { baseEntries: startEntries, baseOfficial: official, staged: [], orders: {} }
        const baseSaved = JSON.stringify(next)
        let restored: { draft: MeetingDraft | null; content: MeetingContent } | null = null
        try { restored = JSON.parse(sessionStorage.getItem(RECOVERY_KEY) ?? "null") } catch { /* 正式な下書きから開始する */ }
        if (restored && (saved ? restored.draft?.id === saved.id && restored.draft.revision === saved.revision : !restored.draft)) next = restored.content
        setDraft(saved); setContent(next); setSavedContent(baseSaved); setLoaded(true)
      } catch (cause) { if (active) { setError(cause instanceof Error ? cause.message : "下書きを読み込めません"); setLoaded(true) } }
    }
    void load()
    return () => { active = false }
  }, [loaded, reconciliation.state, session, startEntries])
  useEffect(() => {
    if (content && loaded) {
      try { sessionStorage.setItem(RECOVERY_KEY, JSON.stringify({ draft, content })) } catch { setError("この端末に作業内容を保持できません。下書き保存を押してください。") }
    }
  }, [content, draft, loaded])
  const dirty = !!content && JSON.stringify(content) !== savedContent
  const preview = content ? meetingEntries(content, competitions) : []
  const selected = competitions.find(comp => comp.id === competitionId)
  const rows = preview.filter(row => row.competitionId === competitionId)
  const monitorToken = useRef<string | null>(null)
  useEffect(() => {
    if (!content || !selected || !monitorToken.current) return
    const channel = new BroadcastChannel(monitorToken.current)
    const send = () => {
      const snapshot: MeetingMonitorSnapshot = { kind: "snapshot", competition: `第${selected.number}競技 ${selected.name}${selected.official ? " ★公認" : ""}`, rows: monitorRows(rows, id => getPlayer(id)?.name ?? "—", id => getHorse(id)?.name ?? "—", id => getOrg(id)?.name ?? "—"), sentAt: Date.now(), saved: !!draft && !dirty }
      channel.postMessage(snapshot)
    }
    channel.onmessage = event => { if (event.data?.kind === "request") send() }
    send()
    const timer = window.setInterval(send, 2000)
    return () => { window.clearInterval(timer); channel.close() }
  }, [content, competitionId, draft, dirty])
  function openMonitor() {
    if (!monitorToken.current) monitorToken.current = `fhs-meeting-${crypto.randomUUID()}`
    const opened = window.open(`/meeting-display#${monitorToken.current}`, "fhs-meeting-monitor", "popup,width=1280,height=900")
    if (!opened) { setError("モニター表示を開けません。ブラウザのポップアップを許可して、もう一度押してください。"); return }
    // Start the sender after a newly opened monitor requests its initial snapshot.
    setContent(previous => previous ? { ...previous } : previous)
  }
  const reserved = new Set(content?.staged.flatMap(item => [item.request.change?.entryId, item.request.withdraw?.entryId].filter(Boolean)) ?? [])
  function edit(next: MeetingContent) { setContent(next); setConfirmed(false); setError("") }
  function stage(item: StagedRegistration) {
    if (!content || busy) return
    const next = { ...content, staged: [...content.staged, item], orders: { ...content.orders } }
    const change = item.request.change
    const originalId = change?.entryId ?? item.request.withdraw?.entryId
    const affected = new Set([item.record.competition_key, change?.fromCompetitionId ?? item.request.withdraw?.competitionId ?? item.record.competition_key])
    const nextRows = meetingEntries({ ...next, orders: {} }, competitions)
    for (const id of affected) {
      const available = new Set(nextRows.filter(row => row.competitionId === id && !row.withdrawn).map(row => row.id))
      const current = preview.filter(row => row.competitionId === id && !row.withdrawn).map(row => row.id)
      const ids = current.filter(key => available.has(key))
      const token = `request:${item.request.id}`
      if (available.has(token)) {
        const index = change && !change.treatedAsWithdrawAdd && change.fromCompetitionId === id
          ? Math.max(0, current.indexOf(originalId!))
          : competitions.find(comp => comp.id === id)?.official ? 0 : ids.length
        ids.splice(Math.min(index, ids.length), 0, token)
      }
      next.orders[id] = ids
    }
    edit(next); setSelectedEntry(undefined)
  }
  function remove(item: StagedRegistration) {
    if (!content || busy) return
    const next = { ...content, staged: content.staged.filter(row => row.request.id !== item.request.id), orders: { ...content.orders } }
    const originalId = item.request.change?.entryId ?? item.request.withdraw?.entryId
    const original = content.baseEntries.find(row => row.id === originalId)
    if (original && !original.withdrawn) {
      const current = preview.filter(row => row.competitionId === original.competitionId && !row.withdrawn).map(row => row.id)
      const tokenIndex = current.indexOf(`request:${item.request.id}`)
      const ids = current.filter(key => key !== `request:${item.request.id}` && key !== original.id)
      ids.splice(Math.min(tokenIndex >= 0 ? tokenIndex : Math.max(0, original.order - 1), ids.length), 0, original.id)
      next.orders[original.competitionId] = ids
    }
    edit(next); setSelectedEntry(undefined)
  }
  function move(source: string, target: string) {
    if (!content || busy || source === target) return
    const ids = rows.filter(row => !row.withdrawn).map(row => row.id)
    const from = ids.indexOf(source), to = ids.indexOf(target)
    if (from < 0 || to < 0) return
    ids.splice(from, 1); ids.splice(to, 0, source)
    edit({ ...content, orders: { ...content.orders, [competitionId]: ids } })
  }
  async function save() {
    if (!content || busy) return
    setBusy(true); setError("")
    try {
      const saved = await saveMeetingDraft(draft?.id ?? crypto.randomUUID(), draft?.revision ?? 0, content, competitions, session)
      const next = clean(saved.content)
      setDraft(saved); setContent(next); setSavedContent(JSON.stringify(next)); setConfirmed(false)
    } catch (cause) { setError(cause instanceof Error ? cause.message : "保存できません") }
    finally { setBusy(false) }
  }
  async function reflect() {
    if (!draft || !confirmed || dirty || busy) return
    setBusy(true); setError("")
    try {
      await applyMeetingDraft(draft.id, draft.revision, session)
      sessionStorage.removeItem(RECOVERY_KEY)
      window.location.reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "反映できません"); setBusy(false) }
  }
  async function restart() {
    if (busy || !window.confirm("現在の打ち合わせ会の作業を終了し、最新の正式出番表からやり直しますか？保存済みの下書きは履歴に残ります。")) return
    setBusy(true); setError("")
    try {
      if (draft) await archiveMeetingDraft(draft.id, draft.revision, session)
      sessionStorage.removeItem(RECOVERY_KEY)
      window.location.reload()
    } catch (cause) { setError(cause instanceof Error ? cause.message : "やり直しできません"); setBusy(false) }
  }
  if (!content) return <p role={error ? "alert" : undefined} className="rounded-xl border p-5">{error || (reconciliation.state === "error" ? reconciliation.message : "打ち合わせ会用出番表を読み込んでいます…")}</p>
  const groups = organizations.filter(org => content.staged.some(item => item.request.orgId === org.id)).sort(compareOrganizations)
  return <div className="space-y-4">
    <section className="rounded-2xl border-2 border-primary bg-card p-4">
      <h2 className="text-2xl font-bold">打ち合わせ会</h2><button type="button" onClick={openMonitor} className="mt-3 min-h-12 rounded-xl bg-primary px-4 font-bold text-primary-foreground">モニター表示（出番表のみ）</button><p className="mt-2 text-sm text-muted-foreground">別ウィンドウを外部モニターへ移してください。現在の競技と下書きの変更がリアルタイムで表示されます。</p>
      <p className="mt-2">競技を切り替えながら、各団体の追加・変更・棄権と出番の移動を入力できます。最後に全競技をまとめて保存し、最終確認後に正式出番表・精算へ反映してください。</p>
      <p className="mt-3 font-bold text-primary">{dirty ? "未保存の変更があります" : draft ? `下書き保存済み：${timestamp(draft.updated_at)} ／ 正式未反映` : "正式出番表から開始 ／ 正式未反映"}</p>
      <button type="button" disabled={busy} onClick={() => void restart()} className="mt-3 min-h-11 rounded-lg border px-3 text-sm font-semibold">最新の正式出番表からやり直す</button>
    </section>
    <label className="block text-lg font-bold">打ち合わせ中の競技<select disabled={busy} value={competitionId} onChange={event => { setCompetitionId(event.target.value); setSelectedEntry(undefined) }} className="mt-2 min-h-14 w-full rounded-xl border-2 border-border bg-card px-3">{competitions.map(comp => <option key={comp.id} value={comp.id}>{comp.date.slice(5)} ／ 第{comp.number}競技 {comp.name}{comp.official ? " ★公認" : ""}</option>)}</select></label>
    <section className="rounded-xl border-2 border-border bg-card p-3">
      <h3 className="mb-2 text-lg font-bold">打ち合わせ会用出番表：第{selected?.number}競技</h3>
      <p className="mb-3 text-sm">移動マークを押したまま上下に動かせます。選手名・馬名をクリックすると、変更・棄権を選べます。</p>
      <StartList competitionId={competitionId} draftEntries={rows} showAdminChanges compact dense adminReorder={!busy} onReorder={move} selectedId={selectedEntry?.id} onNameSelect={row => {
        if (busy || row.withdrawn) return
        if (row.id.startsWith("request:") || reserved.has(row.id)) { setError("入力済みの人馬を修正する場合は、下の確認一覧から該当申請を外して入力し直してください。"); return }
        setActionEntry(content.baseEntries.find(original => original.id === row.id))
      }} />
    </section>
    <dialog ref={actionDialog} onCancel={() => setActionEntry(undefined)} aria-labelledby="meeting-action-title" className="m-auto w-[calc(100%-2rem)] max-w-lg rounded-2xl border-2 border-primary bg-card p-5 text-foreground shadow-xl backdrop:bg-black/40">
      <h3 id="meeting-action-title" className="text-xl font-bold">変更・棄権する人馬</h3>
      <p className="mt-3 font-bold">{actionEntry?.order}番　{actionEntry && getPlayer(actionEntry.playerId)?.name} ／ {actionEntry && getHorse(actionEntry.horseId)?.name}</p>
      <p className="mt-2 text-sm">内容は下書きに登録し、最終確認後に反映します。</p>
      <div className="mt-4 grid grid-cols-2 gap-3"><button type="button" onClick={() => chooseAction("change")} className="min-h-14 rounded-xl bg-violet-700 px-4 font-bold text-white">変更する</button><button type="button" onClick={() => chooseAction("withdraw")} className="min-h-14 rounded-xl bg-destructive px-4 font-bold text-white">棄権する</button></div>
      <button type="button" onClick={() => setActionEntry(undefined)} className="mt-3 min-h-12 w-full rounded-xl border-2 font-bold">閉じる</button>
    </dialog>
    <fieldset ref={inputSection} disabled={busy} className="min-w-0 scroll-mt-4"><OnSiteReception session={session} meeting={{ competitionId, selectedEntry, selectedAction, staged: content.staged, onStage: stage, disabled: busy }} /></fieldset>
    <section className="rounded-2xl border-2 border-border bg-card p-4">
      <h3 className="text-xl font-bold">全競技の確認一覧（{content.staged.length}件）</h3>
      <p className="mt-1 text-sm">並べ替え：{Object.keys(content.orders).length}競技 ／ 追加・変更の料金合計：{formatYen(content.staged.reduce((sum, item) => sum + item.request.fee.total, 0))}</p>
      {groups.map(org => <details key={org.id} open className="mt-3 rounded-xl border p-3"><summary className="font-bold">{getOrg(org.id)?.name}（{content.staged.filter(item => item.request.orgId === org.id).length}件）</summary><div className="divide-y">{content.staged.filter(item => item.request.orgId === org.id).sort((a, b) => (competitions.find(comp => comp.id === a.record.competition_key)?.number ?? 0) - (competitions.find(comp => comp.id === b.record.competition_key)?.number ?? 0)).map(item => <div key={item.request.id} className="flex items-center gap-3 py-3"><p className="min-w-0 flex-1 text-sm font-semibold">{item.label}</p><button type="button" disabled={busy} onClick={() => remove(item)} className="min-h-11 rounded-lg border border-destructive px-3 font-bold text-destructive">外す</button></div>)}</div></details>)}
      {error && <p role="alert" className="mt-3 rounded-xl bg-destructive/10 p-3 font-bold text-destructive">{error}</p>}
      <button type="button" disabled={busy || !dirty && !!draft} onClick={() => void save()} className="mt-4 min-h-14 w-full rounded-xl bg-primary px-4 text-lg font-bold text-primary-foreground disabled:opacity-50">{busy ? "処理中…" : "全競技をまとめて下書き保存"}</button>
      {draft && !dirty && <div className="mt-4 rounded-xl border-2 border-amber-300 p-4"><label className="flex items-center gap-3 font-bold"><input type="checkbox" disabled={busy} checked={confirmed} onChange={event => setConfirmed(event.target.checked)} className="size-6" />全競技の人馬・出番・料金を最終確認した</label><button type="button" disabled={busy || !confirmed} onClick={() => void reflect()} className="mt-3 min-h-14 w-full rounded-xl bg-primary px-4 text-lg font-bold text-primary-foreground disabled:opacity-40">正式出番表・精算へまとめて反映</button></div>}
    </section>
  </div>
}
