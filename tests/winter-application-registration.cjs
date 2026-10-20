// Entirely synthetic in-memory data. No original workbook or database calls.
require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {WINTER_EVENT_ID,winterCompetition}=require('../lib/winter-event.ts')
const {createApplicationRegistration,readApplicationRegistration,parseApplicationRegistration,serializeApplicationRegistration,persistApplicationRegistration,applicationRegistrationKey,reviewApplicationRegistration,resolveUnknownApplicationPerson,runApplicationRegistration}=require('../lib/winter-application-registration.ts')
const copy=x=>structuredClone(x)
const {setup,uuid}=require('./winter-application-registration-fixture.cjs')
global.fetch=()=>{throw Error('Unexpected network call in synthetic test')}

function useExisting(env){
 const draft=copy(env.work.review)
 for(const p of draft.edited.people){const id=env.addPerson({kind:p.kind,name:p.name,reading:p.reading,jefNumber:p.jef,clubName:draft.edited.club});draft.choices[p.key]=id}
 env.work=createApplicationRegistration(draft)
}
async function blocked(env,pattern){
 const before=copy(env.snapshot)
 await assert.rejects(runApplicationRegistration(env.work,env.deps),pattern)
 assert.deepEqual(env.posts,{person:0,participants:0,entry:0});assert.deepEqual(env.snapshot,before)
}
async function main(){
 let e=setup();assert.equal((await reviewApplicationRegistration(e.work,e.snapshot)).ready,true)
 assert.deepEqual(e.posts,{person:0,participants:0,entry:0})
 let result=await runApplicationRegistration(e.work,e.deps)
 assert.deepEqual(e.posts,{person:2,participants:1,entry:1});assert.deepEqual(result,e.stored)
 assert.equal(result.review.original.amounts.total,'19000');assert.equal(result.review.paid,'0');assert.equal(e.snapshot.initial[0].entry_fee,5000)
 assert.equal((await reviewApplicationRegistration(result,e.snapshot)).entries.rows[0].state,'registered')
 await runApplicationRegistration(parseApplicationRegistration(e.raw),e.deps)
 assert.deepEqual(e.posts,{person:2,participants:1,entry:1})
 await assert.rejects(runApplicationRegistration(e.work,e.deps),/候補/)
 assert.deepEqual(e.posts,{person:2,participants:1,entry:1})
 // A second explicit mapping/reference may discover the same stored pair, never rebill it.
 const remap=copy(e.work.review);for(const p of remap.edited.people)remap.choices[p.key]=result.people[p.key].entityId
 remap.reference='SYNTHETIC-XLSX-SECOND-REFERENCE';e.raw=null
 await runApplicationRegistration(createApplicationRegistration(remap),e.deps)
 assert.deepEqual(e.posts,{person:2,participants:1,entry:1})

 // Lost response after a new person was created: no blind retry, explicit matching required.
 e=setup();let savedId
 await assert.rejects(runApplicationRegistration(e.work,{...e.deps,savePerson:async input=>{savedId=await e.deps.savePerson(input);throw Error('lost person response')}}),/lost person response/)
 assert.deepEqual(e.stored.people.r1,{state:'unknown'});assert.equal(e.posts.person,1)
 await assert.rejects(runApplicationRegistration(e.stored,e.deps),/結果が不明/);assert.equal(e.posts.person,1)
 const wrong=e.addPerson({kind:'rider',name:'別の合成選手',reading:'べつ',jefNumber:'',clubName:e.work.review.edited.club})
 await assert.rejects(resolveUnknownApplicationPerson(e.stored,'r1',wrong,e.snapshot),/差分/)
 result=await resolveUnknownApplicationPerson(e.stored,'r1',savedId,e.snapshot);e.persist(result)
 await runApplicationRegistration(result,e.deps);assert.deepEqual(e.posts,{person:2,participants:1,entry:1})

 // ID returned but readback failed: resume recognizes the saved ID without recreating it.
 e=setup();let loads=0
 await assert.rejects(runApplicationRegistration(e.work,{...e.deps,load:async()=>{if(++loads===3)throw Error('readback unavailable');return copy(e.snapshot)}}),/readback unavailable/)
 assert.equal(e.stored.people.r1.state,'unknown');assert(e.stored.people.r1.entityId)
 await runApplicationRegistration(e.stored,e.deps);assert.deepEqual(e.posts,{person:2,participants:1,entry:1})

 // Stop at a record boundary; resume from the retained result.
 e=setup()
 await runApplicationRegistration(e.work,{...e.deps,savePerson:async input=>{const id=await e.deps.savePerson(input);e.stopped=true;return id}})
 assert.deepEqual(e.posts,{person:1,participants:0,entry:0});assert.equal(e.stored.people.h1.state,'unregistered')
 e.stopped=false;await runApplicationRegistration(e.stored,e.deps);assert.deepEqual(e.posts,{person:2,participants:1,entry:1})

 // Two entry rows stop/resume through the reused entry runner, without repeating the first charge.
 e=setup();const secondCompetition=winterCompetition('25'),extraEntry={...copy(e.work.review.original.entries[0]),key:'障害!V13:0',competition:'25',origin:{sheet:'障害',cell:'V13',value:'合成選手'}}
 for(const app of [e.work.review.original,e.work.review.edited]){app.entries.push(copy(extraEntry));app.amounts.jump='10000';app.amounts.total='24000';app.amountOrigins.jump.value='10000';app.amountOrigins.total.value='24000'}
 e.snapshot.data.competitions.push({id:uuid(),event_id:WINTER_EVENT_ID,competition_no:'25',competition_date:secondCompetition.date,name:secondCompetition.name,official:secondCompetition.official,fee:secondCompetition.fee,member_fee:secondCompetition.memberFee,nonmember_fee:secondCompetition.nonmemberFee,op_fee:secondCompetition.opFee})
 await runApplicationRegistration(e.work,{...e.deps,saveEntry:async input=>{const id=await e.deps.saveEntry(input);e.stopped=true;return id}})
 assert.equal(e.posts.entry,1);assert.equal(Object.values(e.stored.entries.states).filter(s=>s==='registered').length,1)
 e.stopped=false;await runApplicationRegistration(e.stored,e.deps);assert.equal(e.posts.entry,2);assert.equal(e.snapshot.initial.reduce((sum,x)=>sum+x.entry_fee,0),10000)

 // Participant / entry uncertain commits are reconciled by authoritative reads, not local flags.
 for(const step of ['saveParticipants','saveEntry']){
  e=setup();await assert.rejects(runApplicationRegistration(e.work,{...e.deps,[step]:async(...args)=>{await e.deps[step](...args);throw Error('lost save response')}}),/lost save response/)
  assert.equal(step==='saveParticipants'?e.stored.participants.state:Object.values(e.stored.entries.states)[0],'unknown')
  await runApplicationRegistration(e.stored,e.deps);assert.deepEqual(e.posts,{person:2,participants:1,entry:1})
 }

 // Existing unrelated participants and entry/fee history survive a union publication.
 e=setup();const extra=e.addPerson({kind:'rider',name:'既存の合成選手',reading:'きぞん',jefNumber:'',clubName:e.work.review.edited.club})
 const extraHorse=e.addPerson({kind:'horse',name:'既存の合成馬',reading:'きぞんうま',jefNumber:'',clubName:e.work.review.edited.club})
 const club=e.snapshot.roster.clubs[0].id;e.publish(club,[extra,extraHorse],[])
 e.append({id:uuid(),organization:e.snapshot.data.organizations[0],rider:e.snapshot.data.riders[0],horse:e.snapshot.data.horses[0],competition:e.snapshot.data.competitions[0],selection:{isOp:false,membership:'member',instructorConfirmed:false}})
 const retained={participant:copy(e.snapshot.roster.participants[0]),binding:copy(e.snapshot.bindings[0]),rider:copy(e.snapshot.data.riders[0]),entry:copy(e.snapshot.data.entries[0]),charge:copy(e.snapshot.initial[0])}
 await runApplicationRegistration(e.work,e.deps)
 assert.deepEqual(e.snapshot.roster.participants.find(p=>p.entity_id===extra),retained.participant)
 assert.deepEqual(e.snapshot.bindings.find(p=>p.entity_id===extra),retained.binding)
 assert.deepEqual(e.snapshot.data.riders.find(p=>p.id===retained.rider.id),retained.rider)
 assert.deepEqual(e.snapshot.data.entries.find(p=>p.entry_id===retained.entry.entry_id),retained.entry)
 assert.deepEqual(e.snapshot.initial.find(p=>p.id===retained.charge.id),retained.charge)
 assert.equal(e.snapshot.initial.length,2)

 // Existing roster/participant differences must not be silently overwritten.
 e=setup();useExisting(e);e.snapshot.roster.affiliations[0].ended_at='2026-10-20T00:00:00Z';await blocked(e,/所属/)
 e=setup();useExisting(e);e.snapshot.roster.entities[0].name='既存側の訂正';await blocked(e,/差分/)
 e=setup();useExisting(e);const cid=e.snapshot.roster.clubs[0].id;e.publish(cid,e.snapshot.roster.entities.map(x=>x.id),[]);e.snapshot.data.riders[0].name='Winter側の訂正';await blocked(e,/差分/)
 // A master correction differs from the participant snapshot: block before other new people are created.
 e=setup();const rid=e.addPerson({kind:'rider',name:'旧名の合成選手',reading:'ごうせいせんしゅ',jefNumber:'',clubName:e.work.review.edited.club})
 e.publish(e.snapshot.roster.clubs[0].id,[rid],[]);e.snapshot.roster.entities[0].name=e.work.review.edited.people[0].name
 e.work.review.choices.r1=rid;e.work=createApplicationRegistration(e.work.review);await blocked(e,/参加名簿.*差分/)
 e=setup();e.snapshot.data.competitions[0].member_fee++;await blocked(e,/料金/)
 e=setup();e.work.review.edited.people[0].sportsMember='';await blocked(e,/確認|区分/)
 e=setup();e.work.review.accountChecked=false;await blocked(e,/確認/)
 e=setup();e.work.review.edited.amounts.total='1';await blocked(e,/合計|料金|確認/)
 e=setup();e.work.review.edited.people[0].jef='INVALID';await blocked(e,/日馬連/)
 e=setup();e.snapshot.data.competitions[0].event_id='Autumn';await blocked(e,/Winter/)
 e=setup();e.snapshot.roster.participants.push({event_id:'Autumn'});await blocked(e,/Winter/)
 e=setup();e.deps.load=async()=>{throw Error('admin denied')};await blocked(e,/admin denied/)
 e=setup();e.deps.persist=()=>{throw Error('storage full')};await blocked(e,/storage full/)

 // Codec binds immutable source/corrections and separate accounting to the saved result.
 e=setup();result=await runApplicationRegistration(e.work,e.deps)
 assert.deepEqual(parseApplicationRegistration(serializeApplicationRegistration(result)),result)
 const withSecret={...result,accessToken:'synthetic-secret'};assert(!serializeApplicationRegistration(withSecret).includes('synthetic-secret'))
 assert.match(applicationRegistrationKey(result.review.reference),new RegExp(WINTER_EVENT_ID))
 assert.throws(()=>readApplicationRegistration({...result,eventId:'Autumn'}),/Winter/)
 assert.throws(()=>readApplicationRegistration({...result,kind:'other'}),/再開/)
 const sourceChanged=copy(result);sourceChanged.entries.source.accounts+='\nCHANGED';assert.throws(()=>readApplicationRegistration(sourceChanged),/原本/)
 const changed=copy(result);changed.review.paid='500';changed.entries=null
 assert.throws(()=>persistApplicationRegistration(e.storage,changed,e.raw),/確定時|原本|記録/)
 const rollback=copy(result);rollback.people.r1.state='unregistered';assert.throws(()=>persistApplicationRegistration(e.storage,rollback,e.raw),/巻戻し/)
 assert.throws(()=>persistApplicationRegistration(e.storage,result,null),/別の/)
 assert.throws(()=>persistApplicationRegistration({getItem:()=>null,setItem(){}},e.work,null),/保存できません/)
 console.log('PASS: Excel registration orchestration, explicit identity binding, preserved original/paid amounts, normal/reimport, lost responses in all save stages, explicit unknown-person reconciliation, stop/resume, union participant preservation, fee/category/affiliation/event/auth/storage guards, frozen checkpoints')
}
main().catch(error=>{console.error(error);process.exitCode=1})
