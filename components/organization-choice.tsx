"use client"

import type { Organization } from "@/lib/types"

const confirmedAliases: Record<string, string> = {
  "org-2": "org-4",
  "org-6": "org-8",
  "org-23": "org-17",
  "org-24": "org-25",
}

export const canonicalOrgId = (id: string) => confirmedAliases[id] ?? id

export function OrganizationChoice({ playerOrg, horseOrg, selectedId, onSelect }: {
  playerOrg: Organization
  horseOrg: Organization
  selectedId: string
  onSelect: (id: string) => void
}) {
  const playerId = canonicalOrgId(playerOrg.id)
  const horseId = canonicalOrgId(horseOrg.id)
  if (playerId === horseId) return null
  return <fieldset className="mt-5 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4">
    <legend className="px-2 text-xl font-bold text-amber-950">このエントリーの所属団体を選択</legend>
    <p className="mb-3 text-base text-amber-950">選手と馬の登録団体が異なります。出番表と精算に使用する団体を選んでください。</p>
    <div className="flex flex-col gap-3">{[
      { id: playerId, label: "選手の所属" },
      { id: horseId, label: "馬の所属" },
    ].map(({ id, label }) => <label key={id} className={`flex min-h-16 items-center gap-3 rounded-xl border-2 bg-white p-3 ${selectedId === id ? "border-primary" : "border-border"}`}>
      <input type="radio" name="entry-organization" value={id} checked={selectedId === id} onChange={() => onSelect(id)} className="size-6 shrink-0 accent-primary" />
      <span className="text-lg font-bold">{label}：{id === playerId ? playerOrg.name : horseOrg.name}</span>
    </label>)}</div>
  </fieldset>
}
