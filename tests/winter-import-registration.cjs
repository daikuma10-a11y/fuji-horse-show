// Recovered from the actual test source retained in the Work conversation.
require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {IMPORT_SAMPLE,reviewWinterImport}=require('../lib/winter-import-review.ts')
const {WINTER_EVENT_ID,winterCompetition}=require('../lib/winter-event.ts')
const {importBindingKey,importEntryId,readImportCheckpoint,importCheckpointDifferences,reviewImportRegistration,runImportRegistration}=require('../lib/winter-import-registration.ts')
const copy=x=>JSON.parse(JSON.stringify(x));let serial=0
const uuid=()=>`00000000-0000-4000-8000-${String(++serial).padStart(12,'0')}`
function fixture(){
 const source=copy(IMPORT_SAMPLE),report=reviewWinterImport(source),bindings={};const organizations=[],riders=[],horses=[]
 for(const p of report.people){const id=uuid();bindings[importBindingKey(p.kind,p.id)]=id;const base={id,event_id:WINTER_EVENT_ID,name:p.name};if(p.kind==='団体')organizations.push(base);else{const row={...base,organization_id:bindings[importBindingKey('団体',p.org)],roster_source:'shared_roster',is_participant:true};if(p.kind==='選手')riders.push({...row,jef_member_no:null});else horses.push({...row,jef_registration_no:null})}}
 const c=winterCompetition('5'),competition={id:uuid(),event_id:WINTER_EVENT_ID,competition_no:'5',competition_date:c.date,name:c.name,official:c.official,fee:c.fee,member_fee:c.memberFee,nonmember_fee:c.nonmemberFee,op_fee:c.opFee}
 return {checkpoint:{kind:'winter-import-registration',version:1,eventId:WINTER_EVENT_ID,reference:'DUMMY-IMPORT-20261020',source,bindings,states:{}},snapshot:{data:{eventId:WINTER_EVENT_ID,organizations,riders,horses,competitions:[competition],entries:[],timetable:[]},initial:[]}}
}
function append(snapshot,input){const fee=require('../lib/winter-initial-entry.ts').reviewWinterInitialEntry(input).entryFee;snapshot.initial.push({id:input.id,event_id:WINTER_EVENT_ID,entry_fee:fee,inputs:{organizationId:input.organization.id,competitionId:input.competition.id,riderId:input.rider.id,horseId:input.horse.id,membership:input.selection.membership??null,isOp:!!input.selection.isOp,instructorConfirmed:!!input.selection.instructorConfirmed,entryFee:fee}});snapshot.data.entries.push({entry_id:input.id,event_id:WINTER_EVENT_ID,competition_id:input.competition.id,competition_no:input.competition.competition_no,rider_id:input.rider.id,horse_id:input.horse.id,is_op:!!input.selection.isOp,status:'active',organization_id:input.rider.organization_id,organization_name:input.organization.name,start_order:snapshot.data.entries.length+1})}
async function main(){
 let {checkpoint:cp,snapshot}=fixture();const original=copy(cp.source);let plan=await reviewImportRegistration(cp,snapshot)
 assert.equal(plan.ready,true);assert.deepEqual(plan.rows.map(x=>x.fee),[5000,10000]);assert.equal(snapshot.initial.length,0)
 assert.equal(await importEntryId(cp.reference,0),await importEntryId('ＤＵＭＭＹ-IMPORT-20261020',0));assert.notEqual(await importEntryId(cp.reference,0),await importEntryId(cp.reference,1))
 let stored,posts=0,stop=false;const deps={load:async()=>copy(snapshot),persist:x=>{stored=copy(x)},stop:()=>stop,save:async input=>{assert.equal(stored.states[input.id],'unknown');posts++;append(snapshot,input);return input.id}}
 await runImportRegistration(cp,deps);assert.equal(posts,2);assert.equal(snapshot.initial.reduce((s,x)=>s+x.entry_fee,0),15000);assert.deepEqual(stored.source,original)
 plan=await reviewImportRegistration(readImportCheckpoint(stored),snapshot);assert.deepEqual(plan.rows.map(x=>x.state),['registered','registered'])
 await runImportRegistration(cp,deps);assert.equal(posts,2)
 await runImportRegistration({...cp,reference:'different-reference'},deps);assert.equal(posts,2)
 const corrected=copy(cp);corrected.source.entries=corrected.source.entries.replace('いいえ','はい');assert(importCheckpointDifferences(cp,corrected).length);assert.equal((await reviewImportRegistration(corrected,snapshot)).ready,false)
 const bad=copy(snapshot);bad.data.riders[0].organization_id=uuid();assert((await reviewImportRegistration(cp,bad)).issues.some(x=>x.includes('所属の差分')))
 const mismatch=copy(snapshot);mismatch.data.horses[0].name='変更された馬';assert((await reviewImportRegistration(cp,mismatch)).issues.some(x=>x.includes('名前の差分')))
 const price=copy(snapshot);price.data.competitions[0].member_fee=6000;assert.equal((await reviewImportRegistration(cp,price)).ready,false)
 const invalid=copy(cp);invalid.source.roster=invalid.source.roster.replace('未登録\t会員','未登録\t');assert.equal((await reviewImportRegistration(invalid,snapshot)).ready,false)
 const withdrawn=copy(snapshot);withdrawn.data.entries[0].status='withdrawn';assert.equal((await reviewImportRegistration(cp,withdrawn)).ready,false)
 const foreign=copy(snapshot);foreign.data.competitions[0].event_id='autumn';await assert.rejects(reviewImportRegistration(cp,foreign),/Winter/);assert.throws(()=>readImportCheckpoint({...cp,eventId:'autumn'}),/Winter/)
 ;({checkpoint:cp,snapshot}=fixture());posts=0;stored=null;let cut=true
 const disconnected={...deps,load:async()=>copy(snapshot),save:async input=>{posts++;append(snapshot,input);if(cut){cut=false;throw new Error('lost response')}return input.id}}
 await assert.rejects(runImportRegistration(cp,disconnected),/lost response/);assert.equal(Object.values(stored.states)[0],'unknown');assert.equal(snapshot.initial.length,1)
 await runImportRegistration(readImportCheckpoint(stored),disconnected);assert.equal(posts,2);assert.equal(snapshot.initial.length,2)
 ;({checkpoint:cp,snapshot}=fixture());posts=0;stop=false
 await runImportRegistration(cp,{...deps,save:async input=>{posts++;append(snapshot,input);stop=true;return input.id}});assert.equal(posts,1);stop=false;await runImportRegistration(stored,deps);assert.equal(posts,2)
 ;({checkpoint:cp,snapshot}=fixture());posts=0
 await assert.rejects(runImportRegistration(cp,{...deps,persist:()=>{throw new Error('quota')}}),/quota/);assert.equal(posts,0)
 await assert.rejects(runImportRegistration(cp,{...deps,load:async()=>{throw new Error('no admin')}}),/no admin/);assert.equal(posts,0)
 cp.states[await importEntryId(cp.reference,0)]='registered';await runImportRegistration(cp,deps);assert.equal(posts,2)
 // Recovery addition: one source can use different rider/horse clubs without merging identities.
 ;({checkpoint:cp,snapshot}=fixture());const other={id:uuid(),event_id:WINTER_EVENT_ID,name:'ダミー別所属'};snapshot.data.organizations.push(other)
 cp.source.roster+='\n団体\tO02\t\tダミー別所属\t\t\t\t\t\t\t';cp.source.roster=cp.source.roster.replace('選手\tR01\tO01','選手\tR01\tO02');cp.source.accounts+='\nO02\t0\t0\tはい';cp.bindings[importBindingKey('団体','O02')]=other.id;snapshot.data.riders[0].organization_id=other.id
 assert.equal((await reviewImportRegistration(cp,snapshot)).ready,true)
 console.log('PASS: import preview/no writes, explicit mapping, original totals, prices, duplicates/reimport, correction/diff, affiliation, category, withdrawn history, event isolation, uncertain resume, stop/resume, storage/auth failures, untrusted checkpoints, cross-club mapping')
}
main().catch(e=>{console.error(e);process.exitCode=1})
