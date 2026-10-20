import {reviewWinterImport, readImportDraft, type ImportSource} from './winter-import-review'
import {assertWinterEvent, WINTER_EVENT_ID} from './winter-event'
import {reviewWinterInitialEntry, type WinterInitialEntryInput} from './winter-initial-entry'
import type {loadWinterData} from './winter-data'
import type {WinterInitialCharge} from './winter-settlement'

export type ImportBindings = Record<string,string>
export type ImportState = 'unregistered'|'registered'|'unknown'
export type ImportCheckpoint = {
 kind:'winter-import-registration';version:1;eventId:string;reference:string;
 source:ImportSource;bindings:ImportBindings;states:Record<string,ImportState>
}
export type ImportSnapshot = {data:Awaited<ReturnType<typeof loadWinterData>>;initial:WinterInitialCharge[]}
export type ImportRegistrationRow = {id:string;index:number;input:WinterInitialEntryInput;fee:number;state:ImportState;differences:string[];registeredId?:string}
export const importBindingKey=(kind:string,id:string)=>JSON.stringify([kind,id])
export function importReference(value:string){
 const reference=value.normalize('NFKC').trim()
 if(!reference||reference.length>100)throw new Error('原本を特定する資料番号を1〜100文字で入力してください。訂正版でも同じ番号を使います')
 return reference
}
/** Retain the recorded algorithm: content corrections must not generate a new retry ID. */
export async function importEntryId(reference:string,index:number){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(['winter-import-v1',WINTER_EVENT_ID,importReference(reference),index])))
 const b=new Uint8Array(bytes).slice(0,16);b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128
 const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('')
 return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`
}
export function readImportCheckpoint(value:unknown):ImportCheckpoint{
 if(!value||typeof value!=='object')throw new Error('再開ファイルの形式が違います')
 const v=value as ImportCheckpoint
 assertWinterEvent(v.eventId)
 if(v.kind!=='winter-import-registration'||v.version!==1)throw new Error('Winterの登録再開ファイルを選んでください')
 const source=readImportDraft({kind:'winter-import-review',version:1,eventId:v.eventId,source:v.source})
 if(!v.bindings||typeof v.bindings!=='object'||Array.isArray(v.bindings)||Object.values(v.bindings).some(x=>typeof x!=='string'||!/^[0-9a-f-]{36}$/i.test(x)))throw new Error('人馬・所属の対応を確認してください')
 if(!v.states||typeof v.states!=='object'||Array.isArray(v.states)||Object.values(v.states).some(x=>!['unregistered','registered','unknown'].includes(x)))throw new Error('再開状態を確認できません')
 return {kind:v.kind,version:1,eventId:v.eventId,reference:importReference(v.reference),source,bindings:{...v.bindings},states:{...v.states}}
}
export function importCheckpointDifferences(saved:ImportCheckpoint,current:ImportCheckpoint){
 const differences:string[]=[]
 for(const key of ['roster','entries','accounts'] as const)if(saved.source[key]!==current.source[key])differences.push(`${{roster:'名簿原本',entries:'出番原本',accounts:'請求・入金原本'}[key]}が保存済み資料と異なります`)
 if(JSON.stringify(Object.entries(saved.bindings).sort())!==JSON.stringify(Object.entries(current.bindings).sort()))differences.push('人馬・所属の対応が保存済み資料と異なります')
 return differences
}
export async function reviewImportRegistration(checkpoint:ImportCheckpoint,snapshot:ImportSnapshot){
 assertWinterEvent(checkpoint.eventId);assertWinterEvent(snapshot.data.eventId)
 const report=reviewWinterImport(checkpoint.source),issues=report.issues.filter(x=>x.severity==='error').map(x=>`${x.section} ${x.row}行: ${x.message}`)
 if(!report.entriesReady||!report.accountsReady)issues.push('名簿・出番・全団体の原本総額と確認済み入金額を確認してください')
 const {data,initial}=snapshot
 for(const row of [...data.organizations,...data.riders,...data.horses,...data.competitions,...data.entries,...initial])assertWinterEvent(row.event_id)
 const ids=new Set<string>()
 for(const p of report.people){
  const id=checkpoint.bindings[importBindingKey(p.kind,p.id)]
  const actual=(p.kind==='団体'?data.organizations:p.kind==='選手'?data.riders:data.horses).find(x=>x.id===id)
  const label=`${p.kind} ${p.id} ${p.name}`
  if(!actual){issues.push(`${label}: 既存のWinter参加名簿との対応が未選択です`);continue}
  const identity=JSON.stringify([p.kind,id]);if(ids.has(identity))issues.push(`${label}: 同じ登録を複数の原本番号に対応付けています`);ids.add(identity)
  if(p.name!==actual.name)issues.push(`${label}: 名前の差分 原本「${p.name}」／登録「${actual.name}」`)
  if(p.kind!=='団体'){
   if(!('organization_id' in actual)||actual.organization_id!==checkpoint.bindings[importBindingKey('団体',p.org)])issues.push(`${label}: 所属の差分 原本団体 ${p.org}／登録所属 ${'organization_id' in actual?actual.organization_id:'不明'}`)
   const jef='jef_member_no' in actual?actual.jef_member_no:'jef_registration_no' in actual?actual.jef_registration_no:null
   if(p.jef!==(jef??''))issues.push(`${label}: 日馬連番号の差分 原本「${p.jef}」／登録「${jef??''}」`)
  }
 }
 const rows:ImportRegistrationRow[]=[];const pairs=new Set<string>()
 for(const [index,e] of report.entries.entries()){
  const id=await importEntryId(checkpoint.reference,index)
  const rider=data.riders.find(x=>x.id===checkpoint.bindings[importBindingKey('選手',e.rider)])
  const horse=data.horses.find(x=>x.id===checkpoint.bindings[importBindingKey('馬',e.horse)])
  const organization=data.organizations.find(x=>x.id===horse?.organization_id)
  const competition=data.competitions.find(x=>x.competition_no===e.competition)
  if(!rider||!horse||!organization||!competition){issues.push(`出番 ${index+2}行: 対応する競技・人馬・所属がありません`);continue}
  const person=report.people.find(p=>p.kind==='選手'&&p.id===e.rider)!
  const member=['5','25'].includes(e.competition)?person.sportsMember:['8','32'].includes(e.competition)?person.instructorMember:''
  const input:WinterInitialEntryInput={id,organization,competition,rider,horse,selection:{isOp:e.op,membership:member==='会員'?'member':member==='非会員'?'nonmember':undefined,instructorConfirmed:person.qualified}}
  const differences:string[]=[];let fee=0
  try{fee=reviewWinterInitialEntry(input).entryFee;if(fee!==e.price)differences.push(`料金差分 原本区分からの計算 ${e.price}円／現在の登録料金 ${fee}円`)}catch(error){differences.push(error instanceof Error?error.message:'料金を確認してください')}
  const pair=JSON.stringify([competition.id,rider.id,horse.id]);if(pairs.has(pair))differences.push('同一競技・人馬の重複。既存の事前登録は2回目のOP登録に対応していません');pairs.add(pair)
  const ledger=initial.filter(x=>x.id===id||(x.inputs.competitionId===competition.id&&x.inputs.riderId===rider.id&&x.inputs.horseId===horse.id))
  let registeredId:string|undefined
  if(ledger.length>1)differences.push('同じ登録番号または人馬・競技の履歴が複数あります。既存履歴を確認してください')
  for(const saved of ledger){
   const expected={organizationId:organization.id,competitionId:competition.id,riderId:rider.id,horseId:horse.id,membership:input.selection.membership??null,isOp:!!input.selection.isOp,instructorConfirmed:!!input.selection.instructorConfirmed,entryFee:fee}
   const labels={organizationId:'馬の所属',competitionId:'競技',riderId:'選手',horseId:'馬',membership:'会員区分',isOp:'OP区分',instructorConfirmed:'指導者資格確認',entryFee:'競技料金'}
   for(const key of Object.keys(expected) as (keyof typeof expected)[])if(saved.inputs[key]!==expected[key])differences.push(`登録済み ${saved.id}: ${labels[key]} 原本「${expected[key]}」／保存「${saved.inputs[key]}」`)
   if((saved.inputs.billingOrganizationId??saved.inputs.organizationId)!==rider.organization_id)differences.push('保存済み請求所属と現在の選手所属が異なります')
   if(saved.entry_fee!==fee)differences.push(`保存料金 ${saved.entry_fee}円／確認料金 ${fee}円`)
   const current=data.entries.find(x=>x.entry_id===saved.id)
   if(!current||current.competition_id!==competition.id||current.rider_id!==rider.id||current.horse_id!==horse.id||!!current.is_op!==e.op||['wd','withdrawn'].includes(current.status.toLowerCase()))differences.push(`登録済み ${saved.id}: 現在の出番は変更・棄権済み、または確認不能です。再登録せず既存の変更・棄権履歴を確認してください`)
   registeredId=saved.id
  }
  if(!ledger.length&&data.entries.some(x=>x.entry_id===id||(x.competition_id===competition.id&&x.rider_id===rider.id&&x.horse_id===horse.id)))differences.push('既存の出番がありますが、事前登録の料金履歴との一致を確認できません')
  rows.push({id,index,input,fee,registeredId,differences,state:registeredId&&!differences.length?'registered':checkpoint.states[id]==='unknown'||checkpoint.states[id]==='registered'?'unknown':'unregistered'})
 }
 return {rows,issues,ready:!issues.length&&rows.length===report.entries.length&&!rows.some(x=>x.differences.length),report}
}
/** Persist unknown BEFORE each POST. Never trust a downloaded/local "registered" flag. */
export async function runImportRegistration(checkpoint:ImportCheckpoint,deps:{load:()=>Promise<ImportSnapshot>;save:(input:WinterInitialEntryInput)=>Promise<string>;persist:(value:ImportCheckpoint)=>void;stop:()=>boolean}){
 const work:ImportCheckpoint={...checkpoint,states:{...checkpoint.states}}
 let plan=await reviewImportRegistration(work,await deps.load())
 if(!plan.ready)throw new Error([...plan.issues,...plan.rows.flatMap(x=>x.differences)].join('\n'))
 for(const original of plan.rows){
  if(deps.stop())break
  plan=await reviewImportRegistration(work,await deps.load())
  if(!plan.ready)throw new Error('確認後に名簿・料金・出番が変わりました。照合し直してください')
  const row=plan.rows.find(x=>x.id===original.id)!
  if(row.state==='registered'){work.states[row.id]='registered';deps.persist({...work,states:{...work.states}});continue}
  work.states[row.id]='unknown';deps.persist({...work,states:{...work.states}})
  await deps.save(row.input)
  const after=await reviewImportRegistration(work,await deps.load())
  if(after.rows.find(x=>x.id===row.id)?.state!=='registered')throw new Error('登録後の読戻し結果が一致しません。同じ再開資料で再確認してください')
  work.states[row.id]='registered';deps.persist({...work,states:{...work.states}})
 }
 return work
}
