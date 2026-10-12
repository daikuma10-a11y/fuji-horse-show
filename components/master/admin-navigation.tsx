"use client"
import type {LucideIcon} from 'lucide-react'
export type MasterAdminTab={id:string;label:string;icon:LucideIcon}
export function MasterAdminNavigation({tabs,selectedId,onSelect,pendingCount=0,idPrefix='master-tab'}:{tabs:readonly MasterAdminTab[];selectedId:string;onSelect:(id:string)=>void;pendingCount?:number;idPrefix?:string}){
 return <div role="tablist" aria-label="本部の管理項目" className="print-hide mb-6 grid grid-cols-2 gap-2 rounded-2xl border-2 border-border bg-card p-2 sm:grid-cols-5">
 {tabs.map((tab,index)=>{const Icon=tab.icon,active=selectedId===tab.id;return <button key={tab.id} id={`${idPrefix}-${tab.id}`} type="button" role="tab" tabIndex={active?0:-1} aria-selected={active} onClick={()=>onSelect(tab.id)} onKeyDown={e=>{const next=e.key==='ArrowRight'?(index+1)%tabs.length:e.key==='ArrowLeft'?(index-1+tabs.length)%tabs.length:e.key==='Home'?0:e.key==='End'?tabs.length-1:null;if(next!==null){e.preventDefault();onSelect(tabs[next].id);document.getElementById(`${idPrefix}-${tabs[next].id}`)?.focus()}}} className={`flex min-h-16 flex-1 items-center justify-center gap-2 rounded-xl px-3 text-xl font-bold transition ${active?'bg-primary text-primary-foreground shadow-sm':'text-muted-foreground'}`}><Icon aria-hidden="true" className="size-6"/><span>{tab.label}</span>{tab.id==='requests'&&pendingCount>0&&<span className="flex size-7 items-center justify-center rounded-full bg-destructive text-base text-white">{pendingCount}</span>}</button>})}
 </div>
}
