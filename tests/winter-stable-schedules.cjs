require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {zipSync,strToU8}=require('fflate')
const {readInputXlsx}=require('../lib/master/xlsx-input.ts')
const {parseStableDate,extractWinterStableSchedule}=require('../lib/winter-stable-extraction.ts')
const {emptyStableSchedule,stableScheduleIssues,mergeStableSchedule}=require('../lib/master/stable-schedule.ts')
const {readStableSchedule,reviewStableSchedule,stableScheduleRequestId,loadWinterStableSchedules,saveWinterStableSchedule}=require('../lib/winter-stable-schedules.ts')
const {bookletRows,bookletPrintHtml}=require('../lib/master/stable-reports.ts')
const {createApplicationDraft,serializeApplicationDraft,parseApplicationDraft}=require('../lib/winter-application-draft.ts')
const {runApplicationRegistration,reviewApplicationRegistration,applicationRegistrationDifferences}=require('../lib/winter-application-registration.ts')
const {setup,uuid}=require('./winter-application-registration-fixture.cjs')
const fixture=require('./winter-application-fixture.cjs')
const {WINTER_EVENT_ID}=require('../lib/winter-event.ts')
const sheet=values=>({name:'申込集計書',hidden:false,cells:Object.fromEntries(Object.entries(values).map(([k,value])=>[k,{value:String(value)}]))})
const value={arrivalDate:'2026-11-13',arrivalTime:'08:00',departureDate:'2026-11-15',departureTime:'17:00',notes:''}
assert.deepEqual(parseStableDate('令和　　8 年　11月　13日　　8','時頃  （8:00～17:00）'),{date:'2026-11-13',time:'08:00'})
assert.deepEqual(parseStableDate('１１月１５日（日）','１７時'),{date:'2026-11-15',time:'17:00'})
assert.deepEqual(parseStableDate('令和　年　月　日','時頃 （8:00～17:00）'),{date:'',time:''})
assert.deepEqual(parseStableDate('2026/11/13 8時30分',''),{date:'2026-11-13',time:'08:30'})
const serial=(Date.UTC(2026,10,13)-Date.UTC(1899,11,30))/86400000
assert.deepEqual(parseStableDate(String(serial),'0.375'),{date:'2026-11-13',time:'09:00'})
assert.deepEqual(parseStableDate(String(serial+0.375),''),{date:'2026-11-13',time:'09:00'})
assert.deepEqual(parseStableDate(String(serial-1462),'8',true),{date:'2026-11-13',time:'08:00'})
assert.ok(stableScheduleIssues({...value,arrivalDate:'2026-02-30'}).length)
assert.ok(stableScheduleIssues({...value,departureDate:'2026-11-12'}).length)
assert.ok(stableScheduleIssues({...value,arrivalDate:''}).length)
assert.ok(stableScheduleIssues({...value,arrivalTime:'24:00'}).length)
assert.ok(stableScheduleIssues({...value,arrivalDate:'原本不明'}).length)
assert.throws(()=>readStableSchedule({...value,arrivalDate:'2025-11-13'}),/2026/)
const s=sheet({B27:'入厩予定日',C27:serial,F27:8,B28:'退厩予定日',C28:'11月15日',F28:17,B33:'希望入厩日時',C33:'11/12 18:00',C34:'移動の都合',H27:'誤読してはいけない値'})
const extracted=extractWinterStableSchedule(s,{sheets:[s]})
assert.equal(extracted.stable.arrivalDate,value.arrivalDate)
assert.match(extracted.stable.notes,/移動の都合.*要確認/)
assert.deepEqual(extracted.stableOrigins.arrival.map(o=>o.cell),['C27','D27','E27','F27'])
const split=sheet({B27:'入厩予定日',C27:2026,D27:11,E27:13,F27:0.375,B28:'退厩予定日',C28:2026})
const splitResult=extractWinterStableSchedule(split,{sheets:[split]}).stable
assert.equal(splitResult.arrivalDate,'2026-11-13');assert.equal(splitResult.arrivalTime,'09:00');assert.equal(splitResult.departureDate,'')
assert.ok(stableScheduleIssues(mergeStableSchedule(value,{...emptyStableSchedule(),arrivalTime:'08:00'})).length)
assert.deepEqual(mergeStableSchedule(value,emptyStableSchedule()),value)
assert.equal(mergeStableSchedule(value,{...emptyStableSchedule(),arrivalDate:'2026-11-14'}).arrivalTime,'','date change must not retain an unrelated old time')
const app=fixture();app.stable=extracted.stable;app.stableOrigins=extracted.stableOrigins
const draft=createApplicationDraft(app);draft.edited.stable.arrivalTime='09:00'
assert.deepEqual(parseApplicationDraft(serializeApplicationDraft(draft)).edited.stable,draft.edited.stable)
const bad=structuredClone(draft);bad.edited.stableOrigins.arrival[0].value='rewritten';assert.throws(()=>serializeApplicationDraft(bad))
assert.doesNotThrow(()=>parseApplicationDraft(serializeApplicationDraft(createApplicationDraft(fixture()))))
const group={id:uuid(),name:'架空団体 <script>',horses:[{id:uuid(),name:'架空馬'}]}
const rows=bookletRows([group],[{id:group.id,value}]);assert.equal(rows[0].arrival,'2026/11/13 08:00')
const html=bookletPrintHtml(rows,'Winter','試験');assert.ok(html.includes('2026/11/15 17:00'));assert.ok(!html.includes('<script>'))
// Date-system metadata survives actual OOXML parsing without changing ordinary cell values.
const files={'[Content_Types].xml':'<Types/>','xl/workbook.xml':'<workbook><workbookPr date1904="1"/><sheets><sheet name="test" r:id="r1"/></sheets></workbook>','xl/_rels/workbook.xml.rels':'<Relationships><Relationship Id="r1" Target="worksheets/sheet1.xml"/></Relationships>','xl/worksheets/sheet1.xml':'<worksheet><sheetData><row><c r="A1"><v>1</v></c></row></sheetData></worksheet>'}
assert.equal(readInputXlsx(zipSync(Object.fromEntries(Object.entries(files).map(([k,v])=>[k,strToU8(v)])))).date1904,true)

;(async()=>{
 const env=setup();env.work.review.original.stable=value;env.work.review.edited.stable=value;env.snapshot.stableSchedules=[]
 let saves=0
 env.deps.saveStableSchedule=async input=>{
  saves++;assert.ok(env.stored.stable,'save expectation persisted before network write')
  assert.equal(input.eventId,WINTER_EVENT_ID);assert.equal(input.expected,null)
  env.snapshot.stableSchedules.push({event_id:WINTER_EVENT_ID,organization_id:input.organizationId,request_id:input.requestId,value:input.value,source_reference:input.reference,confirmed_at:'2026-10-29T00:00:00Z'})
  throw new Error('response lost after commit')
 }
 const result=await runApplicationRegistration(env.work,env.deps)
 assert.equal(saves,1);assert.equal(env.posts.entry,1)
 const tampered=structuredClone(result);tampered.stable.value.arrivalTime='10:00';assert.ok(applicationRegistrationDifferences(result,tampered).some(v=>v.includes('入退厩')))
 const plan=await reviewApplicationRegistration(result,env.snapshot);assert.equal(plan.stable.complete,true)
 await runApplicationRegistration(result,env.deps);assert.equal(saves,1);assert.equal(env.posts.entry,1,'resume never duplicates entries or fees')
 const org=env.snapshot.data.organizations[0],saved=env.snapshot.stableSchedules[0]
 const changed=structuredClone(result.review);changed.edited.stable={...value,arrivalTime:'09:00'}
 const first=reviewStableSchedule(changed,[saved],[org])
 const conflict=reviewStableSchedule(changed,[{...saved,request_id:'f'.repeat(64),value:{...value,arrivalTime:'10:00'}}],[org],first.expectation)
 assert.match(conflict.issues.join('\n'),/別の操作/)
 assert.equal(reviewStableSchedule(changed,undefined,[org]).issues.length,1,'load failure cannot appear as empty dates')
 const h=await stableScheduleRequestId('x','0'.repeat(64),first.expectation,org.id)
 assert.equal(h,await stableScheduleRequestId('x','0'.repeat(64),first.expectation,org.id))
 assert.notEqual(h,await stableScheduleRequestId('x','0'.repeat(64),{...first.expectation,expected:'e'.repeat(64)},org.id))
 assert.notEqual(h,await stableScheduleRequestId('x','0'.repeat(64),first.expectation,uuid()),'different clubs with identical dates get distinct request IDs')
 // Fail closed on malformed/wrong-event REST rows; no fetch without authentication.
 const priorFetch=global.fetch;let calls=0
 global.fetch=async()=>{calls++;return {ok:true,json:async()=>[{...saved,event_id:uuid()}]}}
 await assert.rejects(()=>loadWinterStableSchedules(''),/ログイン/);assert.equal(calls,0)
 await assert.rejects(()=>loadWinterStableSchedules('token'),/Winter/)
 global.fetch=async()=>({ok:false});await assert.rejects(()=>loadWinterStableSchedules('token'),/取得できません/)
 await assert.rejects(()=>saveWinterStableSchedule({eventId:uuid()},'token'),/Winter/)
 global.fetch=priorFetch
 console.log('PASS: legacy/new Excel dates, serial/1904 times, missing/invalid dates, immutable source and old drafts, merged blanks, printed values, lost-response readback, retry/no duplicate fees, concurrent update, authenticated reads')
})().catch(error=>{console.error(error);process.exit(1)})
