const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f)
const {WINTER_EVENT_ID,winterCompetition}=require(path.resolve('lib/winter-event.ts'))
const {reviewWinterInitialBatch,saveWinterInitialBatch,WinterInitialBatchFailure}=require(path.resolve('lib/winter-initial-entry.ts'))
function input(n,no,selection={}){const c=winterCompetition(no),event_id=WINTER_EVENT_ID;return{id:`entry-${n}`,organization:{event_id,id:'org',name:'検証'},competition:{event_id,id:no,competition_no:no,name:c.name,official:c.official,fee:c.fee,op_fee:c.opFee,member_fee:c.memberFee,nonmember_fee:c.nonmemberFee},rider:{event_id,id:`r${n}`,organization_id:'org',name:'検証選手',jef_member_no:'123',roster_source:'shared_roster',is_participant:true},horse:{event_id,id:`h${n}`,organization_id:'org',name:'検証馬',jef_registration_no:'456',roster_source:'shared_roster',is_participant:true},selection}}
const rows=[input(1,'1'),input(2,'1',{isOp:true}),input(3,'8',{membership:'member',instructorConfirmed:true}),input(4,'8',{membership:'nonmember',instructorConfirmed:true})]
const expected=winterCompetition('1').fee+winterCompetition('1').opFee+winterCompetition('8').memberFee+winterCompetition('8').nonmemberFee
assert.equal(reviewWinterInitialBatch(rows).total,expected)
assert.throws(()=>reviewWinterInitialBatch([]),/1行/)
assert.throws(()=>reviewWinterInitialBatch([rows[0],{...rows[0],id:'other'}]),/重複/)
assert.throws(()=>reviewWinterInitialBatch([rows[0],{...rows[1],organization:{...rows[1].organization,id:'else'}}]),/同じ団体/)
const calls=[],progress=[];let fail=true
// Mock only: no live participant or entry writes.
global.fetch=async(url,args)=>{assert(args.signal);const body=JSON.parse(args.body);calls.push(body);if(body.p_id==='entry-3'&&fail)throw Error('network');return{ok:true,json:async()=>body.p_id}}
;(async()=>{
 let failure;try{await saveWinterInitialBatch(rows,'fixture',[],ids=>progress.push(ids))}catch(e){failure=e}
 assert(failure instanceof WinterInitialBatchFailure);assert(failure.uncertain);assert.deepEqual(failure.completedIds,['entry-1','entry-2']);assert.equal(calls.length,3);assert.deepEqual(progress,[['entry-1'],['entry-1','entry-2']]);
 fail=false;const done=await saveWinterInitialBatch(rows,'fixture',failure.completedIds);assert.deepEqual(done,rows.map(x=>x.id));assert.deepEqual(calls[2],calls[3],'Uncertain retry must keep the same ID and fee payload');assert.deepEqual(calls.map(x=>x.p_id),['entry-1','entry-2','entry-3','entry-3','entry-4']);assert.equal(calls[1].p_is_op,true);assert.equal(calls[3].p_membership,'member');assert.equal(calls[4].p_membership,'nonmember');
 const before=calls.length;await assert.rejects(saveWinterInitialBatch([rows[0],{...rows[0],id:'duplicate'}],'fixture'),/重複/);assert.equal(calls.length,before);await assert.rejects(saveWinterInitialBatch(rows,'fixture',['unrelated']),/一致/)
 console.log('PASS: club batch with ordinary/OP and instructor member/nonmember; preflight duplicate guard; partial progress and stable-ID uncertain retry without resending completed rows')
})().catch(e=>{console.error(e);process.exitCode=1})
