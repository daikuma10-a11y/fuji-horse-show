require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {WINTER_EVENT_ID:eventId}=require('../lib/winter-event.ts')
const {loadWinterOverviewCredentials:load}=require('../lib/winter-overview-credentials.ts')
const id=n=>`00000000-0000-4000-8000-${String(n).padStart(12,'0')}`
const riders=Array.from({length:6},(_,i)=>({id:id(i+1),event_id:eventId,name:'同名選手',jef_member_no:i===4?null:String(i+101)}))
const data={eventId,riders,horses:[{id:id(10),event_id:eventId,name:'合成馬',jef_registration_no:'301'},{id:id(11),event_id:eventId,name:'合成馬',jef_registration_no:null}],organizations:[],entries:[],competitions:[],timetable:[]}
let requests=[],mode='normal'
global.fetch=async(input,options)=>{
 const url=new URL(input),table=url.pathname.split('/').at(-1);requests.push({url,options})
 assert.equal(options.method,'GET');assert.equal(options.cache,'no-store');assert.equal(options.headers.Authorization,'Bearer synthetic')
 assert.ok(!url.searchParams.get('select').includes('raw_data'),'No unrelated personal data')
 assert.ok(options.signal)
 if(mode==='error')return {ok:false}
 const rows={
  jef_rider_master:[
   {member_no:'101',rider_grade:'B',import_date:'2025-01-01'},{member_no:'101',rider_grade:'Ａ',import_date:'2026-10-04'},
   {member_no:'102',rider_grade:'B(D)',import_date:'2026-10-04'},{member_no:'102',rider_grade:'A',import_date:'2026-10-04'},
   {member_no:'103',rider_grade:null,import_date:'2026-10-04'},
  ],
  jef_horse_master:[{registration_no:'301',grade:'中障害A',import_date:'2026-10-04'}],
  fhs_winter_reception_roster:[{rider_id:id(4),entity_id:id(24)},{rider_id:id(5),entity_id:id(25)},{rider_id:id(6),entity_id:id(26)}],
  fhs_roster_entities:[
   {id:id(24),kind:'rider',source_reference:JSON.stringify([{source:'autumn_player',grade:'B(D)'}])},
   {id:id(25),kind:'rider',source_reference:JSON.stringify([{source:'autumn_player',grade:'-'}])},
   {id:id(26),kind:'rider',source_reference:JSON.stringify([{source:'autumn_player',grade:'A'},{source:'autumn_player',grade:'B'}])},
  ],
 }
 if(mode==='empty')rows.jef_horse_master=[]
 if(mode==='wrong')rows.jef_horse_master=[{registration_no:'999',grade:'中障害A',import_date:'2026-10-04'}]
 if(mode==='invalid')rows.fhs_winter_reception_roster=[{rider_id:id(4),entity_id:'bad-id'}]
 return {ok:true,json:async()=>rows[table]}
}
;(async()=>{
 const before=JSON.stringify(data),values=await load(data,'synthetic')
 assert.equal(values[id(1)].value,'A級');assert.ok(values[id(1)].source.includes('2026-10-04'))
 assert.equal(values[id(2)].value,'未確認');assert.ok(values[id(2)].source.includes('不一致'))
 assert.equal(values[id(3)].value,'未確認');assert.ok(values[id(3)].source.includes('記載なし'))
 assert.equal(values[id(4)].value,'B級(D)');assert.equal(values[id(4)].source,'過去原本（Autumn・要確認）');assert.equal(values[id(4)].needsReview,true)
 assert.equal(values[id(5)].value,'未確認');assert.equal(values[id(6)].value,'未確認')
 assert.equal(values[id(10)].value,'中障害A');assert.equal(values[id(11)].value,'未確認')
 const bindings=requests.find(r=>r.url.pathname.endsWith('fhs_winter_reception_roster'))
 assert.ok(!bindings.url.searchParams.get('rider_id').includes(id(3)),'Explicit latest blank does not resurrect an old grade')
 assert.ok(requests.every(r=>[...r.url.searchParams.values()].some(v=>v.startsWith('in.('))),'Reads are bounded to exact numbers/IDs')
 assert.equal(JSON.stringify(data),before)
 mode='empty';assert.equal((await load(data,'synthetic'))[id(10)].value,'未確認','No fabricated horse grade')
 mode='wrong';await assert.rejects(load(data,'synthetic'),/対応/)
 mode='invalid';await assert.rejects(load(data,'synthetic'),/対応/)
 mode='error';await assert.rejects(load(data,'synthetic'),/取得できません/)
 const count=requests.length
 await assert.rejects(load(data,''),/ログイン/);await assert.rejects(load({...data,eventId:'Autumn'},'synthetic'),/Winter/)
 assert.equal(requests.length,count)
 console.log('PASS: read-only bounded grade lookup, latest dated source, conflicting/blank/missing grades, exact Winter ID fallback, historic provenance, login/event/error guards')
})().catch(e=>{console.error(e);process.exitCode=1})
