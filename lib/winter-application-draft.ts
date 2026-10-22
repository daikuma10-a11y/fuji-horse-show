import type {Application,ApplicationPerson,ApplicationEntry,Origin} from './master/application'
import {WINTER_EVENT_ID,winterStorageKey} from './winter-event'

/** Review-only checkpoint. It must never be interpreted as a database save result. */
export type ApplicationDraft = {
 kind:'winter-application-review';version:1;eventId:string
 original:Application;edited:Application;reference:string;paid:string;accountChecked:boolean
 choices:Record<string,string>
}
const failure=()=>new Error('WinterのExcel確認再開ファイルを確認できません。元のファイルを保持してください')
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw failure();return v as Record<string,unknown>}
function string(v:unknown,max=1000){if(typeof v!=='string'||v.length>max)throw failure();return v}
function flag(v:unknown){if(typeof v!=='boolean')throw failure();return v}
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
  return {key:string(p.key,100),kind:p.kind as 'rider'|'horse',name:string(p.name,100),reading:string(p.reading,100),jef:string(p.jef,100),grade:string(p.grade,100),...(p.horseGrade===undefined?{}:{horseGrade:string(p.horseGrade,100)}),...(p.credentialOrigin===undefined?{}:{credentialOrigin:source(p.credentialOrigin)}),sportsMember:string(p.sportsMember,100),instructorMember:string(p.instructorMember,100),checked:flag(p.checked),qualified:flag(p.qualified),origin:source(p.origin)}
 })
 const entries:ApplicationEntry[]=list(a.entries,5000).map(v=>{
  const e=object(v);return {key:string(e.key,200),competition:string(e.competition,20),rider:string(e.rider,100),horse:string(e.horse,100),op:flag(e.op),rawRider:string(e.rawRider,1000),rawHorse:string(e.rawHorse,1000),origin:source(e.origin)}
 })
 if(new Set(people.map(p=>p.key)).size!==people.length||new Set(entries.map(p=>p.key)).size!==entries.length)throw failure()
 const amount=object(a.amounts),origins=object(a.amountOrigins)
 return {fileName:string(a.fileName,255),digest,eventId:WINTER_EVENT_ID,club:string(a.club,100),clubOrigin:source(a.clubOrigin),people,entries,
  amounts:{horse:string(amount.horse,100),jump:string(amount.jump,100),dressage:string(amount.dressage,100),total:string(amount.total,100)},
  amountOrigins:Object.fromEntries(['horse','jump','dressage','total'].map(k=>[k,source(origins[k])])),
  issues:list(a.issues,10000).map(x=>string(x,4000)),sheets:list(a.sheets,32).map(x=>string(x,100))}
}
export function createApplicationDraft(app:Application):ApplicationDraft{
 return {kind:'winter-application-review',version:1,eventId:WINTER_EVENT_ID,original:structuredClone(app),edited:structuredClone(app),reference:`WINTER-2026-${app.digest.slice(0,32)}`,paid:'',accountChecked:false,choices:{}}
}
export function readApplicationDraft(v:unknown):ApplicationDraft{
 const d=object(v)
 if(d.kind!=='winter-application-review'||d.version!==1||d.eventId!==WINTER_EVENT_ID)throw failure()
 const original=application(d.original),edited=application(d.edited),rawChoices=object(d.choices),choices:Record<string,string>={}
 if(original.digest!==edited.digest||original.fileName!==edited.fileName)throw failure()
 // Editing may change values, not the saved source locations or roster/entry identity.
 for(const section of ['people','entries'] as const){
  if(original[section].length!==edited[section].length)throw failure()
  original[section].forEach((p,i)=>{if(p.key!==edited[section][i].key||JSON.stringify(p.origin)!==JSON.stringify(edited[section][i].origin))throw failure()})
 }
 original.people.forEach((p,i)=>{if(p.kind!==edited.people[i].kind||JSON.stringify(p.credentialOrigin)!==JSON.stringify(edited.people[i].credentialOrigin))throw failure()})
 original.entries.forEach((p,i)=>{if(p.rawRider!==edited.entries[i].rawRider||p.rawHorse!==edited.entries[i].rawHorse)throw failure()})
 for(const key of ['clubOrigin','amountOrigins','issues','sheets'] as const)if(JSON.stringify(original[key])!==JSON.stringify(edited[key]))throw failure()
 for(const key of Object.keys(rawChoices)){
  if(!edited.people.some(p=>p.key===key))throw failure()
  const choice=string(rawChoices[key],36)
  if(choice!==''&&choice!=='new'&&!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(choice))throw failure()
  choices[key]=choice
 }
 return {kind:'winter-application-review',version:1,eventId:WINTER_EVENT_ID,original,edited,reference:string(d.reference,100),paid:string(d.paid,100),accountChecked:flag(d.accountChecked),choices}
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
