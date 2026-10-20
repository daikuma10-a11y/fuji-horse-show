import { winterRpc } from './winter-reception'
import { WINTER_EVENT_ID } from './winter-event'
export type RosterEntity = {id:string;kind:'rider'|'horse';name:string;reading:string;jef_number:string|null;updated_at:string;archived_at:string|null}
export type RosterClub = {id:string;name:string}
export type Affiliation = {id:string;entity_id:string;club_id:string;started_at:string;ended_at:string|null}
export type Participant = {event_id:string;entity_id:string;club_id:string;name_snapshot:string;reading_snapshot:string;jef_number_snapshot:string|null;club_name_snapshot:string}
export type SharedRoster = {entities:RosterEntity[];clubs:RosterClub[];affiliations:Affiliation[];participants:Participant[]}
export type WinterRosterBinding = {entity_id:string;club_id:string;rider_id:string|null;horse_id:string|null}
const url='https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/'
const key='sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95'
const columns:Record<string,string>={fhs_roster_entities:'id,kind,name,reading,jef_number,updated_at,archived_at',fhs_roster_clubs:'id,name',fhs_roster_affiliations:'id,entity_id,club_id,started_at,ended_at',fhs_winter_participants:'event_id,entity_id,club_id,name_snapshot,reading_snapshot,jef_number_snapshot,club_name_snapshot',fhs_winter_reception_roster:'entity_id,club_id,rider_id,horse_id'}
async function rows<T>(table:string,token:string,filters:Record<string,string>={}):Promise<T[]>{
 const result:T[]=[]
 for(let offset=0;;offset+=500){
  const query=new URLSearchParams({select:columns[table],order:['fhs_winter_participants','fhs_winter_reception_roster'].includes(table)?'entity_id.asc,club_id.asc':'id.asc',limit:'500',offset:String(offset)})
  for(const [column,value] of Object.entries(filters))query.set(column,value)
  if(table==='fhs_winter_participants')query.set('event_id',`eq.${WINTER_EVENT_ID}`)
  const response=await fetch(url+table+'?'+query,{cache:'no-store',signal:AbortSignal.timeout(15000),headers:{apikey:key,Authorization:`Bearer ${token}`}}).catch(e=>{if(e instanceof Error&&['TimeoutError','AbortError'].includes(e.name))throw new Error('名簿の読み込みが時間切れです。選択中のチェックは保持しています。接続を確認して再読み込みしてください。');throw e})
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

/** Read the existing Winter identity bridge; never infer identities from names. */
export async function loadWinterRosterBindings(token:string):Promise<WinterRosterBinding[]>{
 if(!token)throw new Error('本部ログインが必要です')
 const result=await rows<WinterRosterBinding>('fhs_winter_reception_roster',token)
 const uuid=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
 const keys=new Set<string>(),ids=new Set<string>()
 for(const row of result){
  if(!row||!uuid(row.entity_id)||!uuid(row.club_id)||!((uuid(row.rider_id)&&row.horse_id===null)||(uuid(row.horse_id)&&row.rider_id===null)))throw new Error('Winter人馬の対応を確認できません')
  const key=JSON.stringify([row.entity_id,row.club_id]),id=row.rider_id??row.horse_id!
  if(keys.has(key)||ids.has(id))throw new Error('Winter人馬の対応が重複しています')
  keys.add(key);ids.add(id)
 }
 return result
}

/** Refresh only the edited identity and its affiliations; keep pending participant selections. */
export async function refreshRosterEntity(data:SharedRoster,id:string,token:string):Promise<SharedRoster>{
 if(!/^[0-9a-f-]{36}$/i.test(id)||!token)throw new Error('保存した人馬を確認できません。名簿を再読み込みしてください')
 const [entities,clubs,affiliations]=await Promise.all([
  rows<RosterEntity>('fhs_roster_entities',token,{id:`eq.${id}`}),
  rows<RosterClub>('fhs_roster_clubs',token),
  rows<Affiliation>('fhs_roster_affiliations',token,{entity_id:`eq.${id}`}),
 ])
 if(entities.length!==1||entities[0].id!==id||affiliations.some(x=>x.entity_id!==id))throw new Error('保存した人馬の読戻しを確認できません。名簿を再読み込みしてください')
 return {...data,clubs,entities:[...data.entities.filter(x=>x.id!==id),entities[0]],affiliations:[...data.affiliations.filter(x=>x.entity_id!==id),...affiliations]}
}
export async function refreshRosterParticipants(data:SharedRoster,token:string):Promise<SharedRoster>{
 const participants=await rows<Participant>('fhs_winter_participants',token)
 if(participants.some(x=>x.event_id!==WINTER_EVENT_ID))throw new Error('Winter以外の参加記録は使用できません')
 return {...data,participants}
}
async function rosterRpc(name:string,args:Record<string,unknown>,token:string){
 try{return await winterRpc(name,args,token,AbortSignal.timeout(20000))}
 catch(e){if(e instanceof Error&&['TimeoutError','AbortError'].includes(e.name))throw new Error('保存結果の確認が時間切れになりました。チェックと入力は残っています。名簿を再読み込みして保存結果を確認してください。');throw e}
}

export function clubEntities(data:SharedRoster,clubId:string){
 const ids=new Set(data.affiliations.filter(x=>x.club_id===clubId&&x.ended_at===null).map(x=>x.entity_id))
 return data.entities.filter(x=>ids.has(x.id)&&!x.archived_at).sort((a,b)=>a.name.localeCompare(b.name,'ja'))
}
export function saveRosterEntity(input:{kind:'rider'|'horse';name:string;reading:string;jefNumber:string;clubName:string;id?:string;expectedUpdatedAt?:string;replaceAffiliations?:boolean},token:string){
 return rosterRpc('save_fhs_roster_entity',{p_kind:input.kind,p_name:input.name,p_reading:input.reading,p_jef_number:input.jefNumber,p_club_name:input.clubName,p_id:input.id??null,p_expected_updated_at:input.expectedUpdatedAt??null,p_replace_affiliations:!!input.replaceAffiliations},token)
}
export function archiveRosterEntity(entity:RosterEntity,token:string){return rosterRpc('archive_fhs_roster_entity',{p_id:entity.id,p_expected_updated_at:entity.updated_at},token)}
export function saveWinterParticipants(clubId:string,ids:string[],expectedIds:string[],token:string){
 return rosterRpc('save_fhs_winter_participants',{p_club_id:clubId,p_ids:ids,p_expected_ids:expectedIds},token)
}
