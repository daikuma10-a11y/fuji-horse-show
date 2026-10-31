// Synthetic service stubs; no authentication or database requests are sent.
require('./register-ts.cjs')
const assert=require('node:assert/strict')
const auth=require('../lib/supabase-rest.ts'),roster=require('../lib/shared-roster.ts')
const data=require('../lib/winter-data.ts'),settlement=require('../lib/winter-settlement.ts'),entry=require('../lib/winter-initial-entry.ts')
const stable=require('../lib/winter-stable-schedules.ts'),requests=require('../lib/winter-stall-requests.ts')
const credentials=require('../lib/winter-application-credentials.ts')
const correction=require('../lib/winter-roster-correction.ts')
const qualifications=require('../lib/jef-rider-qualifications.ts')
const {winterApplicationServices}=require('../lib/winter-application-services.ts')
global.fetch=()=>{throw Error('Unexpected network call')}
let calls=[],denied=false,version=0
auth.verifyAdminSession=async session=>{calls.push(['verify',session.accessToken]);if(denied)throw Error('admin denied');return {...session,accessToken:`synthetic-${++version}`}}
for(const [module,name,result] of [[roster,'loadSharedRoster',{synthetic:'roster'}],[roster,'loadWinterRosterBindings',[]],[data,'loadWinterData',{synthetic:'event'}],[settlement,'loadWinterInitialCharges',[]],[credentials,'loadWinterApplicationCredentials',[]],[stable,'loadWinterStableSchedules',[]],[requests,'loadWinterStallRequests',[]]])module[name]=async(...args)=>{calls.push([name,...args]);return result}
for(const [module,name] of [[roster,'saveRosterEntity'],[roster,'saveWinterParticipants'],[entry,'saveWinterInitialEntry'],[credentials,'saveWinterApplicationCredential'],[correction,'saveWinterRosterCorrection'],[stable,'saveWinterStableSchedule'],[requests,'saveWinterStallRequest']])module[name]=async(...args)=>{calls.push([name,...args]);return 'synthetic-result'}
qualifications.loadJefRiderQualifications=async(...args)=>{calls.push(['loadJefRiderQualifications',...args]);return []}
async function main(){
 const sessions=[],service=winterApplicationServices({accessToken:'synthetic-start',refreshToken:'synthetic-refresh',expiresAt:0},s=>sessions.push(s))
 const snapshot=await service.load();assert.equal(snapshot.roster.synthetic,'roster');assert.equal(snapshot.data.synthetic,'event')
 assert.equal(calls[0][0],'verify');for(const c of calls.filter(c=>['loadSharedRoster','loadWinterRosterBindings','loadWinterInitialCharges','loadWinterStableSchedules'].includes(c[0])))assert.equal(c[1],'synthetic-1')
 calls=[];const person={kind:'horse',name:'合成馬',reading:'ごうせいうま',jefNumber:'',clubName:'合成クラブ'}
 assert.equal(await service.savePerson(person),'synthetic-result');assert.deepEqual(calls,[['verify','synthetic-1'],['saveRosterEntity',person,'synthetic-2']])
 calls=[];const ids=['synthetic-entity'],expected=['synthetic-retained']
 await service.saveParticipants('synthetic-club',ids,expected)
 assert.deepEqual(calls,[['verify','synthetic-2'],['saveWinterParticipants','synthetic-club',ids,expected,'synthetic-3']])
 calls=[];const input={id:'synthetic-entry',selection:{isOp:false}}
 await service.saveEntry(input);assert.deepEqual(calls,[['verify','synthetic-3'],['saveWinterInitialEntry',input,'synthetic-4']])
 calls=[];await service.saveCredential(input);assert.deepEqual(calls,[['verify','synthetic-4'],['saveWinterApplicationCredential',input,'synthetic-5']])
 calls=[];const qualified=await service.load(['123']);assert.deepEqual(qualified.riderGrades,[]);assert.deepEqual(calls.find(c=>c[0]==='loadJefRiderQualifications'),['loadJefRiderQualifications',['123'],'synthetic-6'])
 calls=[];await service.correctPerson(input);assert.deepEqual(calls,[['verify','synthetic-6'],['saveWinterRosterCorrection',input,'synthetic-7']])
 calls=[];assert.equal((await service.loadRoster()).synthetic,'roster');assert.deepEqual(calls,[['verify','synthetic-7'],['loadSharedRoster','synthetic-8']]);assert.equal(sessions.length,8)
 calls=[];await service.saveStableSchedule(input);assert.deepEqual(calls,[['verify','synthetic-8'],['saveWinterStableSchedule',input,'synthetic-9']])
 denied=true
 for(const action of [()=>service.loadRoster(),()=>service.load(),()=>service.savePerson(person),()=>service.saveParticipants('club',ids,expected),()=>service.saveEntry(input),()=>service.saveCredential(input),()=>service.correctPerson(input),()=>service.saveStableSchedule(input)]){
  calls=[];await assert.rejects(action(),/admin denied/);assert.deepEqual(calls,[['verify','synthetic-9']])
 }
 console.log('PASS: existing Winter service arguments preserved, admin verification before every read/write, session refresh propagation, authorization failures stop without fallback')
}
main().catch(error=>{console.error(error);process.exitCode=1})
