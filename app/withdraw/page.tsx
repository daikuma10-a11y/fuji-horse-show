"use client"

import { useState } from "react"
import { AlertTriangle } from "lucide-react"
import { StepShell } from "@/components/step-shell"
import { DateSelect } from "@/components/date-select"
import { CompetitionList } from "@/components/competition-list"
import { StartList } from "@/components/start-list"
import { ActionButton } from "@/components/action-button"
import { SummaryCard, SummaryRow, CompletionScreen } from "@/components/summary"
import { useStore } from "@/lib/store"
import type { Competition, CompetitionDate, StartEntry } from "@/lib/types"

type Step = "date" | "competition" | "entry" | "confirm" | "done"

export default function WithdrawPage() {
  const { getPlayer, getHorse, getOrg, submitWithdraw } = useStore()
  const [step, setStep] = useState<Step>("date")
  const [date, setDate] = useState<CompetitionDate | null>(null)
  const [competition, setCompetition] = useState<Competition | null>(null)
  const [entry, setEntry] = useState<StartEntry | null>(null)

  const subtitle = "棄権のお申し込み"

  if (step === "done") {
    return <CompletionScreen subtitle={subtitle} message="棄権の受付が完了しました。" />
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
        description="棄権する競技を選びます"
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
        title="棄権する選手・馬を選んでください"
        description={`競技 ${competition.number}：${competition.name}`}
        onBack={() => setStep("competition")}
        footer={
          <ActionButton
            variant="danger"
            disabled={!entry}
            onClick={() => setStep("confirm")}
          >
            確認画面へすすむ
          </ActionButton>
        }
      >
        <StartList
          competitionId={competition.id}
          selectedId={entry?.id}
          onSelect={(e) => setEntry(e)}
        />
      </StepShell>
    )
  }

  if (step === "confirm" && competition && entry) {
    const player = getPlayer(entry.playerId)
    const horse = getHorse(entry.horseId)
    const org = horse ? getOrg(horse.orgId) : undefined
    return (
      <StepShell
        subtitle={subtitle}
        title="この内容で棄権します"
        description="よろしければ「棄権を確定する」を押してください"
        onBack={() => setStep("entry")}
        footer={
          <ActionButton
            variant="danger"
            onClick={() => {
              submitWithdraw({
                entryId: entry.id,
                competitionId: competition.id,
                playerId: entry.playerId,
                horseId: entry.horseId,
              })
              setStep("done")
            }}
          >
            棄権を確定する
          </ActionButton>
        }
      >
        <div className="flex items-center gap-3 rounded-2xl border-2 border-destructive/40 bg-destructive/5 p-4 text-xl font-bold text-destructive">
          <AlertTriangle className="size-8 shrink-0" aria-hidden="true" />
          この競技への出場を取りやめます
        </div>

        <div className="mt-5">
          <SummaryCard tone="danger" title="棄権する内容">
            <SummaryRow label="競技" value={`${competition.number}. ${competition.name}`} />
            <SummaryRow label="選手" value={player?.name ?? "―"} />
            <SummaryRow label="馬" value={horse?.name ?? "―"} />
            <SummaryRow label="所属団体" value={org?.name ?? "―"} />
          </SummaryCard>
        </div>
      </StepShell>
    )
  }

  return null
}
