const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('typescript'),Module=require('node:module'),path=require('node:path')
Module._extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText,f)
const {refreshRosterEntity,refreshRosterParticipants,saveRosterEntity}=require(path.resolve('lib/shared-roster.ts'))
const ev='b571f05e-ed23-4e07-929e-be2b73e601a5',id='11111111-1111-4111-8111-111111111111',old={id,kind:'horse',name:'修正前',updated_at:'2026-10-11T00:00:00Z'},other={id:'other',kind:'rider',name:'選択中の選手'},participants=[{event_id:ev,entity_id:'other',club_id:'club'}]
const data={entities:[old,other],clubs:[{id:'club',name:'団体'}],affiliations:[{id:'a',entity_id:id,club_id:'club'},{id:'b',entity_id:'other',club_id:'club'}],participants},seen=[];let mode='ok'
global.fetch=async(raw,args)=>{const u=new URL(raw);seen.push(u);assert(args.signal,'Read/mutation must have timeout signal');assert.equal(args.headers.Authorization,'Bearer fixture');let rows=[]
 if(u.pathname.endsWith('fhs_roster_entities')){assert.equal(u.searchParams.get('id'),`eq.${id}`);rows=[{...old,name:'修正後',updated_at:'2026-10-11T01:00:00Z'}]}
 if(u.pathname.endsWith('fhs_roster_affiliations')){assert.equal(u.searchParams.get('entity_id'),`eq.${id}`);rows=[{id:'new',entity_id:mode==='mismatch'?'wrong':id,club_id:'new-club'}]}
 if(u.pathname.endsWith('fhs_roster_clubs'))rows=[...data.clubs,{id:'new-club',name:'新団体'}]
 if(u.pathname.endsWith('fhs_winter_participants')){assert.equal(u.searchParams.get('event_id'),`eq.${ev}`);rows=[{...participants[0],event_id:mode==='autumn'?'autumn':ev}]}
 if(u.pathname.endsWith('/rpc/save_fhs_roster_entity')){const e=new Error('timeout');e.name='TimeoutError';throw e}
 return {ok:true,json:async()=>rows}
}
;(async()=>{
 const updated=await refreshRosterEntity(data,id,'fixture');assert.equal(updated.entities.find(x=>x.id===id).name,'修正後');assert.equal(updated.entities.find(x=>x.id==='other'),other);assert.equal(updated.participants,participants);assert(updated.affiliations.includes(data.affiliations[1]));assert.equal(seen.length,3);assert(!seen.some(u=>u.pathname.endsWith('fhs_winter_participants')))
 const refreshed=await refreshRosterParticipants(updated,'fixture');assert.equal(refreshed.entities,updated.entities);assert.equal(refreshed.participants.length,1)
 mode='mismatch';await assert.rejects(refreshRosterEntity(data,id,'fixture'),/読戻し/)
 mode='autumn';await assert.rejects(refreshRosterParticipants(data,'fixture'),/Winter/)
 await assert.rejects(saveRosterEntity({kind:'horse',name:'馬',reading:'',jefNumber:'',clubName:'団体',id},'fixture'),/保存結果.*時間切れ/)
 console.log('PASS: edited identity only reloaded; other entities and participant snapshot retained; affiliations merged; event/mismatch guards and uncertain timeout recovery')
})().catch(e=>{console.error(e);process.exitCode=1})
