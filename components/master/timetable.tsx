"use client"
import {useState,type ReactNode} from 'react'

import {PdfDownload} from './pdf-download'
import {usePrintDocument} from './use-print-document'
import {fitTimetablePrint} from '@/lib/master/timetable-print'
import type {MasterTimetableItem} from '@/lib/master/timetable'
export function MasterCompetitionTime({inspection,start,phase,showInspection=true}:{showInspection?:boolean;inspection?:string|null;start?:string|null;phase?:'provisional'|'final'}){
 return <p className="my-2 flex flex-wrap gap-x-5 gap-y-1 text-base font-semibold">{showInspection && <span>下見開始：{inspection||'未定'}</span>}<span>競技開始：{start||'未定'} {phase==='final'?'（確定）':'（予定）'}</span></p>
}
export function MasterTimetable({title,dates,items,renderEditor,loadPrint,renderDayExtra}:{renderDayExtra?:(date:string)=>ReactNode;loadPrint?:(dates:readonly string[],sectionId?:string)=>Promise<string>;title:string;dates:readonly {value:string;label:string}[];items:MasterTimetableItem[];renderEditor:(id:string, showInspection:boolean)=>ReactNode}){
 const printer=usePrintDocument()
 const[editing,setEditing]=useState<string[]>([])
 const[selectedDates,setSelectedDates]=useState<string[]>(()=>dates.map(d=>d.value))
 const [pdfSection,setPdfSection]=useState('')
 const pdfSections=[...new Map(items.flatMap(item=>item.timingSection?[[item.timingSection.id,item.timingSection] as const]:[])).values()]
 const selected=dates.filter(d=>selectedDates.includes(d.value)).map(d=>d.value)
 const printDates=(values:readonly string[])=>{if(!loadPrint||!values.length)return;const selection=[...values];void printer.print(()=>loadPrint(selection),'横',fitTimetablePrint)}
 return <div className="space-y-6"><h2 className="text-2xl font-bold">タイムテーブル</h2><p className="font-semibold">{title}</p><p className="print-hide">各競技の「時間を編集」から下見・開始時間を変更し、「時間を保存」を押してください。保存後、出番表・印刷・モニターへ反映されます。未定は空欄にします。</p>
 {loadPrint&&<div className="print-hide space-y-3 rounded-xl border-2 p-4"><p>印刷する日程を選んでください。土日など複数の日程も、全日程も、選んだ分をまとめてA4横1ページに収めます。編集中の時間は先に保存してください。</p><fieldset disabled={printer.busy} className="space-y-2"><legend className="font-bold">印刷する日程（複数選択可）</legend><div className="flex flex-wrap gap-3">{dates.map(date=><label key={date.value} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border-2 px-3"><input type="checkbox" className="size-5" checked={selected.includes(date.value)} onChange={event=>setSelectedDates(values=>event.target.checked?[...values,date.value]:values.filter(value=>value!==date.value))}/>{date.label}</label>)}</div><button type="button" className="min-h-10 rounded-lg border px-3 font-bold" onClick={()=>setSelectedDates(dates.map(d=>d.value))}>全日程を選択</button></fieldset><p role="status">{selected.length?`選択した${selected.length}日分 → 1ページ`:'印刷する日程を1つ以上選んでください。'}</p><button type="button" className="min-h-12 rounded-lg bg-primary px-4 font-bold text-primary-foreground disabled:opacity-50" disabled={printer.busy||!selected.length} onClick={()=>printDates(selected)}>選択した日程を1ページで印刷・PDF保存</button><div className="flex flex-wrap items-end gap-3 pt-2">{pdfSections.length>1&&<label className="font-semibold">PDFの競技区分<select className="ml-2 min-h-12 rounded-lg border bg-card px-3" value={pdfSection} onChange={e=>setPdfSection(e.target.value)}><option value="">全競技</option>{pdfSections.map(s=><option key={s.id} value={s.id}>{s.label}</option>)}</select></label>}
 <PdfDownload label="選択した日程をPDFでダウンロード" disabled={!selected.length} filename={title+'_タイムテーブル_'+selected.join('_')+(pdfSection?'_'+pdfSections.find(s=>s.id===pdfSection)?.label:'')}
   generate={async()=>{const [html,{timetablePdf}]=await Promise.all([loadPrint([...selected],pdfSection),import('@/lib/master/handout-pdf')]);return timetablePdf(html,pdfSection)}}/></div>{printer.notice&&<p role="status">{printer.notice}</p>}{printer.error&&<p role="alert" className="text-red-800">{printer.error}</p>}</div>}
 {dates.map(date => {
   const dayItems = items.filter(item => item.date === date.value)
   const sections = new Map(dayItems.map(item => [item.timingSection?.id, item.timingSection]))
   return <section key={date.value} className="space-y-2">
     <h3 className="text-xl font-bold">{date.label}</h3>
     {loadPrint && <button type="button" className="print-hide min-h-12 rounded-lg border-2 px-3 font-bold disabled:opacity-50" disabled={printer.busy} onClick={() => printDates([date.value])}>{date.label}を印刷・PDF保存</button>}
     {[...sections.values()].map(section => {
       const showInspection = section?.showInspection ?? true
       const headers = ['競技種目', ...(showInspection ? ['下見開始'] : []), '競技開始', '出場数', '操作']
       return <div key={section?.id ?? 'timetable'} className="overflow-x-auto">
         <table className="w-full min-w-[620px] border-collapse bg-card">
           <caption className={section ? 'py-2 text-left font-bold' : 'sr-only'}>
             <span className="sr-only">{date.label}のタイムテーブル </span>{section?.label}{section?.venue && `　${section.venue}`}
           </caption>
           <thead><tr>{headers.map(label =>
             <th scope="col" key={label} className={`border p-2 text-left ${label === '操作' ? 'print-hide' : ''}`}>{label}</th>
           )}</tr></thead>
           <tbody>{dayItems.filter(item => item.timingSection?.id === section?.id).map(item =>
             <TimetableRow key={item.id} item={item} showInspection={showInspection}
               editing={editing.includes(item.id)}
               onEdit={() => setEditing(ids => ids.includes(item.id) ? ids.filter(id => id !== item.id) : [...ids, item.id])}
               editor={renderEditor(item.id, showInspection)}/>
           )}</tbody>
         </table>
       </div>
     })}
     {renderDayExtra?.(date.value)}
     {!dayItems.length && <p>競技が登録されていません。</p>}
   </section>
 })}
 <p className="text-sm font-semibold">競技の進行により開始時間を変更する場合があります。最新のタイムテーブルをご確認ください。</p></div>
}
function TimetableRow({item,showInspection,editing,onEdit,editor}:{showInspection:boolean;item:MasterTimetableItem;editing:boolean;onEdit:()=>void;editor:ReactNode}){
 return <><tr><th scope="row" className="whitespace-nowrap border p-2 text-left">{item.competition}{item.official&&<span className="ml-2 text-sm">★公認</span>}</th>{showInspection && <td className="whitespace-nowrap border p-2">{item.inspection||'未定'}</td>}<td className="whitespace-nowrap border p-2">{item.start||'未定'}<span className="block text-sm">{item.phase==='final'?'確定':'予定'}</span></td><td className="border p-2 text-right">{item.count}</td><td className="print-hide border p-2"><button type="button" aria-expanded={editing} aria-controls={`timetable-editor-${item.id}`} className="min-h-12 whitespace-nowrap rounded-lg border-2 px-3 font-bold" onClick={onEdit}>{editing?'編集欄を閉じる':'時間を編集'}</button></td></tr><tr hidden={!editing} className="print-hide"><td colSpan={showInspection ? 5 : 4} id={`timetable-editor-${item.id}`} className="border p-3">{editor}</td></tr></>
}
