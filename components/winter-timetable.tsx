"use client"
import {MasterTimetable} from './master/timetable'
import {WinterTimetableEditor} from './winter-timetable-editor'
import {WINTER_DATES,WINTER_EVENT_NAME,winterTimetableSection} from '@/lib/winter-event'
import {winterCompetitionLabel} from '@/lib/winter-display-order'
import {timetablePrintHtml} from '@/lib/master/timetable-print'
import {winterTimetablePrintData} from '@/lib/winter-timetable-print'
import {loadWinterData} from '@/lib/winter-data'
import type {AdminSession} from '@/lib/supabase-rest'
export function WinterTimetable({data,session,onSession,onChanged}:{data:Awaited<ReturnType<typeof loadWinterData>>;session:AdminSession;onSession:(session:AdminSession)=>void;onChanged:()=>void}){
 const dates=WINTER_DATES.map(value=>({value,label:new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(value+'T00:00:00+09:00'))}))
 async function loadPrint(dates:readonly string[]){
  const latest=await loadWinterData(AbortSignal.timeout(20000))
  return timetablePrintHtml(winterTimetablePrintData(latest),new Date().toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'}),dates)
 }
 const items = data.competitions.map(competition => {
   const time = data.timetable.find(row => row.competition_id === competition.id)
   const entries = data.entries.filter(entry => entry.competition_id === competition.id && !['wd', 'withdrawn'].includes(entry.status.toLowerCase()))
   return {
     id: competition.id,
     date: competition.competition_date,
     competition: winterCompetitionLabel(competition),
     timingSection: winterTimetableSection(competition.competition_no),
     official: competition.official,
     count: entries.length,
     inspection: time?.inspection_time ?? null,
     start: time?.start_time ?? null,
     phase: time?.phase,
   }
 })
 return <MasterTimetable title={WINTER_EVENT_NAME} dates={dates} items={items} loadPrint={loadPrint}
   renderEditor={(id, showInspection) =>
     <WinterTimetableEditor competitionId={id} showInspection={showInspection}
       initial={data.timetable.find(time => time.competition_id === id) ?? null}
       session={session} onSession={onSession} onChanged={onChanged}/>
   }/>
}
