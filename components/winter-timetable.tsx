"use client"
import {MasterTimetable} from './master/timetable'
import {WinterTimetableEditor} from './winter-timetable-editor'
import {WINTER_DATES,WINTER_EVENT_NAME} from '@/lib/winter-event'
import {winterCompetitionLabel} from '@/lib/winter-display-order'
import type {loadWinterData} from '@/lib/winter-data'
import type {AdminSession} from '@/lib/supabase-rest'
export function WinterTimetable({data,session,onSession,onChanged}:{data:Awaited<ReturnType<typeof loadWinterData>>;session:AdminSession;onSession:(session:AdminSession)=>void;onChanged:()=>void}){
 const dates=WINTER_DATES.map(value=>({value,label:new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(value+'T00:00:00+09:00'))}))
 return <MasterTimetable title={WINTER_EVENT_NAME} dates={dates} items={data.competitions.map(c=>{const t=data.timetable.find(t=>t.competition_id===c.id);return{id:c.id,date:c.competition_date,competition:winterCompetitionLabel(c),official:c.official,count:data.entries.filter(e=>e.competition_id===c.id&&!['wd','withdrawn'].includes(e.status.toLowerCase())).length,inspection:t?.inspection_time??null,start:t?.start_time??null,phase:t?.phase}})} renderEditor={id=><WinterTimetableEditor competitionId={id} initial={data.timetable.find(t=>t.competition_id===id)??null} session={session} onSession={onSession} onChanged={onChanged}/>}/>
}
