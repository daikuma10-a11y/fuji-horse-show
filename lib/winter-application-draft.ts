import {stableScheduleKeys, type StableSchedule} from './master/stable-schedule'
import type {Application,ApplicationPerson,ApplicationEntry,ApplicationEntryCount,Origin,RosterAffiliationEdit} from './master/application'
import {WINTER_EVENT_ID,winterStorageKey} from './winter-event'
import {autofillApplicationPerson,type JefRiderRecord} from './master/application-autofill'
import {manualApplicationOrigin} from './master/application-additions'
import {readApplicationRosterPreparation,retainRosterPreparation,type ApplicationRosterPreparation} from './winter-application-roster-stage'

/** Review-only checkpoint. It must never be interpreted as a database save result. */
export type ApplicationDraft = {
 kind:'winter-application-review';version:1;eventId:string
 original:Application;edited:Application;reference:string;paid:string;accountChecked:boolean
 choices:Record<string,string>
 rosterEdits?:Record<string,RosterAffiliationEdit>
 rosterPreparation?:ApplicationRosterPreparation
}
const failure=()=>new Error('WinterのExcel確認再開ファイルを確認できません。元のファイルを保持してください')
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw failure();return v as Record<string,unknown>}
function string(v:unknown,max=1000){if(typeof v!=='string'||v.length>max)throw failure();return v}
function flag(v:unknown){if(typeof v!=='boolean')throw failure();return v}
function addition(p:Record<string,unknown>){
 if(p.added!==undefined&&p.added!==true||p.sourceKey!==undefined&&p.added!==true)throw failure()
 return {...(p.added===true?{added:true as const}:{}),...(p.sourceKey===undefined?{}:{sourceKey:string(p.sourceKey,200)})}
}
function list(v:unknown,max:number){if(!Array.isArray(v)||v.length>max)throw failure();return v}
function source(v:unknown):Origin{
 const o=object(v),cell=string(o.cell,10)
 if(!/^[A-Z]{1,3}[1-9]\d{0,6}$/.test(cell))throw failure()
 return {sheet:string(o.sheet,100),cell,value:string(o.value,4000),...(o.formula===undefined?{}:{formula:string(o.formula,4000)})}
}
function application(v:unknown):Application{
 const a=object(v),digest=string(a.digest,64)
 if(a.eventId!==WINTER_EVENT_ID||!/^[0-9a-f]{64}$/.test(digest))throw failure()
 const people:ApplicationPerson[]=list(a.people,50).map(v=>{
  const p=object(v);if(!['rider','horse'].includes(String(p.kind)))throw failure()
  let gradeAutofill:ApplicationPerson['gradeAutofill']
  if(p.gradeAutofill!==undefined){const s=object(p.gradeAutofill);gradeAutofill={memberNo:string(s.memberNo,100),name:string(s.name,100),grade:string(s.grade,1),importDate:string(s.importDate,10)};if(!/^\d+$/.test(gradeAutofill.memberNo)||!['A','B','C'].includes(gradeAutofill.grade)||!/^\d{4}-\d{2}-\d{2}$/.test(gradeAutofill.importDate)||p.kind!=='rider')throw failure()}
  return {...addition(p),key:string(p.key,100),kind:p.kind as 'rider'|'horse',name:string(p.name,100),reading:string(p.reading,100),jef:string(p.jef,100),grade:string(p.grade,100),...(p.horseGrade===undefined?{}:{horseGrade:string(p.horseGrade,100)}),...(p.credentialOrigin===undefined?{}:{credentialOrigin:source(p.credentialOrigin)}),...(gradeAutofill?{gradeAutofill}:{}),...(p.gradeManual===undefined?{}:{gradeManual:flag(p.gradeManual)}),...(p.readingAutofill===undefined?{}:{readingAutofill:string(p.readingAutofill,100)}),sportsMember:string(p.sportsMember,100),instructorMember:string(p.instructorMember,100),checked:flag(p.checked),qualified:flag(p.qualified),origin:source(p.origin)}
 })
 const entries:ApplicationEntry[]=list(a.entries,5000).map(v=>{
  const e=object(v);return {...addition(e),key:string(e.key,200),competition:string(e.competition,20),rider:string(e.rider,100),horse:string(e.horse,100),op:flag(e.op),...(e.countBlock===undefined?{}:{countBlock:string(e.countBlock,200)}),rawRider:string(e.rawRider,1000),rawHorse:string(e.rawHorse,1000),origin:source(e.origin)}
 })
 if(new Set(people.map(p=>p.key)).size!==people.length||new Set(entries.map(p=>p.key)).size!==entries.length)throw failure()
 let entryCounts:ApplicationEntryCount[]|undefined,entryCountCorrections:Record<string,string>|undefined
 if(a.entryCounts!==undefined){
  entryCounts=list(a.entryCounts,6000).map(v=>{
   const row=object(v),membership=row.membership
   if(membership!==undefined&&membership!=='sportsMember'&&membership!=='instructorMember')throw failure()
   const buckets=list(row.buckets,3).map(v=>{const b=object(v);if(!['regular','op','member','nonmember'].includes(String(b.kind)))throw failure();return {kind:b.kind as ApplicationEntryCount['buckets'][number]['kind'],origin:source(b.origin)}})
   if(!buckets.length||new Set(buckets.map(b=>b.kind)).size!==buckets.length)throw failure()
   return {key:string(row.key,200),block:string(row.block,200),competition:string(row.competition,20),horseKeys:list(row.horseKeys,20).map(x=>string(x,100)),entryKeys:list(row.entryKeys,5000).map(x=>string(x,200)),...(membership?{membership}:{}),buckets}
  })
  if(new Set(entryCounts.map(r=>r.key)).size!==entryCounts.length)throw failure()
  const keys=entryCounts.flatMap(r=>r.entryKeys)
  if(new Set(keys).size!==keys.length||keys.some(key=>!entries.some(e=>e.key===key&&!e.added))||entryCounts.some(r=>r.horseKeys.some(key=>!people.some(p=>p.key===key&&p.kind==='horse'))))throw failure()
 }
 if(entries.some(e=>e.countBlock&&!entryCounts?.some(row=>row.block===e.countBlock)))throw failure()
 if(a.entryCountCorrections!==undefined){
  entryCountCorrections={}
  const keys=new Set(entryCounts?.flatMap(row=>row.buckets.map(b=>`${row.key}:${b.kind}`)))
  for(const [key,value] of Object.entries(object(a.entryCountCorrections))){if(!keys.has(key))throw failure();entryCountCorrections[key]=string(value,100)}
 }
 const amount=object(a.amounts),origins=object(a.amountOrigins)
 const stable=a.stable===undefined?undefined:Object.fromEntries(stableScheduleKeys.map(key=>[key,string(object(a.stable)[key],key==='notes'?1000:200)])) as StableSchedule
 const stableOrigins=a.stableOrigins===undefined?undefined:{arrival:list(object(a.stableOrigins).arrival,10).map(source),departure:list(object(a.stableOrigins).departure,10).map(source),notes:list(object(a.stableOrigins).notes,20).map(source)}
 return {...(stable?{stable}:{}),...(stableOrigins?{stableOrigins}:{}),fileName:string(a.fileName,255),digest,eventId:WINTER_EVENT_ID,club:string(a.club,100),clubOrigin:source(a.clubOrigin),people,entries,...(entryCounts===undefined?{}:{entryCounts}),...(entryCountCorrections===undefined?{}:{entryCountCorrections}),
  amounts:{horse:string(amount.horse,100),jump:string(amount.jump,100),dressage:string(amount.dressage,100),total:string(amount.total,100)},
  amountOrigins:Object.fromEntries(['horse','jump','dressage','total'].map(k=>[k,source(origins[k])])),
  issues:list(a.issues,10000).map(x=>string(x,4000)),sheets:list(a.sheets,32).map(x=>string(x,100))}
}
export function createApplicationDraft(app:Application):ApplicationDraft{
 return autofillApplicationDraft({kind:'winter-application-review',version:1,eventId:WINTER_EVENT_ID,original:structuredClone(app),edited:structuredClone(app),reference:`WINTER-2026-${app.digest.slice(0,32)}`,paid:'',accountChecked:false,choices:{}},[])
}
export function autofillApplicationDraft(draft:ApplicationDraft,rows:JefRiderRecord[]):ApplicationDraft{
 const people=draft.edited.people.map(p=>autofillApplicationPerson(p,rows))
 if(JSON.stringify(people)===JSON.stringify(draft.edited.people))return draft
 return retainRosterPreparation({...draft,edited:{...draft.edited,people},accountChecked:false})
}
export function readApplicationDraft(v:unknown):ApplicationDraft{
 const d=object(v)
 if(d.kind!=='winter-application-review'||d.version!==1||d.eventId!==WINTER_EVENT_ID)throw failure()
 const original=application(d.original),edited=application(d.edited),rawChoices=object(d.choices),choices:Record<string,string>={}
 if(original.digest!==edited.digest||original.fileName!==edited.fileName)throw failure()
 // Source rows remain immutable; clearly marked manual rows may be added between them.
 for(const section of ['people','entries'] as const){
  if(original[section].some(p=>p.added||p.sourceKey))throw failure()
  const retained=edited[section].filter(p=>!p.added)
  if(original[section].length!==retained.length)throw failure()
  original[section].forEach((p,i)=>{if(p.key!==retained[i].key||JSON.stringify(p.origin)!==JSON.stringify(retained[i].origin))throw failure()})
  for(const row of edited[section].filter(p=>p.added)){
   const prefix=section==='people'?'manual-person-':'manual-entry-'
   if(!row.key.startsWith(prefix)||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(row.key.slice(prefix.length))||JSON.stringify(row.origin)!==JSON.stringify(manualApplicationOrigin())||original[section].some(p=>p.key===row.key))throw failure()
   if(row.sourceKey&&(section!=='entries'||row.sourceKey===row.key||!edited.entries.some(e=>e.key===row.sourceKey)))throw failure()
  }
 }
 original.people.forEach(p=>{const e=edited.people.find(e=>e.key===p.key)!;if(p.kind!==e.kind||JSON.stringify(p.credentialOrigin)!==JSON.stringify(e.credentialOrigin))throw failure()})
 original.entries.forEach(p=>{const e=edited.entries.find(e=>e.key===p.key)!;if(p.countBlock!==undefined||p.rawRider!==e.rawRider||p.rawHorse!==e.rawHorse)throw failure()})
 for(const e of edited.entries.filter(e=>e.added))if(e.rawRider||e.rawHorse)throw failure()
 for(const key of ['clubOrigin','amountOrigins','issues','sheets','entryCounts','stableOrigins'] as const)if(JSON.stringify(original[key])!==JSON.stringify(edited[key]))throw failure()
 for(const key of Object.keys(rawChoices)){
  if(!edited.people.some(p=>p.key===key))throw failure()
  const choice=string(rawChoices[key],36)
  if(choice!==''&&choice!=='new'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(choice))throw failure()
  choices[key]=choice
 }
 if(original.entryCountCorrections!==undefined)throw failure()
 const rosterEdits:Record<string,RosterAffiliationEdit>={}
 if(d.rosterEdits!==undefined)for(const [key,value] of Object.entries(object(d.rosterEdits))){
  const e=object(value),entityId=string(e.entityId,36),clubId=string(e.clubId,36),endClubIds=list(e.endClubIds,200).map(x=>string(x,36))
  const uuid=(s:string)=>/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
  if(!edited.people.some(p=>p.key===key)||!uuid(entityId)||choices[key]!==entityId||clubId&&!uuid(clubId)||endClubIds.some(id=>!uuid(id))||new Set(endClubIds).size!==endClubIds.length||!['application','existing','manual'].includes(String(e.source)))throw failure()
  rosterEdits[key]={entityId,source:e.source as RosterAffiliationEdit['source'],clubId,clubName:string(e.clubName,100),endClubIds}
 }
 const result:ApplicationDraft={kind:'winter-application-review',version:1,eventId:WINTER_EVENT_ID,original,edited,reference:string(d.reference,100),paid:string(d.paid,100),accountChecked:flag(d.accountChecked),choices,...(d.rosterEdits===undefined?{}:{rosterEdits})}
 if(d.rosterPreparation!==undefined)result.rosterPreparation=readApplicationRosterPreparation(d.rosterPreparation,result)
 return result
}
export function parseApplicationDraft(text:string){if(text.length>8_000_000)throw failure();return readApplicationDraft(JSON.parse(text))}
export function serializeApplicationDraft(draft:ApplicationDraft){
 const text=JSON.stringify(readApplicationDraft(draft))
 if(new TextEncoder().encode(text).byteLength>8_000_000)throw new Error('確認再開ファイルが8MBを超えます。現在の入力とExcel原本を保持してください')
 return text
}
export const applicationDraftKey=(digest:string)=>winterStorageKey('application-review')+':'+digest
/** Detect changes since the last explicit read; this is not a database transaction. */
export function persistApplicationDraft(storage:Pick<Storage,'getItem'|'setItem'>,draft:ApplicationDraft,expected:string|null){
 const clean=readApplicationDraft(draft),key=applicationDraftKey(clean.original.digest),prior=storage.getItem(key)
 if(prior!==expected)throw new Error('別の確認記録が端末に保存されています。上書きせず「この端末の確認途中を開く」で確認してください')
 const text=serializeApplicationDraft(clean)
 storage.setItem(key,text)
 if(storage.getItem(key)!==text)throw new Error('確認途中の端末保存を確認できません。再開JSONを保存してください')
 return text
}
