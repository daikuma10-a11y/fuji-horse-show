"use client"
import {ClipboardList,Calculator,ListOrdered,Users} from 'lucide-react'
export type WinterAdminTab='requests'|'settlement'|'startlist'|'on-site'|'meeting'|'roster'
export const winterAdminTabs=[
 {id:'requests',label:'申請一覧',icon:ClipboardList},
 {id:'settlement',label:'精算',icon:Calculator},
 {id:'startlist',label:'出番表',icon:ListOrdered},
 {id:'on-site',label:'事後登録',icon:ClipboardList},
 {id:'meeting',label:'打ち合わせ会',icon:ListOrdered},
 {id:'roster',label:'人馬名簿',icon:Users},
] as const
export function WinterAdminNavigation({tab,onSelect}:{tab:WinterAdminTab;onSelect:(tab:WinterAdminTab)=>void}){
 return <div role="tablist" aria-label="本部の管理項目" className="print-hide mb-6 grid grid-cols-2 gap-2 rounded-2xl border-2 border-border bg-card p-2 sm:grid-cols-3 lg:grid-cols-6">
 {winterAdminTabs.map(t=>{const Icon=t.icon;return <button key={t.id} id={`winter-tab-${t.id}`} aria-controls={`winter-panel-${t.id}`} role="tab" tabIndex={tab===t.id?0:-1} aria-selected={tab===t.id} type="button" onClick={()=>onSelect(t.id)} onKeyDown={e=>{const i=winterAdminTabs.findIndex(x=>x.id===t.id);const target=e.key==='ArrowRight'?(i+1)%winterAdminTabs.length:e.key==='ArrowLeft'?(i-1+winterAdminTabs.length)%winterAdminTabs.length:e.key==='Home'?0:e.key==='End'?winterAdminTabs.length-1:null;if(target!==null){e.preventDefault();const next=winterAdminTabs[target].id;onSelect(next);document.getElementById(`winter-tab-${next}`)?.focus()}}} className={`flex min-h-16 items-center justify-center gap-2 rounded-xl px-3 text-xl font-bold transition ${tab===t.id?'bg-primary text-primary-foreground shadow-sm':'text-muted-foreground hover:bg-muted'}`}><Icon aria-hidden="true" className="size-6 shrink-0"/><span>{t.label}</span></button>})}
 </div>
}
