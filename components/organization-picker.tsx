"use client"

import { MasterOrganizationPicker } from "@/components/master/organization-picker"
import { useStore } from "@/lib/store"
import { canonicalOrgId } from "@/lib/organization-aliases"
import { compareOrganizations } from "@/lib/organization-order"


export function OrganizationPicker({ counts, onSelect, description }: {
  counts: Map<string, number>
  onSelect: (organizationId: string) => void
  description?: string
}) {
  const { organizations } = useStore()
  const groups = organizations.filter(org => canonicalOrgId(org.id) === org.id && (counts.get(org.id) ?? 0) > 0).sort(compareOrganizations)
  return <MasterOrganizationPicker groups={groups} counts={counts} onSelect={onSelect} description={description}/>
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
