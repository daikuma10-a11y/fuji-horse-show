"use client"

import { Check } from "lucide-react"
import { useStore } from "@/lib/store"
import type { Horse, Organization, Player } from "@/lib/types"

const jaSort = (a: string, b: string) => a.localeCompare(b, "ja", { sensitivity: "base", numeric: true })
const sortKey = (item: { name: string; reading?: string }) => item.reading?.trim() || item.name
const compareMaster = <T extends { name: string; reading?: string }>(a: T, b: T) => jaSort(sortKey(a), sortKey(b)) || jaSort(a.name, b.name)

/** 選手を所属団体ごとにまとめ、読みがある場合は読み、なければ原本表示名で五十音順に表示する。 */
export function PlayerPicker({ selectedId, onSelect }: { selectedId?: string; onSelect: (playerId: string) => void }) {
  const { players, organizations } = useStore()
  const groups = [...organizations]
    .sort(compareMaster<Organization>)
    .map(org => ({ org, items: players.filter(p => p.orgId === org.id).sort(compareMaster<Player>) }))
    .filter(g => g.items.length)

  return <div className="flex flex-col gap-6">{groups.map(({org,items})=><section key={org.id}>
    <h3 className="sticky top-0 z-10 mb-2 rounded-xl bg-secondary px-4 py-3 text-xl font-bold text-secondary-foreground">{org.name}</h3>
    <div className="flex flex-col gap-3">{items.map(p=><PickerRow key={p.id} selected={selectedId===p.id} title={p.name} needsReview={p.needsReview} manual={p.manual} onClick={()=>onSelect(p.id)}/>)}</div>
  </section>)}</div>
}

/** 馬を所属団体ごとにまとめ、読みがある場合は読み、なければ原本表示名で五十音順に表示する。 */
export function HorsePicker({ selectedId, onSelect }: { selectedId?: string; onSelect: (horseId: string) => void }) {
  const { horses, organizations } = useStore()
  const groups = [...organizations]
    .sort(compareMaster<Organization>)
    .map(org => ({ org, items: horses.filter(h => h.orgId === org.id).sort(compareMaster<Horse>) }))
    .filter(g => g.items.length)

  return <div className="flex flex-col gap-6">{groups.map(({org,items})=><section key={org.id}>
    <h3 className="sticky top-0 z-10 mb-2 rounded-xl bg-secondary px-4 py-3 text-xl font-bold text-secondary-foreground">{org.name}</h3>
    <div className="flex flex-col gap-3">{items.map(h=><PickerRow key={h.id} selected={selectedId===h.id} title={h.name} needsReview={h.needsReview} manual={h.manual} onClick={()=>onSelect(h.id)}/>)}</div>
  </section>)}</div>
}

function PickerRow({ selected, title, manual, needsReview, onClick }: { selected: boolean; title: string; manual?: boolean; needsReview?: boolean; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className={`flex min-h-20 items-center gap-4 rounded-2xl border-2 px-5 py-3 text-left shadow-sm transition active:scale-[0.99] ${selected?"border-primary bg-primary/10 ring-4 ring-primary/25":"border-border bg-card hover:border-primary"}`}>
    <span className="min-w-0 flex-1">
      <span className="block text-2xl font-bold text-foreground">{title}</span>
      {(manual||needsReview)&&<span className="mt-1 block text-sm font-semibold text-muted-foreground">{manual?"手入力データ":""}{manual&&needsReview?"・":""}{needsReview?"本部確認対象":""}</span>}
    </span>
    <span className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${selected?"border-primary bg-primary text-primary-foreground":"border-border"}`} aria-hidden="true">{selected&&<Check className="size-6"/>}</span>
  </button>
}
