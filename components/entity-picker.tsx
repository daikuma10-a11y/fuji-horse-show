"use client"

import { Check } from "lucide-react"
import { useStore } from "@/lib/store"

/** 選手を選ぶ一覧 */
export function PlayerPicker({
  selectedId,
  onSelect,
}: {
  selectedId?: string
  onSelect: (playerId: string) => void
}) {
  const { players, getOrg } = useStore()
  return (
    <div className="flex flex-col gap-3">
      {players.map((p) => {
        const org = getOrg(p.orgId)
        const selected = selectedId === p.id
        return (
          <PickerRow
            key={p.id}
            selected={selected}
            title={p.name}
            subtitle={org?.name ?? ""}
            onClick={() => onSelect(p.id)}
          />
        )
      })}
    </div>
  )
}

/** 馬を選ぶ一覧（馬を選ぶと所属団体が決まります） */
export function HorsePicker({
  selectedId,
  onSelect,
}: {
  selectedId?: string
  onSelect: (horseId: string) => void
}) {
  const { horses, getOrg } = useStore()
  return (
    <div className="flex flex-col gap-3">
      {horses.map((h) => {
        const org = getOrg(h.orgId)
        const selected = selectedId === h.id
        return (
          <PickerRow
            key={h.id}
            selected={selected}
            title={h.name}
            subtitle={`所属団体：${org?.name ?? ""}`}
            onClick={() => onSelect(h.id)}
          />
        )
      })}
    </div>
  )
}

function PickerRow({
  selected,
  title,
  subtitle,
  onClick,
}: {
  selected: boolean
  title: string
  subtitle: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex min-h-20 items-center gap-4 rounded-2xl border-2 px-5 py-3 text-left shadow-sm transition active:scale-[0.99] ${
        selected ? "border-primary bg-primary/10 ring-4 ring-primary/25" : "border-border bg-card hover:border-primary"
      }`}
    >
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="text-2xl font-bold text-foreground">{title}</span>
        {subtitle && <span className="text-lg text-muted-foreground">{subtitle}</span>}
      </span>
      <span
        className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${
          selected ? "border-primary bg-primary text-primary-foreground" : "border-border"
        }`}
        aria-hidden="true"
      >
        {selected && <Check className="size-6" />}
      </span>
    </button>
  )
}
