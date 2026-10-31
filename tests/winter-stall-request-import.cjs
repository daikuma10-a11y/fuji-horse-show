require('./register-ts.cjs')
const assert=require('node:assert/strict'),{setup}=require('./winter-application-registration-fixture.cjs')
const {runApplicationRegistration,reviewApplicationRegistration,readApplicationRegistration}=require('../lib/winter-application-registration.ts')
const {stallRequestReviewUpgrade}=require('../lib/winter-stall-request-upgrade.ts')
const {emptyStallRequest}=require('../lib/master/stall-request.ts')
;(async()=>{
 const env=setup();env.snapshot.stallRequests=[]
 const original='４番厩舎が良い。隣接はメールで連絡します。'
 for(const app of [env.work.review.original,env.work.review.edited]){app.stallRequest=original;app.stallRequestOrigins=[{sheet:'集計',cell:'C20',value:original}]}
 let posts=0
 env.deps.saveStallRequest=async input=>{
  posts++;assert.ok(env.stored.stallRequest,'persist expectation before request')
  const old=env.snapshot.stallRequests.find(r=>r.organization_id===input.organizationId)
  assert.equal(old?.request_id??null,input.expected)
  env.snapshot.stallRequests=[{event_id:input.eventId,organization_id:input.organizationId,request_id:input.requestId,value:structuredClone(input.value),confirmed_at:'2026-10-31T00:00:00Z'}]
  throw Error('response lost after server commit')
 }
 const finished=await runApplicationRegistration(env.work,env.deps)
 assert.equal(posts,1);assert.equal(env.snapshot.stallRequests[0].value.imports[0].text,original)
 assert.equal((await reviewApplicationRegistration(finished,env.snapshot)).stallRequest.complete,true)
 await runApplicationRegistration(finished,env.deps);assert.equal(posts,1)
 const legacy=structuredClone(finished);for(const app of [legacy.review.original,legacy.review.edited]){delete app.stallRequest;delete app.stallRequestOrigins}
 const upgraded=stallRequestReviewUpgrade(finished.review.original,legacy.review,legacy)
 assert.equal(upgraded.edited.stallRequest,original);assert.ok(upgraded.reference.startsWith('WINTER-STALL-REQUESTS-'));assert.equal(upgraded.choices.r1,legacy.people.r1.entityId);assert.equal(legacy.review.original.stallRequest,undefined)
 assert.equal(stallRequestReviewUpgrade(finished.review.original,legacy.review,{...legacy,entries:null}),null)
 const raw=JSON.parse(JSON.stringify(finished));raw.review.edited.stallRequest='原文改変';assert.throws(()=>readApplicationRegistration(raw),/確認/)
 // A new Excel original appends to the saved request, including a manual adjustment.
 const next=setup();next.snapshot.stallRequests=[]
 for(const app of [next.work.review.original,next.work.review.edited]){app.stallRequest='S厩舎希望';app.stallRequestOrigins=[]}
 const publish=next.deps.saveParticipants
 next.deps.saveParticipants=async(...args)=>{await publish(...args)}
 next.deps.saveStallRequest=async input=>{next.snapshot.stallRequests=[{event_id:input.eventId,organization_id:input.organizationId,request_id:input.requestId,value:input.value,confirmed_at:'2026-10-31T00:00:00Z'}];return input.requestId}
 // Stale data between confirmed review and run must stop before any participant mutation.
 const stale=setup();for(const app of [stale.work.review.original,stale.work.review.edited])app.stallRequest='4番厩舎希望'
 stale.snapshot.stallRequests=[]
 const before=await reviewApplicationRegistration(stale.work,stale.snapshot)
 stale.work.stallRequest=before.stallRequest.expectation
 stale.snapshot.data.organizations.push({id:'00000000-0000-4000-8000-123456789012',name:stale.work.review.edited.club,event_id:stale.work.eventId})
 stale.snapshot.stallRequests.push({event_id:stale.work.eventId,organization_id:stale.snapshot.data.organizations[0].id,request_id:'f'.repeat(64),value:{...emptyStallRequest(),manual:'メールによる変更'}})
 await assert.rejects(()=>runApplicationRegistration(stale.work,stale.deps),/別の操作/)
 assert.equal(stale.posts.person,0)
 console.log('PASS: real import runner/checkpoint, raw request preservation, commit-response loss readback, repeat import no duplicate, immutable original, concurrent edit stops before writes')
})().catch(e=>{console.error(e);process.exitCode=1})
