"use client"
import {useState,type ReactNode} from 'react'

import type {MasterTimetableItem} from '@/lib/master/timetable'
export function MasterCompetitionTime({inspection,start,phase}:{inspection?:string|null;start?:string|null;phase?:'provisional'|'final'}){
 return <p className="my-2 flex flex-wrap gap-x-5 gap-y-1 text-base font-semibold"><span>下見開始：{inspection||'未定'}</span><span>競技開始：{start||'未定'} {phase==='final'?'（確定）':'（予定）'}</span></p>
}
export function MasterTimetable({title,dates,items,renderEditor}:{title:string;dates:readonly {value:string;label:string}[];items:MasterTimetableItem[];renderEditor:(id:string)=>ReactNode}){
 const[editing,setEditing]=useState<string[]>([])
 return <div className="space-y-6"><h2 className="text-2xl font-bold">タイムテーブル</h2><p className="font-semibold">{title}</p><p className="print-hide">各競技の「時間を編集」から下見・開始時間を変更し、「時間を保存」を押してください。保存後、出番表・印刷・モニターへ反映されます。未定は空欄にします。</p>
 {dates.map(date=><section key={date.value} className="space-y-2"><h3 className="text-xl font-bold">{date.label}</h3><div className="overflow-x-auto"><table className="w-full min-w-[620px] border-collapse bg-card"><caption className="sr-only">{date.label}のタイムテーブル</caption><thead><tr>{['競技種目','下見開始','競技開始','頭数','操作'].map(label=><th scope="col" key={label} className={`border p-2 text-left ${label==='操作'?'print-hide':''}`}>{label}</th>)}</tr></thead><tbody>{items.filter(item=>item.date===date.value).map(item=><TimetableRow key={item.id} item={item} editing={editing.includes(item.id)} onEdit={()=>setEditing(ids=>ids.includes(item.id)?ids.filter(id=>id!==item.id):[...ids,item.id])} editor={renderEditor(item.id)}/>)}</tbody></table></div>{!items.some(item=>item.date===date.value)&&<p>競技が登録されていません。</p>}</section>)}
 <p className="text-sm font-semibold">競技の進行により開始時間を変更する場合があります。最新のタイムテーブルをご確認ください。</p></div>
}
function TimetableRow({item,editing,onEdit,editor}:{item:MasterTimetableItem;editing:boolean;onEdit:()=>void;editor:ReactNode}){
 return <><tr><th scope="row" className="border p-2 text-left">{item.competition}{item.official&&<span className="ml-2 text-sm">★公認</span>}</th><td className="whitespace-nowrap border p-2">{item.inspection||'未定'}</td><td className="whitespace-nowrap border p-2">{item.start||'未定'}<span className="block text-sm">{item.phase==='final'?'確定':'予定'}</span></td><td className="border p-2 text-right">{item.count}</td><td className="print-hide border p-2"><button type="button" aria-expanded={editing} aria-controls={`timetable-editor-${item.id}`} className="min-h-12 whitespace-nowrap rounded-lg border-2 px-3 font-bold" onClick={onEdit}>{editing?'編集欄を閉じる':'時間を編集'}</button></td></tr><tr hidden={!editing} className="print-hide"><td colSpan={5} id={`timetable-editor-${item.id}`} className="border p-3">{editor}</td></tr></>
}
