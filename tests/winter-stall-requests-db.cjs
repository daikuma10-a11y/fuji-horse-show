// Isolated PostgreSQL (PGlite). Never connects to Supabase or uses real records.
require('./register-ts.cjs')
const {PGlite}=require('@electric-sql/pglite'),fs=require('node:fs'),assert=require('node:assert/strict')
const {emptyStallRequest}=require('../lib/master/stall-request.ts')
const A=require('../lib/master/stall-allocation.ts')
const db=new PGlite(),event='b571f05e-ed23-4e07-929e-be2b73e601a5',org='11111111-1111-4111-8111-111111111111',horse='22222222-2222-4222-8222-222222222222',actor='33333333-3333-4333-8333-333333333333'
const call=(name,p)=>db.query(`select public.${name}($1::jsonb) result`,[JSON.stringify(p)])
;(async()=>{
 await db.exec(`create role anon;create role authenticated;create schema auth;create schema fhs_winter_private;grant usage on schema public,auth,fhs_winter_private to authenticated;
 create function auth.jwt() returns jsonb language sql stable as $$select coalesce(nullif(current_setting('request.jwt.claims',true),''),'{}')::jsonb$$;
 create function auth.uid() returns uuid language sql stable as $$select (auth.jwt()->>'sub')::uuid$$;
 create table public.events(id uuid primary key);create table public.organizations(id uuid primary key,event_id uuid,name text);
 create table public.horses(id uuid primary key,event_id uuid,organization_id uuid,name text,roster_source text,is_participant boolean);
 insert into public.events values('${event}');insert into public.organizations values('${org}','${event}','合成団体');insert into public.horses values('${horse}','${event}','${org}','合成馬','shared_roster',true);`)
 await db.exec(fs.readFileSync('supabase/migrations/20261030065656_shared_stall_allocations.sql','utf8'))
 await db.exec(fs.readFileSync('supabase/migrations/20261031073026_winter_stall_requests.sql','utf8'))
 const claims=role=>db.query("select set_config('request.jwt.claims',$1,false)",[JSON.stringify({sub:actor,app_metadata:{role},user_metadata:{role:'admin'}})])
 const value={...emptyStallRequest(),manual:'4番厩舎希望',barn:'4',confirmed:true,imports:[{digest:'d'.repeat(64),text:'4番厩舎希望',source:'合成.xlsx C20'}]}
 const request={eventId:event,organizationId:org,organizationName:'合成団体',requestId:'a'.repeat(64),expected:null,value}
 await claims('member');await assert.rejects(()=>call('save_winter_stall_request',request),/本部/)
 await claims('admin');await call('save_winter_stall_request',request);await call('save_winter_stall_request',request)
 assert.equal((await db.query('select count(*)::int n from public.fhs_stall_request_versions')).rows[0].n,1)
 await assert.rejects(()=>call('save_winter_stall_request',{...request,value:{...value,manual:'別'}}),/同じ保存番号/)
 const second={...request,requestId:'b'.repeat(64),expected:request.requestId,value:{...value,reason:'追記'}}
 await call('save_winter_stall_request',second);await call('save_winter_stall_request',request)
 assert.equal((await db.query('select request_id from public.fhs_current_stall_requests')).rows[0].request_id,second.requestId)
 await assert.rejects(()=>call('save_winter_stall_request',{...request,requestId:'c'.repeat(64)}),/別の操作/)
 await assert.rejects(()=>call('save_winter_stall_request',{...second,requestId:'c'.repeat(64),expected:second.requestId,value:{...value,imports:[]}}),/原文/)
 await assert.rejects(()=>call('save_winter_stall_request',{...second,requestId:'c'.repeat(64),expected:second.requestId,value:{...value,neighborId:horse}}),/相手/)
 await assert.rejects(()=>call('save_winter_stall_request',{...second,eventId:actor}),/Winter/)
 const groups=[{id:org,name:'合成団体',horses:[{id:horse,name:'合成馬'}]}],options=A.defaultStallOptions(groups)
 options.layout.requests[org]=second.value;options.layout.requestVersions[org]=second.requestId
 const plan=A.createStallPlan(groups,options,'2026-10-31T00:00:00Z'),input={eventId:event,requestId:'e'.repeat(64),expected:null,value:plan}
 await call('save_winter_stall_allocation',input)
 const stale=structuredClone(plan);stale.options.layout.requestVersions[org]=request.requestId
 await assert.rejects(()=>call('save_winter_stall_allocation',{...input,requestId:'f'.repeat(64),expected:input.requestId,value:stale}),/要望が更新/)
 const ignored=structuredClone(plan);delete ignored.options.layout
 await assert.rejects(()=>call('save_winter_stall_allocation',{...input,requestId:'f'.repeat(64),expected:input.requestId,value:ignored}),/要望が更新/)
 await db.exec('set role authenticated');await claims('member')
 assert.equal((await db.query('select count(*)::int n from public.fhs_current_stall_requests')).rows[0].n,0)
 await claims('admin');assert.equal((await db.query('select count(*)::int n from public.fhs_current_stall_requests')).rows[0].n,1)
 await assert.rejects(()=>db.query('delete from public.fhs_stall_request_versions'),/permission denied/)
 await db.exec('reset role')
 assert.equal((await db.query('select count(*)::int n from public.horses')).rows[0].n,1)
 console.log('PASS: isolated migration, admin-only RLS/RPC, immutable Excel originals, CAS conflict, same-ID retries, obsolete-plan rejection, no roster writes')
})().catch(e=>{console.error(e.message,e.position,e.where);process.exitCode=1}).finally(()=>db.close())
