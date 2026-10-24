import type {ApplicationSnapshot} from './winter-application-registration'
import type {ApplicationPerson} from './master/application'
import {WINTER_EVENT_ID} from './winter-event'
import {winterRpc} from './winter-reception'

export type RosterCorrectionInput={requestId:string;eventId:string;entityId:string;kind:'rider'|'horse';clubName:string;name:string;reading:string;jef:string;expected:ReturnType<typeof rosterCorrectionExpectation>}
/** Exact observed identities and Winter snapshots, never inferred name matches. */
export function rosterCorrectionExpectation(id:string,s:ApplicationSnapshot){
 const entity=s.roster.entities.find(e=>e.id===id&&!e.archived_at)
 if(!entity)throw new Error('訂正する既存人馬を選択してください')
 if(s.data.eventId!==WINTER_EVENT_ID||s.roster.participants.some(p=>p.event_id!==WINTER_EVENT_ID))throw new Error('Winterの名簿を確認してください')
 return {
  entity:{name:entity.name,reading:entity.reading,jef:entity.jef_number??'',updatedAt:entity.updated_at},
  clubs:s.roster.affiliations.filter(a=>a.entity_id===id&&!a.ended_at).map(a=>a.club_id).sort(),
  participants:s.roster.participants.filter(p=>p.entity_id===id).map(p=>{
   const b=s.bindings.find(b=>b.entity_id===id&&b.club_id===p.club_id),targetId=b?.rider_id??b?.horse_id??null
   const t=entity.kind==='rider'?s.data.riders.find(r=>r.id===targetId):s.data.horses.find(h=>h.id===targetId)
   if(!t||t.event_id!==WINTER_EVENT_ID||!!b?.rider_id!==(entity.kind==='rider'))throw new Error('既存のWinter人馬との対応を確認できません。登録IDを変更せず停止しました')
   return {clubId:p.club_id,name:p.name_snapshot,reading:p.reading_snapshot,jef:p.jef_number_snapshot??'',clubName:p.club_name_snapshot,targetId:t.id,targetName:t.name,targetJef:('jef_member_no' in t?t.jef_member_no:t.jef_registration_no)??'',organizationId:t.organization_id,organizationName:s.data.organizations.find(o=>o.id===t.organization_id)?.name??'',participating:t.is_participant!==false}
  }).sort((a,b)=>a.clubId.localeCompare(b.clubId)),
 }
}
export function rosterCorrectionInput(person:ApplicationPerson,id:string,clubName:string,s:ApplicationSnapshot,requestId:string):RosterCorrectionInput{
 const e=s.roster.entities.find(e=>e.id===id&&!e.archived_at&&e.kind===person.kind)
 if(!e)throw new Error('訂正する既存人馬を選択してください。「新規登録」は名簿の訂正には使いません')
 const name=person.name.trim(),reading=person.reading.trim(),jef=person.jef.trim()
 if(!name||name.length>100||!reading||reading.length>100||!clubName.trim()||clubName.trim().length>100||jef&&!/^\d+$/.test(jef))throw new Error('名前・フリガナ・日馬連番号・申込団体を確認してください')
 if(jef&&s.roster.entities.some(x=>x.kind===person.kind&&x.id!==id&&x.jef_number===jef))throw new Error('この日馬連番号は別の既存候補に登録されています。番号のある候補を選び、その人馬の所属を追加してください。自動統合はしません')
 return {requestId,eventId:WINTER_EVENT_ID,entityId:id,kind:person.kind,clubName:clubName.trim(),name,reading,jef,expected:rosterCorrectionExpectation(id,s)}
}
export function rosterCorrectionMatches(input:RosterCorrectionInput,s:ApplicationSnapshot){
 try{
  const now=rosterCorrectionExpectation(input.entityId,s)
  if(now.entity.name!==input.name||now.entity.reading!==input.reading||now.entity.jef!==input.jef)return false
  const club=s.roster.clubs.find(c=>c.name===input.clubName)
  if(!club||!now.clubs.includes(club.id)||input.expected.clubs.some(id=>!now.clubs.includes(id)))return false
  return now.participants.length===input.expected.participants.length&&now.participants.every(p=>{
   const before=input.expected.participants.find(x=>x.clubId===p.clubId)
   return before&&p.targetId===before.targetId&&p.organizationId===before.organizationId&&p.clubName===before.clubName&&p.organizationName===before.organizationName&&p.participating===before.participating&&p.name===input.name&&p.reading===input.reading&&p.jef===input.jef&&p.targetName===input.name&&p.targetJef===input.jef
  })
 }catch{return false}
}
export async function saveWinterRosterCorrection(input:RosterCorrectionInput,token:string):Promise<string>{
 const id=await winterRpc('correct_fhs_winter_roster_identity',{p_input:input},token,AbortSignal.timeout(20000))
 if(id!==input.entityId)throw new Error('名簿訂正の保存結果を確認できません。再照合してください')
 return id
}
