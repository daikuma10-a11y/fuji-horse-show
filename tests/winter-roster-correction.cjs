require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {setup,uuid}=require('./winter-application-registration-fixture.cjs')
const {rosterCorrectionExpectation,rosterCorrectionInput,rosterCorrectionMatches,saveWinterRosterCorrection}=require('../lib/winter-roster-correction.ts')
const reception=require('../lib/winter-reception.ts')
async function main(){
 const env=setup(),s=env.snapshot,p=env.work.review.edited.people[1]
 const id=env.addPerson({kind:'horse',name:'合成の旧馬名',reading:'キュウメイ',jefNumber:'',clubName:'合成旧所属'})
 env.publish(s.roster.clubs[0].id,[id],[])
 const input=rosterCorrectionInput({...p,name:'合成の正しい馬名',reading:'ゴウセイウマ',jef:'12345'},id,'合成新所属',s,uuid())
 assert.equal(rosterCorrectionMatches(input,s),false)
 const before=structuredClone(s),bindings=JSON.stringify(s.bindings),entries=JSON.stringify(s.data.entries)
 env.correctPerson(input);assert.equal(rosterCorrectionMatches(input,s),true)
 assert.equal(JSON.stringify(s.bindings),bindings);assert.equal(JSON.stringify(s.data.entries),entries)
 assert.equal(s.roster.entities.length,1);assert.equal(s.roster.affiliations.length,2)
 env.correctPerson(input);assert.equal(env.correctionPosts,1,'same request is idempotent')
 for(const modify of [x=>x.roster.participants.pop(),x=>x.data.horses[0].name='not saved',x=>x.data.horses[0].jef_registration_no=null,x=>x.roster.affiliations.shift(),x=>x.data.horses[0].is_participant=false,x=>x.data.horses[0].organization_id=uuid(),x=>x.bindings[0].horse_id=uuid(),x=>x.data.eventId=uuid()]){
  const altered=structuredClone(s);modify(altered);assert.equal(rosterCorrectionMatches(input,altered),false)
 }
 assert.throws(()=>rosterCorrectionInput(p,'new','合成団体',s,uuid()),/既存人馬/)
 assert.throws(()=>rosterCorrectionInput({...p,kind:'rider'},id,'合成団体',s,uuid()),/既存人馬/)
 assert.throws(()=>rosterCorrectionInput({...p,jef:'abc'},id,'合成団体',s,uuid()),/番号/)
 assert.throws(()=>rosterCorrectionInput({...p,name:''},id,'合成団体',s,uuid()),/名前/)
 assert.throws(()=>rosterCorrectionExpectation(id,{...s,data:{...s.data,eventId:uuid()}}),/Winter/)
 const duplicate=env.addPerson({kind:'horse',name:'別の合成馬',reading:'ベツノウマ',jefNumber:'999',clubName:'合成所属'})
 assert.throws(()=>rosterCorrectionInput({...p,jef:'999'},id,'合成団体',s,uuid()),/別の既存候補/)
 s.roster.entities.find(e=>e.id===duplicate).archived_at='2026-10-24T00:00:00Z'
 assert.throws(()=>rosterCorrectionInput({...p,jef:'999'},id,'合成団体',s,uuid()),/別の既存候補/)
 let calls=[];reception.winterRpc=async(...args)=>{calls.push(args);return input.entityId}
 assert.equal(await saveWinterRosterCorrection(input,'synthetic-token'),id)
 assert.equal(calls.length,1);assert.equal(calls[0][0],'correct_fhs_winter_roster_identity');assert.deepEqual(calls[0][1],{p_input:input});assert.equal(calls[0][2],'synthetic-token');assert(calls[0][3] instanceof AbortSignal)
 reception.winterRpc=async()=>uuid();await assert.rejects(()=>saveWinterRosterCorrection(input,'synthetic-token'),/保存結果/)
 assert.equal(before.data.horses[0].jef_registration_no,null)
 console.log('PASS: exact identity correction, absent-to-present JEF, affiliation preservation, immutable IDs, read-back mismatches, duplicate/archived-number rejection, scoped RPC and result verification')
}
main().catch(e=>{console.error(e);process.exitCode=1})
