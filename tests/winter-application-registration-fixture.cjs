// Shared hand-authored in-memory fixture; no network, original workbook or real participants.
const assert=require('node:assert/strict')
const fixture=require('./winter-application-fixture.cjs')
const {createApplicationDraft}=require('../lib/winter-application-draft.ts')
const {WINTER_EVENT_ID,winterCompetition}=require('../lib/winter-event.ts')
const {reviewWinterInitialEntry}=require('../lib/winter-initial-entry.ts')
const {createApplicationRegistration,parseApplicationRegistration,persistApplicationRegistration}=require('../lib/winter-application-registration.ts')
const copy=x=>structuredClone(x)
let serial=0
const uuid=()=>`00000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`

function setup(){
 const draft=createApplicationDraft(fixture());Object.assign(draft,{paid:'0',accountChecked:true,reference:'SYNTHETIC-XLSX-CHECKPOINT3',choices:{r1:'new',h1:'new'}})
 const work=createApplicationRegistration(draft),c=winterCompetition('5')
 const snapshot={roster:{entities:[],clubs:[],affiliations:[],participants:[]},bindings:[],credentials:[],initial:[],data:{eventId:WINTER_EVENT_ID,organizations:[],riders:[],horses:[],entries:[],timetable:[],competitions:[{id:uuid(),event_id:WINTER_EVENT_ID,competition_no:'5',competition_date:c.date,name:c.name,official:c.official,fee:c.fee,member_fee:c.memberFee,nonmember_fee:c.nonmemberFee,op_fee:c.opFee}]}}
 const env={work,snapshot,stored:null,stopped:false,posts:{person:0,participants:0,entry:0},raw:null}
 env.storage={getItem:()=>env.raw,setItem:(_key,text)=>{env.raw=text}}
 env.persist=value=>{env.raw=persistApplicationRegistration(env.storage,value,env.raw);env.stored=parseApplicationRegistration(env.raw)}
 env.addPerson=input=>{
  let club=snapshot.roster.clubs.find(c=>c.name===input.clubName)
  if(!club){club={id:uuid(),name:input.clubName};snapshot.roster.clubs.push(club)}
  const entity={id:uuid(),kind:input.kind,name:input.name,reading:input.reading,jef_number:input.jefNumber||null,archived_at:null,updated_at:'2026-10-20T00:00:00Z'}
  snapshot.roster.entities.push(entity);snapshot.roster.affiliations.push({id:uuid(),entity_id:entity.id,club_id:club.id,started_at:'2026-10-20T00:00:00Z',ended_at:null})
  return entity.id
 }
 env.publish=(clubId,ids,expected)=>{
  assert.deepEqual([...expected].sort(),snapshot.roster.participants.filter(p=>p.club_id===clubId).map(p=>p.entity_id).sort())
  const club=snapshot.roster.clubs.find(c=>c.id===clubId)
  let org=snapshot.data.organizations.find(o=>o.name===club.name)
  if(!org){org={id:uuid(),event_id:WINTER_EVENT_ID,name:club.name};snapshot.data.organizations.push(org)}
  for(const id of ids){
   const e=snapshot.roster.entities.find(e=>e.id===id)
   let p=snapshot.roster.participants.find(p=>p.club_id===clubId&&p.entity_id===id)
   if(!p){p={event_id:WINTER_EVENT_ID,club_id:clubId,entity_id:id,name_snapshot:e.name,reading_snapshot:e.reading,jef_number_snapshot:e.jef_number,club_name_snapshot:club.name};snapshot.roster.participants.push(p)}
   let b=snapshot.bindings.find(b=>b.entity_id===id&&b.club_id===clubId)
   if(!b){const target=uuid();b={entity_id:id,club_id:clubId,rider_id:e.kind==='rider'?target:null,horse_id:e.kind==='horse'?target:null};snapshot.bindings.push(b)
    const row={id:target,event_id:WINTER_EVENT_ID,name:p.name_snapshot,organization_id:org.id,roster_source:'shared_roster',is_participant:true}
    if(e.kind==='rider')snapshot.data.riders.push({...row,jef_member_no:p.jef_number_snapshot});else snapshot.data.horses.push({...row,jef_registration_no:p.jef_number_snapshot})
   }
  }
 }
 env.append=input=>{
  const fee=reviewWinterInitialEntry(input).entryFee
  assert(!snapshot.initial.some(row=>row.id===input.id),'same stable entry must not be posted twice in these cases')
  snapshot.initial.push({id:input.id,event_id:WINTER_EVENT_ID,entry_fee:fee,inputs:{organizationId:input.organization.id,competitionId:input.competition.id,riderId:input.rider.id,horseId:input.horse.id,membership:input.selection.membership??null,isOp:!!input.selection.isOp,instructorConfirmed:!!input.selection.instructorConfirmed,entryFee:fee}})
  snapshot.data.entries.push({entry_id:input.id,event_id:WINTER_EVENT_ID,competition_id:input.competition.id,competition_no:input.competition.competition_no,rider_id:input.rider.id,horse_id:input.horse.id,is_op:!!input.selection.isOp,status:'active',organization_id:input.rider.organization_id,organization_name:input.organization.name,start_order:snapshot.data.entries.length+1})
 }
 env.credentialPosts=0
 env.deps={saveCredential:async input=>{env.credentialPosts++;assert(env.stored.credentials);const current=snapshot.credentials.find(c=>c.entity_id===input.entityId&&c.club_id===input.clubId);assert.equal(current?.request_id??null,input.expected);snapshot.credentials=snapshot.credentials.filter(c=>c!==current);snapshot.credentials.push({event_id:input.eventId,entity_id:input.entityId,club_id:input.clubId,target_id:input.targetId,kind:input.kind,value:input.value,request_id:input.requestId,source_reference:input.reference,confirmed_at:'2026-10-22T00:00:00Z'});return input.requestId},load:async()=>copy(snapshot),persist:env.persist,stop:()=>env.stopped,
  savePerson:async input=>{assert.equal(env.stored.people[input.kind==='rider'?'r1':'h1'].state,'unknown');assert(!('id' in input));assert(!('replaceAffiliations' in input));env.posts.person++;return env.addPerson(input)},
  saveParticipants:async(clubId,ids,expected)=>{assert.equal(env.stored.participants.state,'unknown');assert(expected.every(id=>ids.includes(id)),'never remove existing participants');env.posts.participants++;env.publish(clubId,ids,expected)},
  saveEntry:async input=>{assert.equal(env.stored.entries.states[input.id],'unknown');env.posts.entry++;env.append(input);return input.id},
 }
 return env
}

module.exports={setup,uuid}
