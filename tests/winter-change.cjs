const assert = require('node:assert/strict'), fs = require('node:fs'), ts = require('typescript'), Module = require('node:module'), path = require('node:path')
function load(relative, mocks = {}) {
 const file = path.resolve(relative), m = new Module(file, module); m.filename = file; m.paths = module.paths
 m.require = name => name in mocks ? mocks[name] : require(Module._resolveFilename(name, m))
 m._compile(ts.transpileModule(fs.readFileSync(file, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, esModuleInterop: true } }).outputText, file); return m.exports
}
const event = load('lib/winter-event.ts'), api = load('lib/winter-reception.ts', {'./winter-event':event})
const {reviewWinterChange: review} = load('lib/winter-change.ts', {'./winter-event':event, './winter-reception':api})
const row = {event_id:event.WINTER_EVENT_ID}, org = {...row,id:'org',name:'団体'}
const rider = {...row,id:'rider',name:'選手',organization_id:'org',jef_member_no:'123'}, horse={...row,id:'horse',name:'馬',organization_id:'org',jef_registration_no:'456'}
const comp = no => {const c=event.winterCompetition(no);return {...row,id:`c${no}`,competition_no:no,competition_date:c.date,name:c.name,official:c.official,fee:c.fee,op_fee:c.opFee,member_fee:c.memberFee,nonmember_fee:c.nonmemberFee}}
const original={...row,entry_id:'entry',competition_id:'c1',competition_no:'1',start_order:1,status:'active',rider_id:'rider',horse_id:'horse',organization_name:'団体',is_op:false}
const base=()=>({original:{...original},from:comp('1'),fromSelection:{},target:{id:'request',organization:org,competition:comp('1'),rider:{...rider,id:'new-rider'},horse,visitorName:'担当',selection:{}}})
assert.equal(review(base()).fee.total,2000)
let input=base(); input.target.rider=rider; input.target.competition=comp('4')
assert.equal(review(input).fee.total,4000)
input.from=comp('4'); input.original.competition_id='c4'; input.target.competition=comp('1')
assert.equal(review(input).fee.total,2000) // No refund for cheaper destination.
input=base();input.target.competition=comp('4')
assert.equal(review(input).treatedAsWithdrawAdd,true); assert.equal(review(input).fee.total,13000)
input=base(); input.target.selection={isOp:true}
assert.equal(review(input).treatedAsWithdrawAdd,false);assert.equal(review(input).fee.total,2000)
input=base();input.target.rider=rider
assert.throws(()=>review(input),/変更する項目/)
input=base();input.original.event_id='Autumn';assert.throws(()=>review(input),/Winter以外/)
input=base();input.original.status='withdrawn';assert.throws(()=>review(input),/棄権済み/)
input=base();input.from=comp('5');input.original.competition_id='c5';input.target.competition=comp('5')
assert.throws(()=>review(input),/料金区分/)
input.fromSelection={membership:'member'};input.target.selection={membership:'member'}
assert.equal(review(input).fee.total,2000)
input.target.rider=rider;input.target.selection={membership:'nonmember'}
assert.equal(review(input).fee.total,7000)
input=base();input.target.rider={...rider,jef_member_no:null};input.target.competition=comp('6')
assert.throws(()=>review(input),/日馬連登録/)
input=base();input.target.competition=comp('8');input.target.selection={membership:'member'}
assert.throws(()=>review(input),/資格/)
console.log('PASS: Winter change fees, positive difference only, multi-field rules, OP, explicit membership, JEF, instructor and event checks')
;(async()=>{
 let mode='success', bodies=[]
 global.fetch=async(url,options)=>{
   assert.ok(url.endsWith('/submit_winter_reception_change')); assert.equal(options.headers.Authorization,'Bearer admin-test')
   const body=JSON.parse(options.body);bodies.push(body)
   if(mode==='failure')return {ok:false,json:async()=>({message:'変更前の人馬が更新されています'})}
   return {ok:true,json:async()=>mode==='wrong'?'wrong-id':body.p_id}
 }
 const input=base()
 assert.equal(await load('lib/winter-change.ts', {'./winter-event':event, './winter-reception':api}).submitWinterChange(input,'admin-test'),'request')
 assert.equal(bodies[0].p_expected_total,2000);assert.deepEqual(bodies[0].p_before,{competitionId:'c1',riderId:'rider',horseId:'horse',isOp:false})
 mode='failure'; await assert.rejects(load('lib/winter-change.ts', {'./winter-event':event, './winter-reception':api}).submitWinterChange(input,'admin-test'),/更新/)
 mode='success'; await load('lib/winter-change.ts', {'./winter-event':event, './winter-reception':api}).submitWinterChange(input,'admin-test')
 assert.deepEqual(bodies[1],bodies[2])
 mode='wrong';await assert.rejects(load('lib/winter-change.ts', {'./winter-event':event, './winter-reception':api}).submitWinterChange(input,'admin-test'),/保存結果/)
 await assert.rejects(load('lib/winter-change.ts', {'./winter-event':event, './winter-reception':api}).submitWinterChange(input,''),/本部ログイン/)
 console.log('PASS: change snapshot, server-price check, authenticated submission, stable retries and explicit response failures')
})().catch(error=>{console.error(error);process.exitCode=1})
