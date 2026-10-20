require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {loadWinterRosterBindings}=require('../lib/shared-roster.ts')
const uuid=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const row=n=>({entity_id:uuid(n),club_id:uuid(2000),rider_id:uuid(n+3000),horse_id:null})
let requests=[],source=Array.from({length:501},(_,i)=>row(i+1)),ok=true
global.fetch=async(url,options)=>{
 const u=new URL(url);requests.push(u)
 assert.equal(u.pathname,'/rest/v1/fhs_winter_reception_roster');assert.equal(options.headers.Authorization,'Bearer synthetic-token')
 assert.equal(u.searchParams.get('select'),'entity_id,club_id,rider_id,horse_id');assert.equal(u.searchParams.get('order'),'entity_id.asc,club_id.asc')
 assert.equal(options.cache,'no-store');assert(!options.method||options.method==='GET')
 const offset=Number(u.searchParams.get('offset'))
 return {ok,status:ok?200:403,json:async()=>source.slice(offset,offset+500)}
}
async function main(){
 await assert.rejects(loadWinterRosterBindings(''),/ログイン/);assert.equal(requests.length,0)
 assert.equal((await loadWinterRosterBindings('synthetic-token')).length,501);assert.deepEqual(requests.map(u=>u.searchParams.get('offset')),['0','500'])
 for(const bad of [[row(1),row(1)],[row(1),{...row(2),rider_id:row(1).rider_id}],[{...row(1),horse_id:uuid(9000)}],[{...row(1),rider_id:null}],[{...row(1),entity_id:'malformed'}],[{...row(1),horse_id:undefined}],[null]]){
  source=bad;await assert.rejects(loadWinterRosterBindings('synthetic-token'),/対応/)
 }
 source=[{...row(1),horse_id:uuid(9000),rider_id:null}];assert.equal((await loadWinterRosterBindings('synthetic-token'))[0].horse_id,uuid(9000))
 ok=false;requests=[];await assert.rejects(loadWinterRosterBindings('synthetic-token'),/ログイン/);assert.equal(requests.length,1)
 console.log('PASS: existing Winter identity bridge GET pagination, admin token requirement, exact UUID and rider/horse shape, duplicate rejection, 403 stops without fallback')
}
main().catch(error=>{console.error(error);process.exitCode=1})
