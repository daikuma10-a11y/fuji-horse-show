import { winterRpc } from './winter-reception'
import { WINTER_EVENT_ID } from './winter-event'
export type RosterEntity = {id:string;kind:'rider'|'horse';name:string;reading:string;jef_number:string|null;updated_at:string;archived_at:string|null}
export type RosterClub = {id:string;name:string}
export type Affiliation = {id:string;entity_id:string;club_id:string;started_at:string;ended_at:string|null}
export type Participant = {event_id:string;entity_id:string;club_id:string;name_snapshot:string;reading_snapshot:string;jef_number_snapshot:string|null;club_name_snapshot:string}
export type SharedRoster = {entities:RosterEntity[];clubs:RosterClub[];affiliations:Affiliation[];participants:Participant[]}
const url='https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/'
const key='sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95'
const columns:Record<string,string>={fhs_roster_entities:'id,kind,name,reading,jef_number,updated_at,archived_at',fhs_roster_clubs:'id,name',fhs_roster_affiliations:'id,entity_id,club_id,started_at,ended_at',fhs_winter_participants:'event_id,entity_id,club_id,name_snapshot,reading_snapshot,jef_number_snapshot,club_name_snapshot'}
async function rows<T>(table:string,token:string):Promise<T[]>{
 const result:T[]=[]
 for(let offset=0;;offset+=500){
  const query=new URLSearchParams({select:columns[table],order:table==='fhs_winter_participants'?'entity_id.asc,club_id.asc':'id.asc',limit:'500',offset:String(offset)})
  if(table==='fhs_winter_participants')query.set('event_id',`eq.${WINTER_EVENT_ID}`)
  const response=await fetch(url+table+'?'+query,{cache:'no-store',headers:{apikey:key,Authorization:`Bearer ${token}`}})
  if(!response.ok)throw new Error('人馬名簿を取得できません。本部ログインと接続を確認してください')
  const page:unknown=await response.json();if(!Array.isArray(page))throw new Error('名簿の形式を確認できません')
  result.push(...page as T[]);if(page.length<500)return result
 }
}
export async function loadSharedRoster(token:string,onClubs?:(clubs:RosterClub[])=>void):Promise<SharedRoster>{
 if(!token)throw new Error('本部ログインが必要です')
 const [entities,clubs,affiliations,participants]=await Promise.all([rows<RosterEntity>('fhs_roster_entities',token),rows<RosterClub>('fhs_roster_clubs',token).then(clubs=>{onClubs?.(clubs);return clubs}),rows<Affiliation>('fhs_roster_affiliations',token),rows<Participant>('fhs_winter_participants',token)])
 if(participants.some(x=>x.event_id!==WINTER_EVENT_ID))throw new Error('Winter以外の参加記録は使用できません')
 return {entities,clubs,affiliations,participants}
}
export function clubEntities(data:SharedRoster,clubId:string){
 const ids=new Set(data.affiliations.filter(x=>x.club_id===clubId&&x.ended_at===null).map(x=>x.entity_id))
 return data.entities.filter(x=>ids.has(x.id)&&!x.archived_at).sort((a,b)=>a.name.localeCompare(b.name,'ja'))
}
export function saveRosterEntity(input:{kind:'rider'|'horse';name:string;reading:string;jefNumber:string;clubName:string;id?:string;expectedUpdatedAt?:string;replaceAffiliations?:boolean},token:string){
 return winterRpc('save_fhs_roster_entity',{p_kind:input.kind,p_name:input.name,p_reading:input.reading,p_jef_number:input.jefNumber,p_club_name:input.clubName,p_id:input.id??null,p_expected_updated_at:input.expectedUpdatedAt??null,p_replace_affiliations:!!input.replaceAffiliations},token)
}
export function archiveRosterEntity(entity:RosterEntity,token:string){return winterRpc('archive_fhs_roster_entity',{p_id:entity.id,p_expected_updated_at:entity.updated_at},token)}
export function saveWinterParticipants(clubId:string,ids:string[],expectedIds:string[],token:string){
 return winterRpc('save_fhs_winter_participants',{p_club_id:clubId,p_ids:ids,p_expected_ids:expectedIds},token)
}
