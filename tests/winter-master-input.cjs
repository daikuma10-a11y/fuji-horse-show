const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
const resolve=Module._resolveFilename;Module._resolveFilename=function(id,...args){return resolve.call(this,id.startsWith('@/')?path.resolve(id.slice(2)):id,...args)}
Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f)
const ev=require('../lib/winter-event.ts'),master=require('../lib/winter-master-reception.ts'),api=require('../lib/winter-reception.ts'),change=require('../lib/winter-change.ts'),batch=require('../lib/winter-batch.ts')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`,row={event_id:ev.WINTER_EVENT_ID},org={...row,id:id(1),name:'所属A'},orgB={...row,id:id(2),name:'所属B'},player={...row,id:id(3),name:'同名選手',organization_id:org.id,jef_member_no:'TEST'},horse={...row,id:id(4),name:'馬',organization_id:orgB.id,jef_registration_no:'TEST'}
const c=ev.winterCompetition('5'),competition={...row,id:id(5),competition_no:'5',competition_date:c.date,name:c.name,official:c.official,fee:c.fee,op_fee:c.opFee,member_fee:c.memberFee,nonmember_fee:c.nonmemberFee}
const entry={...row,entry_id:id(6),competition_id:competition.id,competition_no:'5',start_order:1,status:'active',rider_id:player.id,horse_id:horse.id,organization_id:org.id,organization_name:org.name,is_op:false}
const data={eventId:ev.WINTER_EVENT_ID,organizations:[org,orgB],riders:[player,{...player,id:id(7),organization_id:orgB.id}],horses:[horse],competitions:[competition],entries:[entry]}
const state={competition:master.winterMasterCompetition(competition),playerId:player.id,horseId:horse.id,organizationId:org.id,isOp:false,note:' 希望位置 '},input=master.winterMasterAddInput(data,state,'担当',{membership:'member'},id(8))
assert.equal(api.reviewWinterAdd(input).total,8000);assert.equal(input.note,'希望位置');assert.equal(input.masterForm,true)
assert.equal(api.reviewWinterAdd({...input,organization:orgB}).total,8000)
assert.throws(()=>api.reviewWinterAdd({...input,organization:{...org,id:id(99)}}),/所属/)
assert.throws(()=>api.reviewWinterAdd({...input,masterForm:false}),/所属/)
assert.throws(()=>api.reviewWinterAdd({...input,selection:{}}),/会員/)
const q={...batch.emptyWinterQueue(),items:[{type:'add',input}]},a=batch.winterBatchPayload(q).p_items[0].args
assert.equal(a.p_note,'希望位置');assert.equal(a.p_master_form,true);assert.equal(a.p_expected_total,8000);assert.equal(a.p_organization_id,org.id)
const s={entry:{id:entry.entry_id,competitionId:entry.competition_id,playerId:entry.rider_id,horseId:entry.horse_id,organizationId:entry.organization_id,order:1},fromCompetition:state.competition,toCompetition:state.competition,toPlayerId:player.id,toHorseId:horse.id,organizationId:org.id,toIsOp:false,changedFields:[],treatedAsWithdrawAdd:false}
const ci=master.winterMasterChangeInput(data,s,'担当',{membership:'nonmember'},{membership:'member'},id(9));assert.equal(change.reviewWinterChange(ci).fee.total,2000);assert.deepEqual(change.reviewWinterChange(ci).changedFields,['membership'])
const ca=batch.winterBatchPayload({...batch.emptyWinterQueue(),items:[{type:'change',input:ci}]}).p_items[0].args;assert.equal(ca.p_before_organization_id,org.id);assert.equal(ca.p_master_form,true);assert.equal(ca.p_organization_id,org.id)
assert.equal(master.winterMasterRoster(data).players.length,2);assert.equal(master.winterMasterEntryModel({...data,organizations:[{...org,name:'同名クラブ'},{...orgB,name:'同名クラブ'}],entries:[{...entry,organization_name:'同名クラブ',organization_id:orgB.id}]},competition.id).entriesByCompetition(competition.id)[0].organizationId,orgB.id)
assert.throws(()=>master.winterMasterRoster({...data,eventId:'autumn'}));assert.throws(()=>master.winterMasterRoster({...data,riders:[{...player,event_id:'autumn'}]}))
assert.throws(()=>master.winterMasterChangeInput({...data,entries:[{...entry,rider_id:id(88)}]},s,'担当',{}, {},id(9)),/変わりました/)
const oldAdd={...input,masterForm:undefined,note:undefined,rider:{...player,organization_id:orgB.id},organization:orgB};const oldArgs=batch.winterBatchPayload({...batch.emptyWinterQueue(),items:[{type:'add',input:oldAdd}]}).p_items[0].args;assert.ok(!('p_master_form' in oldArgs));assert.ok(!('p_note' in oldArgs))
console.log('PASS: master form fee/category review, explicit cross-club affiliation, note payload, membership-only change, event and original snapshot rejection, ID-based organizations and legacy queue compatibility')
