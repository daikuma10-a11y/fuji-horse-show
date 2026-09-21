"use client"

import { useState } from "react"
import { AlertTriangle, ChevronRight, Info } from "lucide-react"
import { StepShell } from "@/components/step-shell"
import { DateSelect } from "@/components/date-select"
import { CompetitionList } from "@/components/competition-list"
import { StartList } from "@/components/start-list"
import { PlayerPicker, HorsePicker } from "@/components/entity-picker"
import { ActionButton } from "@/components/action-button"
import { SummaryCard, SummaryRow, CompletionScreen } from "@/components/summary"
import { useStore } from "@/lib/store"
import { calcChangeFee, calcWithdrawAddFee, formatYen } from "@/lib/fees"
import type { Competition, CompetitionDate, StartEntry } from "@/lib/types"

type Step = "date" | "competition" | "entry" | "edit" | "confirm" | "done"
type Picker = null | "comp-date" | "comp-list" | "player" | "horse"

export default function ChangePage() {
  const { getCompetition, getPlayer, getHorse, getOrg, submitChange } = useStore()
  const [step, setStep] = useState<Step>("date")
  const [date, setDate] = useState<CompetitionDate | null>(null)
  const [competition, setCompetition] = useState<Competition | null>(null)
  const [entry, setEntry] = useState<StartEntry | null>(null)

  // 変更後の内容
  const [toCompId, setToCompId] = useState<string>("")
  const [toPlayerId, setToPlayerId] = useState<string>("")
  const [toHorseId, setToHorseId] = useState<string>("")

  // サブ選択画面
  const [picker, setPicker] = useState<Picker>(null)
  const [pickerDate, setPickerDate] = useState<CompetitionDate | null>(null)

  const subtitle = "変更のお申し込み"

  function beginEdit(e: StartEntry) {
    setEntry(e)
    setToCompId(e.competitionId)
    setToPlayerId(e.playerId)
    setToHorseId(e.horseId)
    setStep("edit")
  }

  if (step === "done") {
    return <CompletionScreen subtitle={subtitle} message="変更の受付が完了しました。" />
  }

  if (step === "date") {
    return (
      <StepShell subtitle={subtitle} title="大会日を選んでください" onBack={() => history.back()} backLabel="やめる">
        <DateSelect
          onSelect={(d) => {
            setDate(d)
            setStep("competition")
          }}
        />
      </StepShell>
    )
  }

  if (step === "competition" && date) {
    return (
      <StepShell
        subtitle={subtitle}
        title="競技を選んでください"
        description="変更したい登録がある競技を選びます"
        onBack={() => setStep("date")}
      >
        <CompetitionList
          date={date}
          onSelect={(c) => {
            setCompetition(c)
            setStep("entry")
          }}
        />
      </StepShell>
    )
  }

  if (step === "entry" && competition) {
    return (
      <StepShell
        subtitle={subtitle}
        title="変更する選手・馬を選んでください"
        description={`競技 ${competition.number}：${competition.name}`}
        onBack={() => setStep("competition")}
      >
        <StartList competitionId={competition.id} onSelect={beginEdit} />
      </StepShell>
    )
  }

  // 変更後の各値
  const fromComp = entry ? getCompetition(entry.competitionId) : undefined
  const fromPlayer = entry ? getPlayer(entry.playerId) : undefined
  const fromHorse = entry ? getHorse(entry.horseId) : undefined
  const fromOrg = fromHorse ? getOrg(fromHorse.orgId) : undefined

  const toComp = getCompetition(toCompId)
  const toPlayer = getPlayer(toPlayerId)
  const toHorse = getHorse(toHorseId)
  const toOrg = toHorse ? getOrg(toHorse.orgId) : undefined

  const changedFields: Array<"competition" | "player" | "horse"> = []
  if (entry) {
    if (toCompId !== entry.competitionId) changedFields.push("competition")
    if (toPlayerId !== entry.playerId) changedFields.push("player")
    if (toHorseId !== entry.horseId) changedFields.push("horse")
  }
  const treatedAsWithdrawAdd = changedFields.length >= 2
  const fee =
    fromComp && toComp
      ? treatedAsWithdrawAdd
        ? calcWithdrawAddFee(toComp)
        : calcChangeFee(fromComp, toComp)
      : null

  // サブ選択画面（変更後の競技・選手・馬を選ぶ）
  if (step === "edit" && picker) {
    if (picker === "comp-date") {
      return (
        <StepShell subtitle={subtitle} title="変更後の大会日を選んでください" description="別の日の競技にも変更できます" onBack={() => setPicker(null)}>
          <DateSelect
            onSelect={(d) => {
              setPickerDate(d)
              setPicker("comp-list")
            }}
          />
        </StepShell>
      )
    }
    if (picker === "comp-list" && pickerDate) {
      return (
        <StepShell subtitle={subtitle} title="変更後の競技を選んでください" onBack={() => setPicker("comp-date")}>
          <CompetitionList
            date={pickerDate}
            onSelect={(c) => {
              setToCompId(c.id)
              setPicker(null)
            }}
          />
        </StepShell>
      )
    }
    if (picker === "player") {
      return (
        <StepShell subtitle={subtitle} title="変更後の選手を選んでください" onBack={() => setPicker(null)}>
          <PlayerPicker
            selectedId={toPlayerId}
            onSelect={(id) => {
              setToPlayerId(id)
              setPicker(null)
            }}
          />
        </StepShell>
      )
    }
    if (picker === "horse") {
      return (
        <StepShell subtitle={subtitle} title="変更後の馬を選んでください" description="馬を選ぶと所属団体が決まります" onBack={() => setPicker(null)}>
          <HorsePicker
            selectedId={toHorseId}
            onSelect={(id) => {
              setToHorseId(id)
              setPicker(null)
            }}
          />
        </StepShell>
      )
    }
  }

  if (step === "edit" && entry) {
    return (
      <StepShell
        subtitle={subtitle}
        title="変更する内容を入力してください"
        description="変更したい項目だけ選び直してください"
        onBack={() => setStep("entry")}
        footer={
          <ActionButton disabled={changedFields.length === 0} onClick={() => setStep("confirm")}>
            確認画面へすすむ
          </ActionButton>
        }
      >
        <SummaryCard title="現在の登録内容（変更前）">
          <SummaryRow label="競技" value={fromComp ? `${fromComp.number}. ${fromComp.name}` : "―"} />
          <SummaryRow label="選手" value={fromPlayer?.name ?? "―"} />
          <SummaryRow label="馬" value={fromHorse?.name ?? "―"} />
          <SummaryRow label="所属団体" value={fromOrg?.name ?? "―"} />
        </SummaryCard>

        <h2 className="mt-6 mb-3 text-2xl font-bold text-foreground">変更後の内容</h2>
        <div className="flex flex-col gap-3">
          <EditRow
            label="競技"
            changed={changedFields.includes("competition")}
            value={toComp ? `${toComp.number}. ${toComp.name}` : "―"}
            hint={toComp ? `エントリー料金 ${formatYen(toComp.entryFee)}` : undefined}
            onClick={() => {
              setPickerDate(toComp?.date ?? date)
              setPicker("comp-date")
            }}
          />
          <EditRow
            label="選手"
            changed={changedFields.includes("player")}
            value={toPlayer?.name ?? "―"}
            onClick={() => setPicker("player")}
          />
          <EditRow
            label="馬"
            changed={changedFields.includes("horse")}
            value={toHorse?.name ?? "―"}
            hint={toOrg ? `所属団体：${toOrg.name}` : undefined}
            onClick={() => setPicker("horse")}
          />
        </div>

        {treatedAsWithdrawAdd && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border-2 border-accent bg-accent/15 p-4 text-lg font-semibold text-foreground">
            <AlertTriangle className="size-7 shrink-0 text-accent-foreground" aria-hidden="true" />
            <span>
              2項目以上を変更するため、この申請は<strong>「棄権＋追加」</strong>として扱われます。
              料金は追加の扱い（3,000円＋追加先競技のエントリー料金）になります。
            </span>
          </div>
        )}

        {changedFields.length === 1 && (
          <div className="mt-5 flex items-start gap-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 text-lg font-semibold text-foreground">
            <Info className="size-7 shrink-0 text-primary" aria-hidden="true" />
            <span>1項目のみの変更のため「変更」として扱われます（変更料金 2,000円）。</span>
          </div>
        )}
      </StepShell>
    )
  }

  if (step === "confirm" && entry && fromComp && toComp && fee) {
    return (
      <StepShell
        subtitle={subtitle}
        title="この内容で変更します"
        description="よろしければ「変更を確定する」を押してください"
        onBack={() => setStep("edit")}
        footer={
          <ActionButton
            onClick={() => {
              submitChange({
                entryId: entry.id,
                fromCompetitionId: entry.competitionId,
                fromPlayerId: entry.playerId,
                fromHorseId: entry.horseId,
                toCompetitionId: toCompId,
                toPlayerId,
                toHorseId,
                changedFields,
                treatedAsWithdrawAdd,
              })
              setStep("done")
            }}
          >
            変更を確定する
          </ActionButton>
        }
      >
        {treatedAsWithdrawAdd && (
          <div className="mb-5 flex items-start gap-3 rounded-2xl border-2 border-accent bg-accent/15 p-4 text-lg font-bold text-foreground">
            <AlertTriangle className="size-7 shrink-0 text-accent-foreground" aria-hidden="true" />
            この申請は「棄権＋追加」として扱われます
          </div>
        )}

        <SummaryCard title="変更前">
          <SummaryRow label="競技" value={`${fromComp.number}. ${fromComp.name}`} />
          <SummaryRow label="選手" value={fromPlayer?.name ?? "―"} />
          <SummaryRow label="馬" value={fromHorse?.name ?? "―"} />
        </SummaryCard>

        <div className="my-3 text-center text-4xl text-primary" aria-hidden="true">
          ↓
        </div>

        <SummaryCard tone="primary" title="変更後">
          <SummaryRow label="競技" value={`${toComp.number}. ${toComp.name}`} />
          <SummaryRow label="選手" value={toPlayer?.name ?? "―"} />
          <SummaryRow label="馬" value={toHorse?.name ?? "―"} />
          <SummaryRow label="所属団体" value={toOrg?.name ?? "―"} />
        </SummaryCard>

        <div className="mt-5">
          <SummaryCard title="料金">
            {fee.changeBase > 0 && <SummaryRow label="変更料金" value={formatYen(fee.changeBase)} />}
            {fee.competitionDiff > 0 && (
              <SummaryRow label="競技変更の差額" value={formatYen(fee.competitionDiff)} />
            )}
            {fee.addBase > 0 && <SummaryRow label="追加基本料金" value={formatYen(fee.addBase)} />}
            {fee.addEntry > 0 && <SummaryRow label="追加先エントリー料金" value={formatYen(fee.addEntry)} />}
            <SummaryRow label="合計" value={<span className="text-primary">{formatYen(fee.total)}</span>} />
          </SummaryCard>
        </div>
      </StepShell>
    )
  }

  return null
}

function EditRow({
  label,
  value,
  hint,
  changed,
  onClick,
}: {
  label: string
  value: string
  hint?: string
  changed: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-20 items-center gap-4 rounded-2xl border-2 px-5 py-3 text-left shadow-sm transition active:scale-[0.99] ${
        changed ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary"
      }`}
    >
      <span className="flex w-20 shrink-0 flex-col">
        <span className="text-lg font-semibold text-muted-foreground">{label}</span>
        {changed && <span className="text-base font-bold text-primary">変更あり</span>}
      </span>
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-2xl font-bold text-foreground">{value}</span>
        {hint && <span className="text-base text-muted-foreground">{hint}</span>}
      </span>
      <span className="shrink-0 rounded-lg bg-secondary px-4 py-2 text-lg font-bold text-secondary-foreground">
        選ぶ
      </span>
      <ChevronRight className="size-6 shrink-0 text-muted-foreground" aria-hidden="true" />
    </button>
  )
}
