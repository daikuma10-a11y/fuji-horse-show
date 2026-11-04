// Synthetic identities only. Exercise the real preparation/registration flow without a database.
require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {setup,uuid}=require('./winter-application-registration-fixture.cjs')
const {prepareApplicationRoster}=require('../lib/winter-application-roster-stage.ts')
const {parseApplicationDraft,serializeApplicationDraft}=require('../lib/winter-application-draft.ts')
const {createApplicationRegistration,reviewApplicationRegistration,runApplicationRegistration,parseApplicationRegistration}=require('../lib/winter-application-registration.ts')
global.fetch=()=>{throw Error('Real network forbidden')}

async function main(){
 for(const mode of ['same-name','same-reading','different-number','archived','existing-number-only']){
  const env=setup(),draft=env.work.review,oldIds=[]
  for(const p of draft.edited.people){
   if(mode==='different-number'){p.jef=p.kind==='rider'?'900101':'900102';p.checked=true}
   const id=env.addPerson({kind:p.kind,name:mode==='same-reading'?'別の'+p.name:p.name,reading:p.reading,jefNumber:['different-number','existing-number-only'].includes(mode)?(p.kind==='rider'?'900201':'900202'):'',clubName:draft.edited.club})
   if(mode==='archived')env.snapshot.roster.entities.find(e=>e.id===id).archived_at='2026-10-01T00:00:00Z'
   oldIds.push(id)
  }
  const before=structuredClone(env.snapshot.roster.entities),original=JSON.stringify(draft.original)
  // Saved review JSON remains compatible and preserves the explicit new choice.
  const restored=parseApplicationDraft(serializeApplicationDraft(draft))
  const prepared=prepareApplicationRoster(restored,env.snapshot,uuid)
  assert.deepEqual(prepared.rosterPreparation.corrections,{})
  const work=createApplicationRegistration(prepared),plan=await reviewApplicationRegistration(work,env.snapshot)
  assert.equal(plan.ready,true,mode+': '+plan.issues.join('\n'))
  const result=await runApplicationRegistration(work,env.deps)
  assert.deepEqual(env.posts,{person:2,participants:1,entry:1},mode)
  assert.equal(env.snapshot.roster.entities.length,4)
  assert.deepEqual(env.snapshot.roster.entities.filter(e=>oldIds.includes(e.id)),before)
  for(const p of draft.edited.people){
   assert(!oldIds.includes(result.people[p.key].entityId))
   const entity=env.snapshot.roster.entities.find(e=>e.id===result.people[p.key].entityId)
   assert.equal(entity.name,p.name);assert.equal(entity.jef_number,p.jef||null)
  }
  assert.equal(env.correctionPosts,0);assert.equal(JSON.stringify(result.review.original),original)
  assert.equal(env.snapshot.initial[0].entry_fee,5000)
  await runApplicationRegistration(parseApplicationRegistration(env.raw),env.deps)
  assert.deepEqual(env.posts,{person:2,participants:1,entry:1},mode+' retry')
 }
 // Multiple unnumbered namesakes can also arrive in one file, bound to separate source keys.
 {
  const env=setup(),draft=env.work.review
  for(const app of [draft.original,draft.edited]){
   app.people.push(...app.people.map(p=>({...structuredClone(p),key:p.kind==='rider'?'r2':'h2'})))
   app.entries.push({...structuredClone(app.entries[0]),key:'障害!K13:0',rider:'r2',horse:'h2',origin:{sheet:'障害',cell:'K13',value:'合成選手'}})
   Object.assign(app.amounts,{horse:'28000',jump:'10000',total:'38000'})
   for(const key of ['horse','jump','total'])app.amountOrigins[key].value=app.amounts[key]
  }
  Object.assign(draft.choices,{r2:'new',h2:'new'})
  env.deps.savePerson=async input=>{
   assert(Object.values(env.stored.people).some(p=>p.state==='unknown'&&!p.entityId))
   env.posts.person++;return env.addPerson(input)
  }
  const prepared=prepareApplicationRoster(draft,env.snapshot,uuid),work=createApplicationRegistration(prepared)
  const plan=await reviewApplicationRegistration(work,env.snapshot);assert.equal(plan.ready,true,plan.issues.join('\n'))
  const result=await runApplicationRegistration(work,env.deps)
  assert.equal(new Set(Object.values(result.people).map(p=>p.entityId)).size,4)
  assert.equal(new Set(env.snapshot.data.entries.map(e=>e.rider_id)).size,2)
  assert.equal(new Set(env.snapshot.data.entries.map(e=>e.horse_id)).size,2)
  assert.deepEqual(env.posts,{person:4,participants:1,entry:2})
  await runApplicationRegistration(parseApplicationRegistration(env.raw),env.deps)
  assert.deepEqual(env.posts,{person:4,participants:1,entry:2})
  const conflicting=structuredClone(draft)
  for(const p of conflicting.edited.people.filter(p=>p.kind==='rider')){p.jef='900500';p.checked=true}
  assert.throws(()=>prepareApplicationRoster(conflicting,env.snapshot,uuid),/日馬連番号が重複/)
 }
 // Same nonempty JEF number remains blocked for both active and archived identities.
 for(const kind of ['rider','horse'])for(const archived of [false,true]){
  const env=setup(),draft=env.work.review,p=draft.edited.people.find(p=>p.kind===kind)
  p.jef='900300';p.checked=true
  const id=env.addPerson({kind,name:'番号が一致する別名',reading:'ベツメイ',jefNumber:p.jef,clubName:draft.edited.club})
  if(archived)env.snapshot.roster.entities.find(e=>e.id===id).archived_at='2026-10-01T00:00:00Z'
  assert.throws(()=>prepareApplicationRoster(draft,env.snapshot,uuid),/同じ日馬連番号/)
  const plan=await reviewApplicationRegistration(createApplicationRegistration(draft),env.snapshot)
  assert.equal(plan.ready,false);assert(plan.people.find(row=>row.key===p.key).issues.some(s=>s.includes('同じ日馬連番号')))
  await assert.rejects(runApplicationRegistration(createApplicationRegistration(draft),env.deps),/同じ日馬連番号/)
  assert.deepEqual(env.posts,{person:0,participants:0,entry:0})
 }
 // Rider and horse numbering are separate namespaces.
 {
  const env=setup(),p=env.work.review.edited.people[0];p.jef='900400';p.checked=true
  env.addPerson({kind:'horse',name:'別種の番号',reading:'ベツ',jefNumber:p.jef,clubName:env.work.review.edited.club})
  assert(prepareApplicationRoster(env.work.review,env.snapshot,uuid).rosterPreparation)
  assert.equal((await reviewApplicationRegistration(env.work,env.snapshot)).ready,true)
 }
 // An ambiguous save reply must not be retried, even when all names/readings match.
 {
  const env=setup(),p=env.work.review.edited.people[0]
  env.addPerson({kind:p.kind,name:p.name,reading:p.reading,jefNumber:'',clubName:env.work.review.edited.club})
  await assert.rejects(runApplicationRegistration(env.work,{...env.deps,savePerson:async input=>{await env.deps.savePerson(input);throw Error('lost response')}}),/lost response/)
  await assert.rejects(runApplicationRegistration(parseApplicationRegistration(env.raw),env.deps),/結果が不明/)
  assert.equal(env.posts.person,1);assert.equal(env.snapshot.roster.entities.length,2)
 }
 console.log('PASS: same-name/readings and unnumbered/numbered/archived candidates remain distinct; JEF duplicate guard, draft restore, preserved identities/fees, resume and uncertain-write protection')
}
main().catch(e=>{console.error(e);process.exitCode=1})
