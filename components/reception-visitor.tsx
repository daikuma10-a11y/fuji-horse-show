"use client"

import { useStore } from "@/lib/store"
import { compareOrganizations } from "@/lib/organization-order"
import { canonicalOrgId } from "@/lib/organization-aliases"

export function ReceptionVisitor({ organizationId, onOrganizationChange, name, onNameChange }: {
  organizationId: string
  onOrganizationChange: (id: string) => void
  name: string
  onNameChange: (name: string) => void
}) {
  const { organizations } = useStore()
  return <div className="mt-5 rounded-2xl border-2 border-border bg-card p-5">
    <h2 className="text-2xl font-bold">受付に来た方</h2>
    <p className="mt-1 text-base text-muted-foreground">申請する方の所属団体とお名前を入力してください。出場する選手の所属とは別に記録します。</p>
    <label className="mt-4 block text-lg font-semibold">所属団体
      <select required value={organizationId} onChange={e => onOrganizationChange(e.target.value)} className="mt-2 min-h-14 w-full rounded-xl border-2 border-border bg-background px-3 text-lg">
        <option value="">団体を選択</option>
        {organizations.filter(org => canonicalOrgId(org.id) === org.id).sort(compareOrganizations).map(org => <option value={org.id} key={org.id}>{org.name}</option>)}
      </select>
    </label>
    <label className="mt-4 block text-lg font-semibold">お名前
      <input required maxLength={80} autoComplete="name" value={name} onChange={e => onNameChange(e.target.value)} placeholder="受付に来た方のお名前" className="mt-2 min-h-14 w-full rounded-xl border-2 border-border bg-background px-4 text-lg" />
    </label>
  </div>
}
