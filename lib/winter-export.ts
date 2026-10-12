import type { loadWinterData } from './winter-data'
import { assertWinterEvent } from './winter-event'
import { winterCompetitionLabel } from './winter-display-order'

type Data = Awaited<ReturnType<typeof loadWinterData>>
export type WinterExportKind = 'riders' | 'horses' | 'entries'
/** BOM helps Excel identify Japanese UTF-8; quote every cell and neutralize formulas. */
export function winterCsv(rows: (string | number | null)[][]) {
 return '\uFEFF' + rows.map(row => row.map(value => {
  const text = String(value ?? '')
  const safe = /^[\s]*[=+\-@]/.test(text) ? "'" + text : text
  return '"' + safe.replace(/"/g, '""') + '"'
 }).join(',')).join('\r\n') + '\r\n'
}
export function exportWinterCsv(data: Data, kind: WinterExportKind) {
 assertWinterEvent(data.eventId)
 for (const collection of [data.organizations,data.riders,data.horses,data.competitions,data.entries,data.timetable]) for(const row of collection) assertWinterEvent(row.event_id)
 const orgs=new Map(data.organizations.map(o=>[o.id,o.name]))
 const organization=(id:string)=>{const name=orgs.get(id);if(!name)throw new Error('所属団体を確認できません');return name}
 const sort=<T extends {organization_id:string;name:string;id:string}>(rows:T[])=>[...rows].sort((a,b)=>data.organizations.findIndex(o=>o.id===a.organization_id)-data.organizations.findIndex(o=>o.id===b.organization_id)||a.name.localeCompare(b.name,'ja')||a.id.localeCompare(b.id))
 if(kind==='riders')return winterCsv([['所属団体','選手名','日馬連会員番号','選手ID','団体ID'],...sort(data.riders).map(r=>[organization(r.organization_id),r.name,r.jef_member_no,r.id,r.organization_id])])
 if(kind==='horses')return winterCsv([['所属団体','馬名','日馬連馬匹番号','馬ID','団体ID'],...sort(data.horses).map(h=>[organization(h.organization_id),h.name,h.jef_registration_no,h.id,h.organization_id])])
 const riders=new Map(data.riders.map(r=>[r.id,r])),horses=new Map(data.horses.map(h=>[h.id,h]))
 const result:(string|number|null)[][]=[['日付','競技','下見時間','開始時間','時間区分','出番','状態','選手所属','選手名','馬所属','馬名','OP','出番ID','選手ID','馬ID']]
 for(const competition of data.competitions){
  const time=data.timetable.find(t=>t.competition_id===competition.id)
  const date=new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(competition.competition_date+'T00:00:00+09:00'))
  for(const entry of data.entries.filter(e=>e.competition_id===competition.id).sort((a,b)=>a.start_order-b.start_order||a.entry_id.localeCompare(b.entry_id))){
   const rider=riders.get(entry.rider_id),horse=horses.get(entry.horse_id)
   if(!rider||!horse)throw new Error('出番表の人馬を確認できません')
   result.push([date,winterCompetitionLabel(competition),time?.inspection_time??'',time?.start_time??'',time?(time.phase==='final'?'確定':'仮'):'未設定',entry.start_order,entry.status==='wd'?'棄権':entry.status==='active'?'出場':entry.status,organization(rider.organization_id),rider.name,organization(horse.organization_id),horse.name,entry.is_op?'OP':'',entry.entry_id,rider.id,horse.id])
  }
 }
 return winterCsv(result)
}
