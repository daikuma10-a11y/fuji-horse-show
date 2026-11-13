"use client"

import { useState } from "react"
import { Check } from "lucide-react"
import { MasterOrganizationPicker } from "@/components/master/organization-picker"
import type { MasterPickerProps, MasterRosterSource } from "@/lib/master/reception-form"
import { compareRosterMembers } from "@/lib/master/roster-order"

const normalized = (value: string) => value.normalize("NFKC").replace(/[\s　]+/g, "").toLocaleLowerCase("ja-JP")

export function MasterPlayerPicker({ source, selectedId, onSelect, registeredOnly = false, onNavigate }: MasterPickerProps & {source:MasterRosterSource}) {
  const { players, organizations } = source
  const canonicalOrgId=source.canonicalOrganizationId??((id:string)=>id)
  const selectablePlayers = players.filter(player => !registeredOnly || (player.jefRegistered && player.officialId))
  const [orgId, setOrgId] = useState<string | null>(null)
  const counts = new Map<string, number>()
  for (const player of selectablePlayers) {
    const id = canonicalOrgId(player.orgId)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const navigate = (id: string | null) => { setOrgId(id); onNavigate?.() }
  if (!orgId) return <><p className="mb-3 text-base">{registeredOnly ? "日馬連登録番号を確認できた選手のみ表示しています。" : ""}</p><MasterOrganizationPicker groups={organizations.filter(org=>canonicalOrgId(org.id)===org.id&&(counts.get(org.id)??0)>0)} counts={counts} onSelect={navigate} description="選手の所属団体を選んでください。" /></>
  const orgName = organizations.find(org => org.id === orgId)?.name
  const items = selectablePlayers.filter(player => canonicalOrgId(player.orgId) === orgId).sort(compareRosterMembers)
  return <div className="flex flex-col gap-4">
    <button type="button" onClick={() => navigate(null)} className="w-fit rounded-xl border-2 border-border px-5 py-3 text-lg font-bold">← 団体一覧へ</button>
    <h3 className="rounded-xl bg-secondary px-4 py-3 text-xl font-bold">{orgName}の選手</h3>
    {items.map(player => {
      const duplicate = items.filter(item => normalized(item.name) === normalized(player.name)).length > 1
      const source = duplicate ? organizations.find(org => org.id === player.orgId)?.name : undefined
      return <PickerRow key={player.id} selected={selectedId === player.id} title={player.name} source={source} needsReview={player.needsReview} manual={player.manual} onClick={() => onSelect(player.id)} />
    })}
  </div>
}

export function MasterHorsePicker({ source, selectedId, preferredOrganizationId, onSelect, registeredOnly = false, onNavigate }: MasterPickerProps & {source:MasterRosterSource}) {
  const { horses, organizations } = source
  const canonicalOrgId=source.canonicalOrganizationId??((id:string)=>id)
  const [orgId, setOrgId] = useState<string | null>(null)
  const counts = new Map<string, number>()
  const selectableHorses = horses.filter(horse => !registeredOnly || (horse.jefRegistered && horse.officialId))
  for (const horse of selectableHorses) {
    const id = canonicalOrgId(horse.orgId)
    counts.set(id, (counts.get(id) ?? 0) + 1)
  }
  const navigate = (id: string | null) => { setOrgId(id); onNavigate?.() }
  const groups = organizations.filter(org => canonicalOrgId(org.id) === org.id && counts.has(org.id))
  const preferred = preferredOrganizationId && organizations.find(org => org.id === canonicalOrgId(preferredOrganizationId))
  const visible = orgId ? organizations.find(org => org.id === orgId) : preferred
  const items = visible ? selectableHorses.filter(h => canonicalOrgId(h.orgId) === visible.id).sort(compareRosterMembers) : []
  const otherGroups = preferred ? groups.filter(org => org.id !== preferred.id) : groups
  return <div className="flex flex-col gap-4">
    {registeredOnly && <p>日馬連登録番号を確認できた馬のみ表示しています。</p>}
    {orgId && <button type="button" onClick={() => navigate(null)} className="w-fit rounded-xl border-2 border-border px-5 py-3 text-lg font-bold">← 団体一覧へ</button>}
    {visible && <>
      <h3 className="rounded-xl bg-secondary px-4 py-3 text-xl font-bold">{visible.name}の馬{!orgId && '（選手の所属）'}</h3>
      {items.length === 0 && <p>この団体に選択できる馬はいません。</p>}
      {items.map(horse => {
        const duplicate = items.some(item => item.id !== horse.id && normalized(item.name) === normalized(horse.name))
        const sourceLabel = duplicate ? organizations.find(org => org.id === horse.orgId)?.name : undefined
        return <PickerRow key={horse.id} selected={selectedId === horse.id} title={horse.name} source={sourceLabel} needsReview={horse.needsReview} manual={horse.manual} onClick={() => onSelect(horse.id)} />
      })}
    </>}
    {!orgId && otherGroups.length > 0 && <MasterOrganizationPicker groups={otherGroups} counts={counts} onSelect={navigate} description={preferred ? "他の団体の馬を選ぶ" : "馬の所属団体を選んでください。"} />}
    {!visible && groups.length === 0 && <p>選択できる馬はいません。</p>}
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
