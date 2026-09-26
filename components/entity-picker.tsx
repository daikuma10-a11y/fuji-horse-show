"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { useStore } from "@/lib/store"
import { canonicalOrgId } from "@/lib/organization-aliases"
import { OrganizationPicker } from "@/components/organization-picker"
import type { Horse, Player } from "@/lib/types"

const compare = <T extends { name: string; reading?: string }>(a: T, b: T) =>
  (a.reading?.trim() || a.name).localeCompare(b.reading?.trim() || b.name, "ja", { sensitivity: "base", numeric: true }) ||
  a.name.localeCompare(b.name, "ja")
const normalized = (value: string) => value.normalize("NFKC").replace(/[\s　]+/g, "").toLocaleLowerCase("ja-JP")

export function PlayerPicker({ selectedId, onSelect }: { selectedId?: string; onSelect: (playerId: string) => void }) {
  const { players, organizations } = useStore()
  // Autumn原本の p-119 と p-122 は名前にフリガナが連結された出番のない誤記。
  // 本人確認済みの候補だけ除外し、元データと正式DBの行は保持する。
  const selectablePlayers = players.filter(player => player.id !== "p-119" && player.id !== "p-122")
  const [orgId, setOrgId] = useState<string | null>(null)
  const counts = new Map<string, number>()
  for (const player of selectablePlayers) {
    const id = canonicalOrgId(player.orgId)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  if (!orgId) return <OrganizationPicker counts={counts} onSelect={setOrgId} description="選手の所属団体を選んでください。" />
  const orgName = organizations.find(org => org.id === orgId)?.name
  const items = selectablePlayers.filter(player => canonicalOrgId(player.orgId) === orgId).sort(compare<Player>)
  return <div className="flex flex-col gap-4">
    <button type="button" onClick={() => setOrgId(null)} className="w-fit rounded-xl border-2 border-border px-5 py-3 text-lg font-bold">← 団体一覧へ</button>
    <h3 className="rounded-xl bg-secondary px-4 py-3 text-xl font-bold">{orgName}の選手</h3>
    {items.map(player => {
      const duplicate = items.filter(item => normalized(item.name) === normalized(player.name)).length > 1
      const source = duplicate ? organizations.find(org => org.id === player.orgId)?.name : undefined
      return <PickerRow key={player.id} selected={selectedId === player.id} title={player.name} source={source} needsReview={player.needsReview} manual={player.manual} onClick={() => onSelect(player.id)} />
    })}
  </div>
}

export function HorsePicker({ selectedId, onSelect }: { selectedId?: string; onSelect: (horseId: string) => void }) {
  const { horses, organizations } = useStore()
  const [orgId, setOrgId] = useState<string | null>(null)
  const counts = new Map<string, number>()
  for (const horse of horses) {
    const id = canonicalOrgId(horse.orgId)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  if (!orgId) return <OrganizationPicker counts={counts} onSelect={setOrgId} description="馬の所属団体を選んでください。" />
  const orgName = organizations.find(org => org.id === orgId)?.name
  const items = horses.filter(horse => canonicalOrgId(horse.orgId) === orgId).sort(compare<Horse>)
  return <div className="flex flex-col gap-4">
    <button type="button" onClick={() => setOrgId(null)} className="w-fit rounded-xl border-2 border-border px-5 py-3 text-lg font-bold">← 団体一覧へ</button>
    <h3 className="rounded-xl bg-secondary px-4 py-3 text-xl font-bold">{orgName}の馬</h3>
    {items.map(horse => {
      const duplicate = items.filter(item => normalized(item.name) === normalized(horse.name)).length > 1
      const source = duplicate ? organizations.find(org => org.id === horse.orgId)?.name : undefined
      return <PickerRow key={horse.id} selected={selectedId === horse.id} title={horse.name} source={source} needsReview={horse.needsReview} manual={horse.manual} onClick={() => onSelect(horse.id)} />
    })}
  </div>
}

function PickerRow({ selected, title, source, manual, needsReview, onClick }: { selected: boolean; title: string; source?: string; manual?: boolean; needsReview?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className={`flex min-h-20 items-center gap-4 rounded-2xl border-2 px-5 py-3 text-left shadow-sm transition active:scale-[0.99] ${selected ? "border-primary bg-primary/10 ring-4 ring-primary/25" : "border-border bg-card hover:border-primary"}`}>
    <span className="min-w-0 flex-1">
      <span className="block text-2xl font-bold text-foreground">{title}</span>
      {source && <span className="mt-1 block text-sm font-semibold text-muted-foreground">原本の所属表記：{source}</span>}
      {(manual || needsReview) && <span className="mt-1 block text-sm font-semibold text-muted-foreground">{manual ? "手入力データ" : ""}{manual && needsReview ? "・" : ""}{needsReview ? "本部確認対象" : ""}</span>}
    </span>
    <span className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${selected ? "border-primary bg-primary text-primary-foreground" : "border-border"}`} aria-hidden="true">{selected && <Check className="size-6" />}</span>
  </button>
}
