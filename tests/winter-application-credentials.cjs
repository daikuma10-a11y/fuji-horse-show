require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {setup}=require('./winter-application-registration-fixture.cjs')
const {runApplicationRegistration:run,reviewApplicationRegistration:review,parseApplicationRegistration,serializeApplicationRegistration}=require('../lib/winter-application-registration.ts')
const {credentialReviewUpgrade}=require('../lib/winter-credential-review-upgrade.ts')
const {horseDeclaration}=require('../lib/master/application-credentials.ts')
const {extractWinterApplication}=require('../lib/winter-application.ts')
global.fetch=()=>{throw Error('Unexpected network call')}
async function main(){
 assert.equal(horseDeclaration('Ｓ・中Ａ・中Ｂ・中Ｃ・中Ｄ・未'),'')
 assert.equal(horseDeclaration(' 中Ｂ '),'中B')
 // Actual form coordinates, hand-authored synthetic values; the original workbook is never committed.
 const cell=value=>({value}),book={sheets:[
  {name:'選手名簿',cells:{A2:cell('選手名簿'),A6:cell('1'),B7:cell('合成選手'),E6:cell('Ａ級'),C10:cell('団体名'),D10:cell('合成団体')}},
  {name:'馬匹名簿',cells:{H1:cell('馬匹名簿'),A5:cell('1'),B6:cell('合成馬'),C5:cell('12345'),C7:cell('中Ｂ')}},
  {name:'申込集計書',cells:{A1:cell('2026 Winter Grand Prix'),A2:cell('申込集計書')}},
  {name:'障害',cells:{D10:cell('種目'),E10:cell('馬名')}},
 ]}
 const app=extractWinterApplication(book,'synthetic.xlsx','a'.repeat(64));assert.equal(app.people[0].grade,'A');assert.equal(app.people[1].horseGrade,'中B');assert.equal(app.people[1].credentialOrigin.cell,'C7')
 const e=setup();e.work.review.original.people[1].horseGrade='中B';e.work.review.edited.people[1].horseGrade='中B'
 const done=await run(e.work,e.deps);assert.equal(e.credentialPosts,2);assert.equal((await review(done,e.snapshot)).credentialsComplete,true)
 const count=e.posts.entry;await run(done,e.deps);assert.equal(e.credentialPosts,2);assert.equal(e.posts.entry,count)
 assert.deepEqual(parseApplicationRegistration(serializeApplicationRegistration(done)),done)
 // A registered entry still offers credential saving when an older import omitted the values.
 e.snapshot.credentials=[];const legacy=structuredClone(done);delete legacy.credentials
 const plan=await review(legacy,e.snapshot);assert(plan.ready);assert(!plan.credentialsComplete);assert(plan.entries.rows.every(r=>r.state==='registered'))
 await run(legacy,e.deps={...e.deps,persist:v=>{e.stored=structuredClone(v)}});assert.equal(e.posts.entry,count);assert.equal(e.credentialPosts,4)
 // Re-reading the original after an old completed import reveals the newly supported field.
 const older=structuredClone(done);delete older.credentials;delete older.review.original.people[1].horseGrade;delete older.review.edited.people[1].horseGrade
 const actual=structuredClone(older.review.original);actual.people[1].horseGrade='中B';actual.people[1].credentialOrigin={sheet:'馬匹名簿',cell:'C7',value:'中Ｂ'}
 const upgraded=credentialReviewUpgrade(actual,older.review,older);assert(upgraded);assert.equal(upgraded.edited.people[1].horseGrade,'中B');assert.equal(upgraded.accountChecked,false);assert.notEqual(upgraded.reference,older.review.reference);assert.equal(upgraded.choices.r1,older.people.r1.entityId);assert.equal(older.review.original.people[1].horseGrade,undefined)
 older.entries.states[Object.keys(older.entries.states)[0]]='unknown';assert.equal(credentialReviewUpgrade(actual,older.review,older),null,'unfinished imports stay on the original resume path')
 // Blank declarations preserve the stored value.
 const blank=structuredClone(legacy);blank.review.edited.people[1].horseGrade='';blank.review.reference+='-BLANK';blank.entries=null;delete blank.credentials
 const blankPlan=await review(blank,e.snapshot);assert.equal(blankPlan.credentials.find(c=>c.kind==='horse').previous,'中B');assert.equal(blankPlan.credentials.find(c=>c.kind==='horse').value,'')
 await run(blank,e.deps);assert.equal(e.snapshot.credentials.find(c=>c.kind==='horse').value,'中B');assert.equal(e.posts.entry,count)
 // Lost acknowledgement, then readback: no duplicate POST and no duplicate entry.
 const lost=setup(),save=lost.deps.saveCredential;lost.deps.saveCredential=async input=>{await save(input);throw Error('lost credential reply')}
 await assert.rejects(run(lost.work,lost.deps),/lost credential reply/);assert.equal(lost.credentialPosts,1);assert.equal(lost.posts.entry,0)
 lost.deps.saveCredential=save;await run(lost.stored,lost.deps);assert.equal(lost.credentialPosts,1);assert.equal(lost.posts.entry,1)
 // A newer declaration after the first request cannot be overwritten by an old checkpoint.
 const stale=structuredClone(lost.stored);lost.snapshot.credentials[0].value='A';lost.snapshot.credentials[0].request_id='f'.repeat(64)
 await assert.rejects(run(stale,lost.deps),/資格・グレードが変わって/);assert.equal(lost.credentialPosts,1)
 // Same submitted source cannot change its frozen expectation; missing legacy fields remain absent.
 const old=setup().work;assert(!('credentials' in parseApplicationRegistration(serializeApplicationRegistration(old))))
 const invalid=setup();invalid.work.review.edited.people[1].horseGrade='S・中A・中B';assert(!(await review(invalid.work,invalid.snapshot)).ready)
 console.log('PASS: form grade cells/placeholder, rider+horse persistence, existing-entry metadata-only save, blank preservation, lost response readback, stale checkpoint guard, legacy JSON compatibility')
}
main().catch(e=>{console.error(e);process.exitCode=1})
