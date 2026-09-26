"use client"

import { useStore } from "@/lib/store"
import { canonicalOrgId } from "@/lib/organization-aliases"
import type { Organization } from "@/lib/types"

const compare = (a: Organization, b: Organization) => a.name.localeCompare(b.name, "ja", { sensitivity: "base", numeric: true })

export function OrganizationPicker({ counts, onSelect, description }: {
  counts: Map<string, number>
  onSelect: (organizationId: string) => void
  description?: string
}) {
  const { organizations } = useStore()
  const groups = organizations.filter(org => canonicalOrgId(org.id) === org.id && (counts.get(org.id) ?? 0) > 0).sort(compare)
  return <div className="flex flex-col gap-3">
    {description && <p className="text-base font-semibold text-muted-foreground">{description}</p>}
    {groups.length === 0 && <p className="rounded-xl border border-border p-5 text-lg">選べる団体がありません。</p>}
    {groups.map(org => <button key={org.id} type="button" onClick={() => onSelect(org.id)} className="flex min-h-20 w-full items-center justify-between gap-3 rounded-2xl border-2 border-border bg-card px-5 py-4 text-left shadow-sm active:scale-[0.99]">
      <span className="min-w-0 break-words text-xl font-bold">{org.name}</span>
      <span className="shrink-0 text-base font-semibold text-muted-foreground">{counts.get(org.id)}件 <span aria-hidden="true">›</span></span>
    </button>)}
  </div>
}

export function EntryOrganizationPicker({ competitionId, onSelect }: {
  competitionId: string
  onSelect: (organizationId: string) => void
}) {
  const { entriesByCompetition, getHorse } = useStore()
  const counts = new Map<string, number>()
  for (const entry of entriesByCompetition(competitionId)) {
    if (entry.withdrawn) continue
    const orgId = entry.organizationId ?? getHorse(entry.horseId)?.orgId
    if (!orgId) continue
    const canonical = canonicalOrgId(orgId)
    counts.set(canonical, (counts.get(canonical) ?? 0) + 1)
  }
  return <OrganizationPicker counts={counts} onSelect={onSelect} description="選んだ競技に出番がある団体だけ表示しています。団体が見つからない場合は競技を選び直してください。" />
}
