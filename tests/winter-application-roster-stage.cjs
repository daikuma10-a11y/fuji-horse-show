// Synthetic roster-first workflow; no network, real names, or database writes.
require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {setup,uuid}=require('./winter-application-registration-fixture.cjs')
const {prepareApplicationRoster,projectPreparedRoster,retainRosterPreparation,applicationRosterChanges}=require('../lib/winter-application-roster-stage.ts')
const {parseApplicationDraft,serializeApplicationDraft}=require('../lib/winter-application-draft.ts')
const {createApplicationRegistration,reviewApplicationRegistration,runApplicationRegistration,parseApplicationRegistration}=require('../lib/winter-application-registration.ts')
global.fetch=()=>{throw Error('real network forbidden')}
function selected({cosmetic=false,newClub=false}={}){
 const env=setup(),d=env.work.review
 const rider=env.addPerson({kind:'rider',name:cosmetic?'合成 選手':'合成誤記選手',reading:cosmetic?'ゴウセイセンシュ':'ごうせいせんしゅ',jefNumber:'',clubName:newClub?'以前の合成クラブ':d.edited.club})
 const horse=env.addPerson({kind:'horse',name:'合成馬',reading:cosmetic?'ゴウセイウマ':'',jefNumber:'',clubName:newClub?'以前の合成クラブ':d.edited.club})
 d.choices={r1:rider,h1:horse};return {env,d,rider,horse}
}
async function main(){
 let {env,d,rider}=selected({cosmetic:true})
 const before=JSON.stringify(env.snapshot),original=JSON.stringify(d.original)
 let prepared=prepareApplicationRoster(d,env.snapshot,uuid)
 assert.equal(prepared.edited.people[0].name,'合成 選手');assert.equal(prepared.edited.people[0].reading,'ゴウセイセンシュ');assert.deepEqual(prepared.rosterPreparation.corrections,{})
 assert.equal(JSON.stringify(env.snapshot),before);assert.equal(JSON.stringify(prepared.original),original)
 assert.deepEqual(parseApplicationDraft(serializeApplicationDraft(prepared)),prepared)
 assert(retainRosterPreparation({...prepared,paid:'1',edited:{...prepared.edited,entries:prepared.edited.entries.map(e=>({...e,op:true}))}}).rosterPreparation)
 assert(!retainRosterPreparation({...prepared,edited:{...prepared.edited,people:prepared.edited.people.map(p=>({...p,reading:'変更'}))}}).rosterPreparation)
 assert(!retainRosterPreparation({...prepared,edited:{...prepared.edited,club:'別団体'}}).rosterPreparation)
 const tampered=structuredClone(prepared);tampered.edited.people[0].jef='999';assert.throws(()=>parseApplicationDraft(JSON.stringify(tampered)),/仮確定/)

 ;({env,d,rider}=selected())
 env.publish(env.snapshot.roster.clubs[0].id,[rider],[])
 const oldBindings=JSON.stringify(env.snapshot.bindings),oldSource=JSON.stringify(d.original)
 prepared=prepareApplicationRoster(d,env.snapshot,uuid)
 assert.equal(Object.keys(prepared.rosterPreparation.corrections).length,2)
 const projected=projectPreparedRoster(prepared,env.snapshot)
 assert.equal(projected.pending.length,2);assert.deepEqual(projected.issues,[])
 assert.equal(env.snapshot.roster.entities[0].name,'合成誤記選手');assert.equal(projected.snapshot.roster.entities[0].name,'合成選手')
 assert.equal(JSON.stringify(projected.snapshot.bindings),oldBindings)
 let work=createApplicationRegistration(prepared),plan=await reviewApplicationRegistration(work,env.snapshot)
 assert.equal(plan.ready,true,plan.issues.join());assert.equal(plan.pendingRoster.length,2)
 const order=[],correct=env.deps.correctPerson,entry=env.deps.saveEntry
 env.deps.correctPerson=async input=>{assert.equal(env.stored.review.rosterPreparation.corrections[input.kind==='rider'?'r1':'h1'].requestId,input.requestId);order.push('roster');return correct(input)}
 env.deps.saveEntry=async input=>{assert.equal(env.correctionPosts,2);order.push('entry');return entry(input)}
 work=await runApplicationRegistration(work,env.deps)
 assert.deepEqual(order,['roster','roster','entry']);assert.deepEqual(env.posts,{person:0,participants:1,entry:1});assert.equal(env.correctionPosts,2);assert.equal(JSON.stringify(work.review.original),oldSource)
 assert.equal(env.snapshot.bindings[0].rider_id,JSON.parse(oldBindings)[0].rider_id)
 work=await runApplicationRegistration(parseApplicationRegistration(JSON.stringify(work)),env.deps)
 assert.equal(env.correctionPosts,2);assert.equal(env.posts.entry,1);assert.equal((await reviewApplicationRegistration(work,env.snapshot)).pendingRoster.length,0)

 // A new destination exists only in the preview until the authorized correction saves it.
 ;({env,d}=selected({newClub:true}));prepared=prepareApplicationRoster(d,env.snapshot,uuid)
 const virtual=projectPreparedRoster(prepared,env.snapshot).snapshot.roster.clubs.find(c=>c.name===d.edited.club).id
 work=await runApplicationRegistration(createApplicationRegistration(prepared),env.deps)
 const real=env.snapshot.roster.clubs.find(c=>c.name===d.edited.club).id
 assert.notEqual(real,virtual);assert.equal(work.participants.clubId,real);assert(env.snapshot.bindings.every(b=>b.club_id===real));assert.equal(env.snapshot.data.entries.length,1)

 // Unknown save reply is resolved by exact readback; stop and reload do not resend successful corrections.
 ;({env,d}=selected());prepared=prepareApplicationRoster(d,env.snapshot,uuid)
 env.deps.correctPerson=async input=>{env.correctPerson(input);env.stopped=true;throw Error('reply lost')}
 work=await runApplicationRegistration(createApplicationRegistration(prepared),env.deps)
 assert.equal(env.correctionPosts,1);assert.equal(env.posts.entry,0)
 env.stopped=false;env.deps.correctPerson=async input=>env.correctPerson(input)
 work=await runApplicationRegistration(parseApplicationRegistration(JSON.stringify(work)),env.deps)
 assert.equal(env.correctionPosts,2);assert.equal(env.posts.entry,1)

 for(const kind of ['concurrent','rejected','storage','readback']){
  ;({env,d}=selected());prepared=prepareApplicationRoster(d,env.snapshot,uuid);work=createApplicationRegistration(prepared)
  if(kind==='concurrent')env.snapshot.roster.entities[0].name='他の担当の変更'
  if(kind==='rejected')env.deps.correctPerson=async()=>{throw Error('admin denied')}
  if(kind==='storage')env.deps.persist=()=>{throw Error('storage full')}
  if(kind==='readback')env.deps.correctPerson=async()=>uuid()
  await assert.rejects(()=>runApplicationRegistration(work,env.deps));assert.deepEqual(env.posts,{person:0,participants:0,entry:0},kind);assert.equal(env.correctionPosts,0,kind)
 }
 // Duplicate identifiers and unselected/ambiguous identities never merge automatically.
 ;({env,d}=selected());d.choices.r1='new';assert.throws(()=>prepareApplicationRoster(d,env.snapshot,uuid),/既存の候補/)
 d.choices.r1=env.snapshot.roster.entities[0].id;d.edited.people[0].jef='123'
 env.addPerson({kind:'rider',name:'別人',reading:'ベツジン',jefNumber:'123',clubName:d.edited.club});assert.throws(()=>prepareApplicationRoster(d,env.snapshot,uuid),/別の既存候補/)
 ;({env,d}=selected({cosmetic:true}));d.edited.entries[0].rider='';d.edited.entries[0].horse=''
 prepared=prepareApplicationRoster(d,env.snapshot,uuid);assert.equal(prepared.edited.entries[0].rider,'r1');assert.equal(prepared.edited.entries[0].horse,'h1')
 const manual=structuredClone(d);manual.edited.entries[0].rawRider='一致しない人';assert.equal(prepareApplicationRoster(manual,env.snapshot,uuid).edited.entries[0].rider,'')
 // Club movement remains explicit and preserves old event participants and billing organization.
 ;({env,d,rider}=selected({cosmetic:true}));const oldClub=env.snapshot.roster.clubs[0];env.publish(oldClub.id,[rider],[])
 d.rosterEdits={r1:{entityId:rider,source:'manual',clubId:'',clubName:'移動先の合成クラブ',endClubIds:[oldClub.id]}}
 assert(applicationRosterChanges(d,env.snapshot).some(r=>r.changes.some(c=>c.label==='所属を終了')))
 prepared=prepareApplicationRoster(d,env.snapshot,uuid);work=await runApplicationRegistration(createApplicationRegistration(prepared),env.deps)
 assert(env.snapshot.roster.affiliations.find(a=>a.entity_id===rider&&a.club_id===oldClub.id).ended_at)
 assert.equal(env.snapshot.roster.participants.find(p=>p.entity_id===rider).club_id,oldClub.id)
 assert.equal(env.snapshot.data.entries[0].organization_id,env.snapshot.data.riders[0].organization_id)
 console.log('PASS: provisional-only roster, cosmetic spelling, staged corrections before entries, stable IDs, original preservation, alias binding, affiliation transfer, roundtrip/invalidation, fresh conflict/auth/storage/readback guards, lost reply and stop/resume without duplicate writes')
}
main().catch(e=>{console.error(e);process.exitCode=1})
