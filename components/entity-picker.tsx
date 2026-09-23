"use client"

import { Check } from "lucide-react"
import { useStore } from "@/lib/store"

const jaSort = (a: string, b: string) => a.localeCompare(b, "ja", { sensitivity: "base", numeric: true })

/** 選手を所属団体ごとにまとめ、団体・選手とも五十音順で表示 */
export function PlayerPicker({ selectedId, onSelect }: { selectedId?: string; onSelect: (playerId: string) => void }) {
  const { players, organizations } = useStore()
  const groups = [...organizations].sort((a,b)=>jaSort(a.name,b.name)).map(org=>({org, items:players.filter(p=>p.orgId===org.id).sort((a,b)=>jaSort(a.name,b.name))})).filter(g=>g.items.length)
  return <div className="flex flex-col gap-6">{groups.map(({org,items})=><section key={org.id}>
    <h3 className="sticky top-0 z-10 mb-2 rounded-xl bg-secondary px-4 py-3 text-xl font-bold text-secondary-foreground">{org.name}</h3>
    <div className="flex flex-col gap-3">{items.map(p=><PickerRow key={p.id} selected={selectedId===p.id} title={p.name} onClick={()=>onSelect(p.id)}/>)}</div>
  </section>)}</div>
}

/** 馬を所属団体ごとにまとめ、団体・馬とも五十音順で表示 */
export function HorsePicker({ selectedId, onSelect }: { selectedId?: string; onSelect: (horseId: string) => void }) {
  const { horses, organizations } = useStore()
  const groups = [...organizations].sort((a,b)=>jaSort(a.name,b.name)).map(org=>({org, items:horses.filter(h=>h.orgId===org.id).sort((a,b)=>jaSort(a.name,b.name))})).filter(g=>g.items.length)
  return <div className="flex flex-col gap-6">{groups.map(({org,items})=><section key={org.id}>
    <h3 className="sticky top-0 z-10 mb-2 rounded-xl bg-secondary px-4 py-3 text-xl font-bold text-secondary-foreground">{org.name}</h3>
    <div className="flex flex-col gap-3">{items.map(h=><PickerRow key={h.id} selected={selectedId===h.id} title={h.name} onClick={()=>onSelect(h.id)}/>)}</div>
  </section>)}</div>
}

function PickerRow({ selected, title, onClick }: { selected: boolean; title: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} aria-pressed={selected} className={`flex min-h-20 items-center gap-4 rounded-2xl border-2 px-5 py-3 text-left shadow-sm transition active:scale-[0.99] ${selected?"border-primary bg-primary/10 ring-4 ring-primary/25":"border-border bg-card hover:border-primary"}`}>
    <span className="min-w-0 flex-1 text-2xl font-bold text-foreground">{title}</span>
    <span className={`flex size-10 shrink-0 items-center justify-center rounded-full border-2 ${selected?"border-primary bg-primary text-primary-foreground":"border-border"}`} aria-hidden="true">{selected&&<Check className="size-6"/>}</span>
  </button>
}
