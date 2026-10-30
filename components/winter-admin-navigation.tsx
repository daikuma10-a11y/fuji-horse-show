"use client"
import {MasterAdminNavigation} from './master/admin-navigation'
import {ClipboardList,Calculator,ListOrdered,Users} from 'lucide-react'
export type WinterAdminTab='requests'|'settlement'|'startlist'|'stable'|'timetable'|'on-site'|'meeting'|'roster'|'offline'
export const winterAdminTabs=[
 {id:'offline',label:'端末に預かった受付',icon:ClipboardList},
 {id:'requests',label:'申請一覧',icon:ClipboardList},
 {id:'settlement',label:'精算',icon:Calculator},
 {id:'startlist',label:'出番表',icon:ListOrdered},
 {id:'stable',label:'入厩情報',icon:ClipboardList},
 {id:'timetable',label:'タイムテーブル',icon:ListOrdered},
 {id:'on-site',label:'事後登録',icon:ClipboardList},
 {id:'meeting',label:'打ち合わせ会',icon:ListOrdered},
 {id:'roster',label:'事前登録',icon:Users},
] as const
export function WinterAdminNavigation({tab,onSelect}:{tab:WinterAdminTab;onSelect:(tab:WinterAdminTab)=>void}){
 return <MasterAdminNavigation tabs={winterAdminTabs} selectedId={tab} idPrefix="winter-tab" onSelect={id=>onSelect(id as WinterAdminTab)}/>
}
