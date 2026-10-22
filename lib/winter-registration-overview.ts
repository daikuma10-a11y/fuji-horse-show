import type {RegistrationOverviewGroup,RegistrationOverviewPerson} from './master/registration-overview'
import type {loadWinterData} from './winter-data'
import {assertWinterEvent} from './winter-event'
import {compareWinterCompetitions,compareWinterOrganizations,winterCompetitionLabel} from './winter-display-order'

type Data=Awaited<ReturnType<typeof loadWinterData>>
/** Read the saved event snapshot, never the browser's imported draft or a name match. */
export function winterRegistrationOverview(data:Data):RegistrationOverviewGroup[]{
 assertWinterEvent(data.eventId)
 for(const row of [...data.organizations,...data.riders,...data.horses,...data.competitions,...data.entries])assertWinterEvent(row.event_id)
 const organizations=new Map(data.organizations.map(row=>[row.id,row]))
 const riders=new Map(data.riders.map(row=>[row.id,row])),horses=new Map(data.horses.map(row=>[row.id,row]))
 const competitions=new Map(data.competitions.map(row=>[row.id,row]))
 const entries=data.entries.map(entry=>{
  const rider=riders.get(entry.rider_id),horse=horses.get(entry.horse_id),competition=competitions.get(entry.competition_id)
  const organizationId=entry.organization_id??horse?.organization_id
  if(!rider||!horse||!competition||!organizationId||!organizations.has(organizationId))throw new Error('エントリーの団体・人馬・競技を確認できません。最新の情報を確認してください。')
  return {entry,rider,horse,competition,organizationId}
 }).sort((a,b)=>a.competition.competition_date.localeCompare(b.competition.competition_date)||compareWinterCompetitions(a.competition,b.competition)||a.entry.start_order-b.entry.start_order||a.entry.entry_id.localeCompare(b.entry.entry_id))
 const withdrawn=(status:string)=>['wd','withdrawn'].includes(status.toLowerCase())
 const byName=(a:RegistrationOverviewPerson,b:RegistrationOverviewPerson)=>a.name.localeCompare(b.name,'ja')||a.id.localeCompare(b.id)
 const dateLabel=(date:string)=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(`${date}T00:00:00+09:00`))
 return [...data.organizations].sort(compareWinterOrganizations).map(org=>{
  const chosen=entries.filter(row=>row.organizationId===org.id)
  const riderIds=new Set(chosen.map(row=>row.rider.id)),horseIds=new Set(chosen.map(row=>row.horse.id))
  const people=(kind:'riders'|'horses'):RegistrationOverviewPerson[]=>data[kind].filter(row=>row.organization_id===org.id||(kind==='riders'?riderIds:horseIds).has(row.id)).map(row=>{
   const affiliation=organizations.get(row.organization_id)
   if(!affiliation)throw new Error('参加人馬の所属を確認できません。最新の情報を確認してください。')
   return {id:row.id,name:row.name,number:('jef_member_no' in row?row.jef_member_no:row.jef_registration_no)??'',organization:affiliation.name,entryCount:chosen.filter(value=>(kind==='riders'?value.rider.id:value.horse.id)===row.id&&!withdrawn(value.entry.status)).length}
  }).sort(byName)
  const projected=chosen.map(({entry,rider,horse,competition})=>({id:entry.entry_id,date:dateLabel(competition.competition_date),competition:winterCompetitionLabel(competition),startOrder:entry.start_order>0?entry.start_order:null,rider:rider.name,horse:horse.name,isOp:!!entry.is_op,withdrawn:withdrawn(entry.status),status:withdrawn(entry.status)?'棄権済み':entry.status.toLowerCase()==='active'?'登録済み':entry.status||'状態未確認'}))
  return {id:org.id,name:org.name,riders:people('riders'),horses:people('horses'),entries:projected,activeCount:projected.filter(row=>!row.withdrawn).length,withdrawnCount:projected.filter(row=>row.withdrawn).length}
 })
}
