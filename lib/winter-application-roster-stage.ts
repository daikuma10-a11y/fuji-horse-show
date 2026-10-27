import type {ApplicationDraft} from './winter-application-draft'
import type {ApplicationSnapshot} from './winter-application-registration'
import type {ApplicationPerson} from './master/application'
import {normalizeApplicationName,rosterCandidates} from './winter-application'
import {splitApplicationRiders} from './master/application-entry-input'
import {rosterCorrectionExpectation,rosterCorrectionInput,type RosterCorrectionInput} from './winter-roster-correction'
import {applicationTodos} from './winter-application-guide'
import {WINTER_EVENT_ID} from './winter-event'

export type ApplicationRosterPreparation={signature:string;corrections:Record<string,RosterCorrectionInput>}
export function readApplicationRosterPreparation(value:unknown,d:ApplicationDraft):ApplicationRosterPreparation{
 const fail=()=>new Error('人馬の仮確定記録を確認できません。人馬の入力を確認してください')
 const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw fail();return v as Record<string,unknown>}
 const text=(v:unknown,max=100)=>{if(typeof v!=='string'||v.length>max)throw fail();return v}
 const id=(v:unknown)=>{const s=text(v,36);if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s))throw fail();return s}
 const list=(v:unknown)=>{if(!Array.isArray(v)||v.length>200)throw fail();return v}
 const raw=obj(value),signature=text(raw.signature,200000),corrections:Record<string,RosterCorrectionInput>={},requests=new Set<string>()
 if(signature!==applicationRosterSignature(d)||Object.keys(obj(raw.corrections)).length>d.edited.people.length)throw fail()
 for(const [key,v] of Object.entries(obj(raw.corrections))){
  const r=obj(v),ex=obj(r.expected),entity=obj(ex.entity),person=d.edited.people.find(p=>p.key===key)
  const participants=list(ex.participants).map(v=>{const p=obj(v);if(typeof p.participating!=='boolean')throw fail();return {clubId:id(p.clubId),name:text(p.name),reading:text(p.reading),jef:text(p.jef),clubName:text(p.clubName),targetId:id(p.targetId),targetName:text(p.targetName),targetJef:text(p.targetJef),organizationId:id(p.organizationId),organizationName:text(p.organizationName),participating:p.participating}})
  const input:RosterCorrectionInput={requestId:id(r.requestId),eventId:text(r.eventId),entityId:id(r.entityId),kind:r.kind as 'rider'|'horse',clubName:text(r.clubName),destinationClubId:r.destinationClubId===null?null:id(r.destinationClubId),endClubIds:list(r.endClubIds).map(id),name:text(r.name),reading:text(r.reading),jef:text(r.jef),expected:{entity:{name:text(entity.name),reading:text(entity.reading),jef:text(entity.jef),updatedAt:text(entity.updatedAt)},clubs:list(ex.clubs).map(id),participants}}
  if(!person||input.eventId!==WINTER_EVENT_ID||input.entityId!==d.choices[key]||input.kind!==person.kind||input.name!==person.name.trim()||input.reading!==person.reading.trim()||input.jef!==person.jef.trim()||!input.clubName||requests.has(input.requestId))throw fail()
  if(new Set(input.expected.clubs).size!==input.expected.clubs.length||new Set(input.endClubIds).size!==input.endClubIds!.length)throw fail()
  requests.add(input.requestId);corrections[key]=input
 }
 return {signature,corrections}
}
const stable=(v:unknown):string=>JSON.stringify(v,(_,x)=>x&&typeof x==='object'&&!Array.isArray(x)?Object.fromEntries(Object.keys(x).sort().map(k=>[k,x[k]])):x)
export function applicationRosterSignature(d:ApplicationDraft){return stable({digest:d.original.digest,club:d.edited.club,people:d.edited.people,choices:d.choices,rosterEdits:d.rosterEdits??{}})}
export function retainRosterPreparation(d:ApplicationDraft){
 if(!d.rosterPreparation||d.rosterPreparation.signature===applicationRosterSignature(d))return d
 const {rosterPreparation:_,...next}=d;return next
}
const readingKey=(s:string)=>normalizeApplicationName(s).replace(/[ぁ-ゖ]/g,c=>String.fromCharCode(c.charCodeAt(0)+0x60))
/** Cosmetic spelling is adopted once from the explicitly selected identity. Real changes stay visible. */
function canonicalPerson(p:ApplicationPerson,d:ApplicationDraft,s:ApplicationSnapshot){
 const e=s.roster.entities.find(e=>e.id===d.choices[p.key]&&e.kind===p.kind&&!e.archived_at)
 if(!e)return p
 return {...p,name:normalizeApplicationName(p.name)===normalizeApplicationName(e.name)?e.name:p.name,
  reading:!p.reading.trim()||readingKey(p.reading)===readingKey(e.reading)?e.reading:p.reading}
}
export function applicationRosterChanges(d:ApplicationDraft,s:ApplicationSnapshot){
 return d.edited.people.flatMap(person=>{
  const p=canonicalPerson(person,d,s),e=s.roster.entities.find(e=>e.id===d.choices[p.key])
  if(!e)return []
  const changes: {field:'name'|'reading'|'jef'|'choice';label:string;before:string;after:string}[]=[]
  for(const [field,label,before,after] of [['name','名前・馬名',e.name,p.name],['reading','フリガナ',e.reading,p.reading],['jef','日馬連番号',e.jef_number??'',p.jef]] as const)if(before!==after.trim())changes.push({field,label,before,after:after.trim()})
  const edit=d.rosterEdits?.[p.key],name=(edit?.source==='existing'?s.roster.clubs.find(c=>c.id===edit.clubId)?.name:edit?.source==='manual'?edit.clubName:d.edited.club)?.trim()??''
  const club=s.roster.clubs.find(c=>c.name===name),current=s.roster.affiliations.filter(a=>a.entity_id===e.id&&!a.ended_at)
  if(name&&(!club||!current.some(a=>a.club_id===club.id))&&!s.roster.participants.some(p=>p.entity_id===e.id&&p.club_id===club?.id))changes.push({field:'choice',label:'所属を追加',before:current.map(a=>s.roster.clubs.find(c=>c.id===a.club_id)?.name).filter(Boolean).join('、'),after:name})
  for(const a of current.filter(a=>edit?.endClubIds.includes(a.club_id)))changes.push({field:'choice',label:'所属を終了',before:s.roster.clubs.find(c=>c.id===a.club_id)?.name??a.club_id,after:'過去の所属として保持'})
  return changes.length?[{key:p.key,name:p.name,changes}]:[]
 })
}
/** A local-only preparation: never saves roster entities or entries. */
export function prepareApplicationRoster(d:ApplicationDraft,s:ApplicationSnapshot,newId:()=>string):ApplicationDraft{
 if(s.data.eventId!==WINTER_EVENT_ID||s.roster.participants.some(p=>p.event_id!==WINTER_EVENT_ID))throw new Error('Winterの人馬名簿を読み直してください')
 if(!d.edited.club.trim())throw new Error('人馬の仮確定前に申込団体名を入力してください')
 if(s.roster.clubs.filter(c=>c.name===d.edited.club.trim()).length>1)throw new Error('同名の団体が複数あります。所属を確認してください')
 const next:ApplicationDraft={...d,edited:{...d.edited,people:d.edited.people.map(p=>canonicalPerson(p,d,s))}},ids=new Set<string>(),corrections:Record<string,RosterCorrectionInput>={}
 const personIssues=applicationTodos(next,true).filter(t=>t.blocking&&t.target.startsWith('application-person-'))
 if(personIssues.length)throw new Error(personIssues.map(t=>`${t.label}：${t.message}`).join('\n'))
 for(const p of next.edited.people){
  if(!p.name.trim()||p.jef&&!/^\d+$/.test(p.jef.trim()))throw new Error(`${p.name||'名前未入力'}：名前と日馬連番号を確認してください`)
  const chosen=next.choices[p.key]
  if(chosen==='new'){
   if(rosterCandidates(p,s.roster,next.edited.club).length||s.roster.entities.some(e=>e.kind===p.kind&&e.archived_at&&(normalizeApplicationName(e.name)===normalizeApplicationName(p.name)||p.jef&&e.jef_number===p.jef)))throw new Error(`${p.name}：既存の候補があります。同じ人馬なら登録済みの候補を選んでください`)
   continue
  }
  const e=s.roster.entities.find(e=>e.id===chosen&&e.kind===p.kind&&!e.archived_at)
  if(!e)throw new Error(`${p.name}：既存の人馬か新規登録かを選択してください`)
  if(ids.has(e.id))throw new Error(`${p.name}：同じ人馬を複数行に指定しています`);ids.add(e.id)
  const changed=applicationRosterChanges({...next,edited:{...next.edited,people:[p]}},s).length>0
  if(changed||next.rosterEdits?.[p.key])corrections[p.key]=rosterCorrectionInput(p,e.id,next.edited.club,s,newId(),next.rosterEdits?.[p.key])
 }
 // Keep existing/manual row choices. Only unbound rows are matched against original and prepared aliases.
 const bind=(raw:string,kind:'rider'|'horse')=>{
  const names=kind==='rider'?splitApplicationRiders(raw,next.edited.people.filter(p=>p.kind===kind).map(p=>p.name)).map(p=>p.name):[raw.replace(/\s*号\s*$/,'')]
  if(names.length!==1)return ''
  const matches=next.edited.people.filter(p=>p.kind===kind&&[p.name,d.original.people.find(o=>o.key===p.key)?.name,s.roster.entities.find(e=>e.id===next.choices[p.key])?.name].some(name=>name&&normalizeApplicationName(name)===normalizeApplicationName(names[0])))
  return matches.length===1?matches[0].key:''
 }
 next.edited.entries=next.edited.entries.map(e=>({...e,rider:e.rider||bind(e.rawRider,'rider'),horse:e.horse||bind(e.rawHorse,'horse')}))
 next.rosterPreparation={signature:applicationRosterSignature(next),corrections}
 return next
}

/** Recognize a completed correction even after this import subsequently added participation. */
export function preparedCorrectionSaved(input:RosterCorrectionInput,s:ApplicationSnapshot){
 try{
  const now=rosterCorrectionExpectation(input.entityId,s),club=s.roster.clubs.find(c=>c.name===input.clubName)
  if(!club||now.entity.name!==input.name||now.entity.reading!==input.reading||now.entity.jef!==input.jef)return false
  const clubs=[...new Set([...input.expected.clubs.filter(id=>!input.endClubIds?.includes(id)),club.id])].sort()
  if(stable(now.clubs)!==stable(clubs))return false
  return input.expected.participants.every(before=>{
   const p=now.participants.find(p=>p.clubId===before.clubId)
   return p&&p.targetId===before.targetId&&p.organizationId===before.organizationId&&p.clubName===before.clubName&&p.organizationName===before.organizationName&&p.participating===before.participating&&p.name===input.name&&p.reading===input.reading&&p.jef===input.jef&&p.targetName===input.name&&p.targetJef===input.jef
  })
 }catch{return false}
}
/** Preview only. Real writes use the saved expectation and readback before any entry is saved. */
export function projectPreparedRoster(d:ApplicationDraft,s:ApplicationSnapshot){
 const prep=d.rosterPreparation,pending:{key:string;input:RosterCorrectionInput}[]=[],issues:string[]=[]
 if(!prep)return {snapshot:s,pending,issues}
 if(prep.signature!==applicationRosterSignature(d))return {snapshot:s,pending,issues:['人馬の入力が変わりました。人馬を仮確定し直してください']}
 const projected=structuredClone(s)
 for(const [key,input] of Object.entries(prep.corrections)){
  if(preparedCorrectionSaved(input,s))continue
  try{
   if(stable(rosterCorrectionExpectation(input.entityId,s))!==stable(input.expected))throw new Error('仮確定後に保存済み名簿が変わりました。人馬を再確認してください')
   const person=d.edited.people.find(p=>p.key===key)!
   const current=rosterCorrectionInput(person,input.entityId,d.edited.club,s,input.requestId,d.rosterEdits?.[key])
   if(current.clubName!==input.clubName||stable(current.endClubIds)!==stable(input.endClubIds)||input.destinationClubId&&current.destinationClubId!==input.destinationClubId)throw new Error('所属の仮確定記録が一致しません')
   pending.push({key,input})
   const e=projected.roster.entities.find(e=>e.id===input.entityId)!
   Object.assign(e,{name:input.name,reading:input.reading,jef_number:input.jef||null})
   let club=projected.roster.clubs.find(c=>c.name===input.clubName)
   if(!club){club={id:input.requestId,name:input.clubName};projected.roster.clubs.push(club)}
   for(const a of projected.roster.affiliations)if(a.entity_id===e.id&&input.endClubIds?.includes(a.club_id))a.ended_at='planned'
   if(!projected.roster.affiliations.some(a=>a.entity_id===e.id&&a.club_id===club!.id&&!a.ended_at))projected.roster.affiliations.push({id:input.requestId,entity_id:e.id,club_id:club.id,started_at:'planned',ended_at:null})
   for(const p of projected.roster.participants.filter(p=>p.entity_id===e.id)){
    p.name_snapshot=input.name;p.reading_snapshot=input.reading;p.jef_number_snapshot=input.jef||null
    const b=projected.bindings.find(b=>b.entity_id===e.id&&b.club_id===p.club_id)
    const t=e.kind==='rider'?projected.data.riders.find(r=>r.id===b?.rider_id):projected.data.horses.find(h=>h.id===b?.horse_id)
    if(t){t.name=input.name;if('jef_member_no' in t)t.jef_member_no=input.jef||null;else t.jef_registration_no=input.jef||null}
   }
  }catch(error){issues.push(`${d.edited.people.find(p=>p.key===key)?.name??'人馬'}：${(error as Error).message}`)}
 }
 return {snapshot:projected,pending,issues}
}
