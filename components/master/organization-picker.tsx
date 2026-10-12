"use client"
import type {Organization} from '@/lib/types'
export function MasterOrganizationPicker({groups,counts,onSelect,description}:{groups:readonly Organization[];counts:Map<string,number>;onSelect:(id:string)=>void;description?:string}) {
  return <div className="flex flex-col gap-3">
    {description && <p className="text-base font-semibold text-muted-foreground">{description}</p>}
    {groups.length === 0 && <p className="rounded-xl border border-border p-5 text-lg">選べる団体がありません。</p>}
    {groups.map(org => <button key={org.id} type="button" onClick={() => onSelect(org.id)} className="flex min-h-20 w-full items-center justify-between gap-3 rounded-2xl border-2 border-border bg-card px-5 py-4 text-left shadow-sm active:scale-[0.99]">
      <span className="min-w-0 break-words text-xl font-bold">{org.name}</span>
      <span className="shrink-0 text-base font-semibold text-muted-foreground">{counts.get(org.id)}件 <span aria-hidden="true">›</span></span>
    </button>)}
  </div>
}
