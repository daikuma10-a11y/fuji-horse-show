import {credentialValue,credentialLabel,credentialRequestId,credentialHash,validCredential,type WinterCredential,type CredentialExpectation,type CredentialSave} from './winter-application-credentials'
import {readApplicationDraft,type ApplicationDraft} from './winter-application-draft'
import {applicationReview,applicationSource,normalizeApplicationName,rosterCandidates} from './winter-application'
import {assertWinterEvent,WINTER_EVENT_ID,winterCompetition,winterStorageKey} from './winter-event'
import {importBindingKey,importCheckpointDifferences,importReference,readImportCheckpoint,reviewImportRegistration,runImportRegistration,type ImportCheckpoint,type ImportSnapshot,type ImportState} from './winter-import-registration'
import type {ApplicationPerson} from './master/application'
import type {SharedRoster,WinterRosterBinding,saveRosterEntity,saveWinterParticipants} from './shared-roster'
import type {saveWinterInitialEntry} from './winter-initial-entry'

type PersonResult={state:ImportState;entityId?:string}
export type ApplicationRegistration={
 kind:'winter-application-registration';version:1;eventId:string;review:ApplicationDraft
 people:Record<string,PersonResult>;participants:{state:ImportState;clubId?:string};entries:ImportCheckpoint|null;credentials?:Record<string,CredentialExpectation>
}
export type ApplicationSnapshot=ImportSnapshot&{roster:SharedRoster;bindings:WinterRosterBinding[];credentials:WinterCredential[]}
export type ApplicationRegistrationServices={
 load:()=>Promise<ApplicationSnapshot>
 savePerson:(input:Parameters<typeof saveRosterEntity>[0])=>ReturnType<typeof saveRosterEntity>
 saveParticipants:(...args:Parameters<typeof saveWinterParticipants> extends [...infer A,string]?A:never)=>ReturnType<typeof saveWinterParticipants>
 saveCredential:(input:CredentialSave)=>Promise<string>
 saveEntry:(input:Parameters<typeof saveWinterInitialEntry>[0])=>ReturnType<typeof saveWinterInitialEntry>
}
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
const copy=<T,>(v:T):T=>structuredClone(v)
function object(v:unknown):Record<string,unknown>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Error('登録再開記録の形式が違います');return v as Record<string,unknown>}
function state(v:unknown):ImportState{if(v!=='unregistered'&&v!=='registered'&&v!=='unknown')throw new Error('登録状態を確認できません');return v}
function personResult(v:unknown):PersonResult{const p=object(v),s=state(p.state);if(p.entityId!==undefined&&!uuid(p.entityId)||s==='registered'&&!p.entityId)throw new Error('登録人馬IDを確認できません');return {state:s,...(p.entityId?{entityId:p.entityId as string}:{})}}
export function createApplicationRegistration(draft:ApplicationDraft):ApplicationRegistration{
 const review=readApplicationDraft(draft);review.reference=importReference(review.reference)
 const people=Object.fromEntries(review.edited.people.map(p=>[p.key,{state:'unregistered' as const,...(uuid(review.choices[p.key])?{entityId:review.choices[p.key]}:{})}]))
 return {kind:'winter-application-registration',version:1,eventId:WINTER_EVENT_ID,review,people,participants:{state:'unregistered'},entries:null}
}
export function readApplicationRegistration(v:unknown):ApplicationRegistration{
 const x=object(v);assertWinterEvent(String(x.eventId))
 if(x.kind!=='winter-application-registration'||x.version!==1)throw new Error('WinterのExcel登録再開記録を選んでください')
 const review=readApplicationDraft(x.review);review.reference=importReference(review.reference)
 const raw=object(x.people),people:Record<string,PersonResult>={}
 if(Object.keys(raw).length!==review.edited.people.length)throw new Error('原本人馬と登録結果の件数が一致しません')
 for(const p of review.edited.people){
  people[p.key]=personResult(raw[p.key]);const chosen=review.choices[p.key]
  if(chosen!=='new'&&(!uuid(chosen)||people[p.key].entityId!==chosen))throw new Error('明示選択した人馬IDと再開記録が異なります')
 }
 const ps=object(x.participants),participants={state:state(ps.state),...(ps.clubId?{clubId:String(ps.clubId)}:{})}
 if(ps.clubId!==undefined&&!uuid(ps.clubId)||participants.state!=='unregistered'&&!participants.clubId)throw new Error('参加登録の団体を確認できません')
 const entries=x.entries===null?null:readImportCheckpoint(x.entries)
 if(entries){
  const expected=applicationSource(review.edited,review.paid,review.accountChecked)
  if(entries.reference!==review.reference||(['roster','entries','accounts'] as const).some(k=>entries.source[k]!==expected[k]))throw new Error('登録再開記録と確認した原本が異なります')
  if(Object.keys(entries.states).length>review.edited.entries.length||Object.keys(entries.states).some(k=>!uuid(k)))throw new Error('出番の登録状態が不正です')
 }
 const credentials:Record<string,CredentialExpectation>={}
 if(x.credentials!==undefined){
  for(const [key,v] of Object.entries(object(x.credentials))){const c=object(v)
   if(!review.edited.people.some(p=>p.key===key&&credentialValue(p))||!credentialHash(c.requestId)||c.expected!==null&&!credentialHash(c.expected))throw new Error('資格・グレードの再開記録を確認できません')
   credentials[key]={requestId:c.requestId,expected:c.expected as string|null}
  }
  if(Object.keys(credentials).length!==review.edited.people.filter(p=>credentialValue(p)).length)throw new Error('資格・グレードの再開記録の件数が一致しません')
 }
 return {kind:'winter-application-registration',version:1,eventId:WINTER_EVENT_ID,review,people,participants,entries,...(x.credentials===undefined?{}:{credentials})}
}
export function serializeApplicationRegistration(value:ApplicationRegistration){const text=JSON.stringify(readApplicationRegistration(value));if(new TextEncoder().encode(text).byteLength>8_000_000)throw new Error('登録再開記録は8MB以内です');return text}
export function parseApplicationRegistration(text:string){if(text.length>8_000_000)throw new Error('登録再開記録は8MB以内です');return readApplicationRegistration(JSON.parse(text))}
export const applicationRegistrationKey=(reference:string)=>winterStorageKey('application-registration')+':'+encodeURIComponent(importReference(reference))
export function applicationRegistrationDifferences(before:ApplicationRegistration,after:ApplicationRegistration){
 const issues:string[]=[]
 if(before.credentials&&JSON.stringify(before.credentials)!==JSON.stringify(after.credentials))issues.push('資格・グレードの保存開始時の照合記録を変更できません')
 if(JSON.stringify(before.review)!==JSON.stringify(after.review))issues.push('確定時の原本・訂正・対応・金額が変わっています。既存記録を保持してください')
 for(const [key,p] of Object.entries(before.people)){const n=after.people[key];if(!n||p.entityId&&p.entityId!==n.entityId||p.state!=='unregistered'&&n.state==='unregistered')issues.push(`${key}：保存結果を変更・巻戻しできません`)}
 if(before.participants.clubId&&before.participants.clubId!==after.participants.clubId||before.participants.state!=='unregistered'&&after.participants.state==='unregistered')issues.push('参加登録結果を変更・巻戻しできません')
 if(before.entries){
  if(!after.entries)issues.push('出番の登録記録を破棄できません')
  else{issues.push(...importCheckpointDifferences(before.entries,after.entries));for(const [id,s] of Object.entries(before.entries.states))if(s!=='unregistered'&&(!after.entries.states[id]||after.entries.states[id]==='unregistered'))issues.push('出番の保存結果を巻戻しできません')}
 }
 return issues
}
export function persistApplicationRegistration(storage:Pick<Storage,'getItem'|'setItem'>,value:ApplicationRegistration,expected:string|null){
 const next=readApplicationRegistration(value),key=applicationRegistrationKey(next.review.reference),prior=storage.getItem(key)
 if(prior!==expected)throw new Error('別の登録再開記録があります。上書きせず停止します')
 if(prior){const differences=applicationRegistrationDifferences(parseApplicationRegistration(prior),next);if(differences.length)throw new Error(differences.join('\n'))}
 const text=serializeApplicationRegistration(next);storage.setItem(key,text)
 if(storage.getItem(key)!==text)throw new Error('登録前の再開記録を保存できません。登録を停止します')
 return text
}
function validateSnapshot(s:ApplicationSnapshot){
 assertWinterEvent(s.data.eventId)
 for(const row of [...s.data.organizations,...s.data.riders,...s.data.horses,...s.data.competitions,...s.data.entries,...s.initial,...s.roster.participants,...s.credentials])assertWinterEvent(row.event_id)
 const keys=new Set<string>(),targets=new Set<string>()
 for(const b of s.bindings){
  const key=JSON.stringify([b.entity_id,b.club_id]),target=b.rider_id??b.horse_id
  if(!uuid(b.entity_id)||!uuid(b.club_id)||!uuid(target)||!!b.rider_id===!!b.horse_id||keys.has(key)||targets.has(target))throw new Error('Winter人馬IDの対応を確認できません')
  keys.add(key);targets.add(target)
 }
}
function identityIssues(p:ApplicationPerson,id:string,clubId:string|undefined,s:ApplicationSnapshot,requireReading=false){
 const e=s.roster.entities.find(e=>e.id===id),issues:string[]=[]
 if(!e||e.archived_at||e.kind!==p.kind)return [`${p.name}：選択した人馬が不存在・削除済み・別種別です`]
 if(e.name!==p.name.trim()||(e.jef_number??'')!==p.jef.trim()||requireReading&&e.reading!==p.reading.trim())issues.push(`${p.name}：既存名簿との差分があります（既存名 ${e.name}／日馬連 ${e.jef_number??'空欄'}／読み ${e.reading}）。既存値は上書きしません`)
 if(!clubId||!s.roster.affiliations.some(a=>a.entity_id===id&&a.club_id===clubId&&!a.ended_at))issues.push(`${p.name}：申込団体への所属が確認できません。既存の人馬登録欄で所属を確認してください`)
 if(clubId&&s.roster.participants.some(x=>x.entity_id===id&&x.club_id===clubId)){
  const bridge=s.bindings.find(b=>b.entity_id===id&&b.club_id===clubId)
  const actual=p.kind==='rider'?s.data.riders.find(r=>r.id===bridge?.rider_id):s.data.horses.find(h=>h.id===bridge?.horse_id)
  const jef=actual&&('jef_member_no' in actual?actual.jef_member_no:actual.jef_registration_no)
  if(!actual||actual.is_participant===false||actual.name!==p.name.trim()||(jef??'')!==p.jef.trim()||s.data.organizations.find(o=>o.id===actual.organization_id)?.name!==s.roster.clubs.find(c=>c.id===clubId)?.name)issues.push(`${p.name}：既存のWinter参加名簿と申込内容に差分があります。登録前に確認してください`)
 }
 return issues
}
/** Existing participant publication can refresh snapshots; block any pre-existing difference first. */
function participantIssues(clubId:string,s:ApplicationSnapshot){
 const issues:string[]=[],club=s.roster.clubs.find(c=>c.id===clubId)
 for(const p of s.roster.participants.filter(p=>p.club_id===clubId)){
  const b=s.bindings.find(b=>b.entity_id===p.entity_id&&b.club_id===clubId),e=s.roster.entities.find(e=>e.id===p.entity_id)
  const actual=b?.rider_id?s.data.riders.find(r=>r.id===b.rider_id):s.data.horses.find(h=>h.id===b?.horse_id)
  const org=s.data.organizations.find(o=>o.id===actual?.organization_id)
  if(!b||!e||!actual||e.kind!==(b.rider_id?'rider':'horse')||actual.is_participant===false||actual.name!==p.name_snapshot||('jef_member_no' in actual?actual.jef_member_no:actual.jef_registration_no)!==p.jef_number_snapshot||org?.name!==p.club_name_snapshot||club?.name!==p.club_name_snapshot)issues.push(`${p.name_snapshot}：保存済み参加名簿と現在のWinter人馬に差分があります。上書きせず確認してください`)
 }
 return issues
}
function entryCheckpoint(work:ApplicationRegistration,s:ApplicationSnapshot,clubId:string):ImportCheckpoint{
 const bindings:Record<string,string>={};let orgId=''
 for(const p of work.review.edited.people){
  const id=work.people[p.key].entityId,bridge=s.bindings.find(b=>b.entity_id===id&&b.club_id===clubId)
  if(!id||!s.roster.participants.some(x=>x.entity_id===id&&x.club_id===clubId)||!bridge)throw new Error('参加登録と人馬IDの対応を確認してください')
  const target=p.kind==='rider'?bridge.rider_id:bridge.horse_id
  const actual=(p.kind==='rider'?s.data.riders:s.data.horses).find(x=>x.id===target)
  if(!target||!actual||orgId&&orgId!==actual.organization_id)throw new Error('人馬の所属とWinter参加IDが一致しません')
  orgId=actual.organization_id;bindings[importBindingKey(p.kind==='rider'?'選手':'馬',p.key)]=target
 }
 if(!orgId||s.data.organizations.find(o=>o.id===orgId)?.name!==work.review.edited.club.trim())throw new Error('申込団体とWinterの請求団体が一致しません')
 bindings[importBindingKey('団体','ORG')]=orgId
 return {kind:'winter-import-registration',version:1,eventId:WINTER_EVENT_ID,reference:work.review.reference,source:applicationSource(work.review.edited,work.review.paid,work.review.accountChecked),bindings,states:work.entries?.states??{}}
}
export async function reviewApplicationRegistration(value:ApplicationRegistration,s:ApplicationSnapshot){
 const work=readApplicationRegistration(value);validateSnapshot(s)
 const app=work.review.edited,review=applicationReview(app,work.review.paid,work.review.accountChecked)
 const issues=[...app.issues,...review.credentialIssues,...review.report.issues.filter(i=>i.severity==='error').map(i=>i.message),...review.amounts.filter(a=>a.reason).map(a=>`${a.label}：${a.reason}`)]
 if(!review.ready)issues.push('原本・人馬・区分・料金・入金額の確認を完了してください')
 const clubs=s.roster.clubs.filter(c=>c.name===app.club.trim());if(clubs.length>1)issues.push('申込団体を一意に確認できません')
 const clubId=clubs[0]?.id
 if(work.participants.clubId&&work.participants.clubId!==clubId)issues.push('保存済みの団体IDが一致しません')
 if(clubId)issues.push(...participantIssues(clubId,s))
 const ids=new Set<string>(),rows=app.people.map(p=>{
  const result=work.people[p.key],chosen=work.review.choices[p.key],problems:string[]=[]
  if(result.entityId){
   if(ids.has(result.entityId))problems.push('同じ人馬を複数の原本番号に対応付けています');ids.add(result.entityId)
   problems.push(...identityIssues(p,result.entityId,clubId,s,chosen==='new'))
  }else if(result.state!=='unregistered')problems.push(`${p.name}：新規登録の結果が不明です。再送せず、既存名簿を照合して保存された人馬を明示選択してください`)
  else if(chosen!=='new')problems.push(`${p.name}：既存人馬か新規登録かを明示選択してください`)
  else if(rosterCandidates(p,s.roster,app.club).length||s.roster.entities.some(e=>e.kind===p.kind&&e.archived_at&&(normalizeApplicationName(e.name)===normalizeApplicationName(p.name)||p.jef&&e.jef_number===p.jef)))problems.push(`${p.name}：既存または削除済みの候補があります。新規作成せず人馬登録欄で確認してください`)
  if(p.jef&&!/^\d+$/.test(p.jef.trim()))problems.push(`${p.name}：日馬連番号は数字または空欄です`)
  issues.push(...problems)
  return {key:p.key,name:p.name,entityId:result.entityId,state:result.entityId&&!problems.length?'registered' as const:result.state,issues:problems}
 })
 const pairs=new Set<string>()
 for(const e of review.report.entries){
  const pair=JSON.stringify([e.competition,e.rider,e.horse]);if(pairs.has(pair))issues.push('同一競技・人馬が重複しています。既存の事前登録は2回目のOP登録に対応していません');pairs.add(pair)
  const c=s.data.competitions.find(c=>c.competition_no===e.competition)
  if(!c){issues.push(`第${e.competition}競技がWinterにありません`);continue}
  try{const expected=winterCompetition(e.competition);if(c.official!==expected.official||c.fee!==expected.fee||c.member_fee!==expected.memberFee||c.nonmember_fee!==expected.nonmemberFee||c.op_fee!==expected.opFee)issues.push(`第${e.competition}競技の料金設定が確認時と異なります`)}catch(error){issues.push(error instanceof Error?error.message:'競技を確認してください')}
 }
 let entries:Awaited<ReturnType<typeof reviewImportRegistration>>|null=null
 const participating=!!clubId&&rows.every(p=>p.entityId&&s.roster.participants.some(x=>x.club_id===clubId&&x.entity_id===p.entityId))
 if(participating&&clubId){try{
  const next=entryCheckpoint(work,s,clubId)
  if(work.entries)issues.push(...importCheckpointDifferences(work.entries,next))
  entries=await reviewImportRegistration(next,s);issues.push(...entries.issues,...entries.rows.flatMap(r=>r.differences))
 }catch(error){issues.push(error instanceof Error?error.message:'出番との対応を確認できません')}}
 else if(work.entries)issues.push('保存後に参加名簿が変わっています。再登録せず確認してください')
 const credentials=await Promise.all(app.people.map(async p=>{
  const value=credentialValue(p),entityId=work.people[p.key].entityId
  const current=s.credentials.find(c=>c.entity_id===entityId&&c.club_id===clubId)
  const requestId=await credentialRequestId(work.review,p),saved=!!value&&current?.value===value
  const expected=work.credentials?.[p.key]?.expected??null
  const target=s.bindings.find(b=>b.entity_id===entityId&&b.club_id===clubId)
  if(current&&(current.kind!==p.kind||current.target_id!==(p.kind==='rider'?target?.rider_id:target?.horse_id)))issues.push(`${p.name}：資格・グレードの人馬IDが一致しません`)
  if(value&&!validCredential(p.kind,value))issues.push(`${p.name}：${credentialLabel(p.kind)}を原本で確認してください`)
  if(value&&work.credentials&&(work.credentials[p.key]?.requestId!==requestId||!saved&&(current?.request_id??null)!==expected))issues.push(`${p.name}：保存開始後に資格・グレードが変わっています。古い記録で上書きせず、最新の申込書で確認してください`)
  return {key:p.key,name:p.name,kind:p.kind,value,previous:current?.value??'',saved,requestId,expected:work.credentials?.[p.key]?.expected??current?.request_id??null}
 }))
 return {ready:issues.length===0,issues,people:rows,clubId,participating,entries,credentials,credentialsComplete:credentials.every(c=>!c.value||c.saved)}
}
export async function resolveUnknownApplicationPerson(value:ApplicationRegistration,key:string,entityId:string,s:ApplicationSnapshot){
 const work=readApplicationRegistration(value);validateSnapshot(s)
 const p=work.review.edited.people.find(p=>p.key===key),result=work.people[key]
 if(!p||!uuid(entityId)||work.review.choices[key]!=='new'||result?.state!=='unknown'||result.entityId)throw new Error('結果不明の新規人馬だけを明示照合できます')
 const clubId=s.roster.clubs.find(c=>c.name===work.review.edited.club.trim())?.id
 const issues=identityIssues(p,entityId,clubId,s,true)
 if(Object.entries(work.people).some(([k,p])=>k!==key&&p.entityId===entityId))issues.push('他の原本行に対応済みです')
 if(issues.length)throw new Error(issues.join('\n'))
 work.people[key]={state:'registered',entityId};return work
}
/** Persist uncertainty before each request; only authoritative readback establishes success. */
export async function runApplicationRegistration(value:ApplicationRegistration,deps:ApplicationRegistrationServices&{persist:(v:ApplicationRegistration)=>void;stop:()=>boolean}){
 const work=readApplicationRegistration(value),persist=()=>deps.persist(copy(work))
 async function check(){const s=await deps.load(),plan=await reviewApplicationRegistration(work,s);if(!plan.ready)throw new Error(plan.issues.join('\n'));return {s,plan}}
 const start=await check()
 if(!work.credentials)work.credentials=Object.fromEntries(start.plan.credentials.filter(c=>c.value).map(c=>[c.key,{requestId:c.requestId,expected:c.expected}]))
 persist()
 for(const p of work.review.edited.people){
  if(deps.stop())return work
  const {plan}=await check(),row=plan.people.find(r=>r.key===p.key)!
  if(row.state==='registered'&&row.entityId){work.people[p.key]={state:'registered',entityId:row.entityId};persist();continue}
  work.people[p.key]={state:'unknown'};persist()
  const entityId=await deps.savePerson({kind:p.kind,name:p.name.trim(),reading:p.reading.trim(),jefNumber:p.jef.trim(),clubName:work.review.edited.club.trim()})
  if(!uuid(entityId))throw new Error('新規人馬の登録番号を確認できません。再送せず名簿を照合してください')
  work.people[p.key]={state:'unknown',entityId};persist()
  const after=await check();if(after.plan.people.find(r=>r.key===p.key)?.state!=='registered')throw new Error('人馬の保存結果が一致しません')
  work.people[p.key]={state:'registered',entityId};persist()
 }
 if(deps.stop())return work
 let {s,plan}=await check();const clubId=plan.clubId
 if(!clubId)throw new Error('登録先の団体を確認できません')
 if(!plan.participating){
  const expected=s.roster.participants.filter(p=>p.club_id===clubId).map(p=>p.entity_id),ids=[...new Set([...expected,...Object.values(work.people).map(p=>p.entityId!)])]
  work.participants={state:'unknown',clubId};persist()
  await deps.saveParticipants(clubId,ids,expected)
  const after=await check();s=after.s;plan=after.plan
  if(!plan.participating||expected.some(id=>!s.roster.participants.some(p=>p.club_id===clubId&&p.entity_id===id)))throw new Error('参加登録の保存結果が一致しません。既存の参加履歴を確認してください')
 }
 work.participants={state:'registered',clubId};persist()
 if(deps.stop())return work
 for(const p of work.review.edited.people){
  if(deps.stop())return work
  const before=await check(),row=before.plan.credentials.find(c=>c.key===p.key)!
  if(!row.value||row.saved)continue
  const entityId=work.people[p.key].entityId!,bridge=before.s.bindings.find(b=>b.entity_id===entityId&&b.club_id===clubId)
  const targetId=p.kind==='rider'?bridge?.rider_id:bridge?.horse_id
  if(!targetId)throw new Error('資格・グレードの登録先を確認できません')
  // The immutable expectation was persisted before any request. Lost responses are safe to read back.
  persist()
  await deps.saveCredential({eventId:WINTER_EVENT_ID,entityId,clubId,targetId,kind:p.kind,name:p.name.trim(),jef:p.jef.trim(),value:row.value,requestId:row.requestId,expected:work.credentials![p.key].expected,digest:work.review.original.digest,reference:work.review.reference,location:p.credentialOrigin?`${p.credentialOrigin.sheet}!${p.credentialOrigin.cell}`:`${p.origin.sheet}!${p.origin.cell}（原本確認）`})
  const after=await check();if(!after.plan.credentials.find(c=>c.key===p.key)?.saved)throw new Error('資格・グレードの保存結果が一致しません。再照合してください')
  s=after.s;persist()
 }
 if(deps.stop())return work
 const next=entryCheckpoint(work,s,clubId)
 if(work.entries&&importCheckpointDifferences(work.entries,next).length)throw new Error('出番の原本・対応が保存時と異なります')
 work.entries=next;persist()
 work.entries=await runImportRegistration(next,{load:async()=>{const after=await check();return after.s},save:deps.saveEntry,stop:deps.stop,persist:entry=>{work.entries=copy(entry);persist()}})
 persist();return work
}
