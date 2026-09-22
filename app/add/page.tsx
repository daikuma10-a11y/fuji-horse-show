"use client"

import { useState } from "react"
import { ChevronRight, Info } from "lucide-react"
import { StepShell } from "@/components/step-shell"
import { DateSelect } from "@/components/date-select"
import { CompetitionList } from "@/components/competition-list"
import { PlayerPicker, HorsePicker } from "@/components/entity-picker"
import { ActionButton } from "@/components/action-button"
import { SummaryCard, SummaryRow, CompletionScreen } from "@/components/summary"
import { OfficialBadge } from "@/components/official-badge"
import { useStore } from "@/lib/store"
import { calcAddFee, formatYen } from "@/lib/fees"
import { persistAddRequest } from "@/lib/reception-api"
import type { Competition, CompetitionDate } from "@/lib/types"

type Step = "date" | "competition" | "input" | "confirm" | "done"
type Picker = null | "player" | "horse"

export default function AddPage() {
  const { getPlayer, getHorse, getOrg, submitAdd } = useStore()
  const [step, setStep] = useState<Step>("date")
  const [date, setDate] = useState<CompetitionDate | null>(null)
  const [competition, setCompetition] = useState<Competition | null>(null)
  const [playerId, setPlayerId] = useState("")
  const [horseId, setHorseId] = useState("")
  const [note, setNote] = useState("")
  const [picker, setPicker] = useState<Picker>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const subtitle = "追加のお申し込み"
  const player = getPlayer(playerId)
  const horse = getHorse(horseId)
  const org = horse ? getOrg(horse.orgId) : undefined
  const fee = competition ? calcAddFee(competition) : null

  if (step === "done") return <CompletionScreen subtitle={subtitle} message="追加エントリーの受付が完了しました。大会本部の確認待ちです。" />

  if (step === "date") return <StepShell subtitle={subtitle} title="大会日を選んでください" onBack={() => history.back()} backLabel="やめる"><DateSelect onSelect={(d) => { setDate(d); setStep("competition") }} /></StepShell>

  if (step === "competition" && date) return <StepShell subtitle={subtitle} title="競技を選んでください" description="追加でエントリーする競技を選びます" onBack={() => setStep("date")}><CompetitionList date={date} onSelect={(c) => { setCompetition(c); setStep("input") }} /></StepShell>

  if (step === "input" && competition && picker === "player") return <StepShell subtitle={subtitle} title="選手を選んでください" onBack={() => setPicker(null)}><PlayerPicker selectedId={playerId} onSelect={(id) => { setPlayerId(id); setPicker(null) }} /></StepShell>

  if (step === "input" && competition && picker === "horse") return <StepShell subtitle={subtitle} title="馬を選んでください" description="馬を選ぶと所属団体が決まります" onBack={() => setPicker(null)}><HorsePicker selectedId={horseId} onSelect={(id) => { setHorseId(id); setPicker(null) }} /></StepShell>

  if (step === "input" && competition) return (
    <StepShell subtitle={subtitle} title="追加する内容を入力してください" description={`競技 ${competition.number}：${competition.name}`} onBack={() => setStep("competition")} footer={<ActionButton disabled={!playerId || !horseId} onClick={() => setStep("confirm")}>確認画面へすすむ</ActionButton>}>
      <div className="flex flex-col gap-3">
        <PickRow label="選手" value={player?.name ?? "未選択"} filled={!!player} onClick={() => setPicker("player")} />
        <PickRow label="馬" value={horse?.name ?? "未選択"} hint={org ? `所属団体：${org.name}` : undefined} filled={!!horse} onClick={() => setPicker("horse")} />
      </div>
      <div className="mt-6"><label htmlFor="note" className="mb-2 block text-2xl font-bold text-foreground">要望（任意）</label><p className="mb-3 text-lg text-muted-foreground">例：「○番の選手の前に入れてほしい」「別競技にも出場するため間隔を空けてほしい」</p><textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} rows={4} placeholder="ご要望があればご記入ください" className="w-full rounded-2xl border-2 border-border bg-card p-4 text-xl text-foreground shadow-sm focus:border-primary focus:outline-none" /></div>
      <div className="mt-5 flex items-start gap-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 text-lg text-foreground"><Info className="size-7 shrink-0 text-primary" aria-hidden="true" /><span>{competition.official ? <><strong>公認競技</strong>のため、原則として出番表の<strong>上側</strong>に追加します。</> : <><strong>非公認競技</strong>のため、原則として出番表の<strong>後ろ側</strong>に追加し、要望を考慮します。</>}</span></div>
    </StepShell>
  )

  if (step === "confirm" && competition && player && horse && org && fee) return (
    <StepShell subtitle={subtitle} title="この内容で追加します" description="よろしければ「追加を確定する」を押してください" onBack={() => setStep("input")} footer={<div className="flex flex-col gap-3">{saveError && <p className="rounded-xl bg-destructive/10 p-3 text-lg font-bold text-destructive">{saveError}</p>}<ActionButton disabled={saving} onClick={async () => { setSaving(true); setSaveError(null); try { await persistAddRequest({ competitionId: competition.id, riderId: playerId, horseId, organizationId: org.id, fee: fee.total, note }); submitAdd({ competitionId: competition.id, playerId, horseId, note }); setStep("done") } catch (error) { console.error(error); setSaveError("保存できませんでした。通信状況を確認して、もう一度お試しください。") } finally { setSaving(false) } }}>{saving ? "保存しています…" : "追加を確定する"}</ActionButton></div>}>
      <SummaryCard tone="primary" title="追加する内容"><SummaryRow label="競技" value={<span className="inline-flex items-center gap-2">{`${competition.number}. ${competition.name}`}{competition.official && <OfficialBadge />}</span>} /><SummaryRow label="選手" value={player.name} /><SummaryRow label="馬" value={horse.name} /><SummaryRow label="所属団体" value={org.name} />{note.trim() && <SummaryRow label="要望" value={<span className="text-xl">{note}</span>} />}</SummaryCard>
      <div className="mt-5"><SummaryCard title="料金"><SummaryRow label="追加基本料金" value={formatYen(fee.addBase)} /><SummaryRow label="エントリー料金" value={formatYen(fee.addEntry)} /><SummaryRow label="合計" value={<span className="text-primary">{formatYen(fee.total)}</span>} /></SummaryCard></div>
    </StepShell>
  )
  return null
}

function PickRow({ label, value, hint, filled, onClick }: { label: string; value: string; hint?: string; filled: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`flex min-h-20 items-center gap-4 rounded-2xl border-2 px-5 py-3 text-left shadow-sm transition active:scale-[0.99] ${filled ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary"}`}><span className="w-20 shrink-0 text-lg font-semibold text-muted-foreground">{label}</span><span className="flex min-w-0 flex-1 flex-col"><span className={`text-2xl font-bold ${filled ? "text-foreground" : "text-muted-foreground"}`}>{value}</span>{hint && <span className="text-base text-muted-foreground">{hint}</span>}</span><span className="shrink-0 rounded-lg bg-secondary px-4 py-2 text-lg font-bold text-secondary-foreground">選ぶ</span><ChevronRight className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" /></button>
}
