require('./register-ts.cjs')
const assert=require('node:assert/strict')
const fixture=require('./winter-application-fixture.cjs')
const {kanaHorseReading,jefRiderQualification,autofillApplicationPerson}=require('../lib/master/application-autofill.ts')
const {createApplicationDraft,autofillApplicationDraft,serializeApplicationDraft,parseApplicationDraft}=require('../lib/winter-application-draft.ts')
const {loadJefRiderQualifications}=require('../lib/jef-rider-qualifications.ts')
for(const name of ['サムライブルー','さくら','さくらブルー','ヴィーナス・ブルー','サクラ ブルー'])assert.equal(kanaHorseReading(name),name)
assert.equal(kanaHorseReading('ｻｸﾗﾌﾞﾙｰ'),'サクラブルー')
for(const name of ['桜ブルー','Sakura','サクラ2','ー・ ','123',''])assert.equal(kanaHorseReading(name),'')
const app=fixture();app.people[1].name='サクラブルー';app.people[1].reading='';app.people[0].jef='１２３';app.people[0].grade='B'
const draft=createApplicationDraft(app)
assert.equal(draft.original.people[1].reading,'');assert.equal(draft.edited.people[1].reading,'サクラブルー');assert.equal(app.people[1].reading,'')
assert.equal(autofillApplicationPerson({...draft.edited.people[1],reading:'さくらぶるう'},[]).reading,'さくらぶるう','explicit reading is retained')
const changedName=autofillApplicationPerson({...draft.edited.people[1],name:'さくら'},[]);assert.equal(changedName.reading,'さくら')
assert.equal(autofillApplicationPerson({...draft.edited.people[1],name:'桜'},[]).reading,'','old inferred reading does not follow another name')
const row={member_no:'123',name:'合成 選手',rider_grade:'Ａ級',import_date:'2026-10-23'}
const rows=[{...row,rider_grade:'B',import_date:'2025-01-01'},row]
const filled=autofillApplicationDraft({...draft,accountChecked:true},rows)
assert.equal(filled.original.people[0].grade,'B');assert.equal(filled.edited.people[0].grade,'A');assert.equal(filled.accountChecked,false)
assert.equal(filled.edited.people[0].gradeAutofill.importDate,'2026-10-23');assert.deepEqual(filled.choices,{})
assert.deepEqual(parseApplicationDraft(serializeApplicationDraft(filled)),filled,'provenance and automatic readings survive a checkpoint')
const person=filled.edited.people[0]
assert.equal(autofillApplicationPerson({...person,grade:'C',gradeManual:true},rows).grade,'C','explicit correction is retained')
const other=autofillApplicationPerson({...person,jef:'456'},rows);assert.equal(other.grade,'');assert.equal(other.gradeAutofill,undefined)
assert.equal(jefRiderQualification(person,[{...row,name:'別の選手'}]).grade,'','number without matching name cannot fill')
assert.equal(jefRiderQualification(person,[{...row,member_no:'456'}]).grade,'','name alone cannot fill')
assert.equal(jefRiderQualification(person,[row,{...row,rider_grade:'B'}]).grade,'','conflicting current records cannot fill')
for(const grade of ['B(D)','B級／馬場馬術限定',null,'未登録'])assert.equal(jefRiderQualification(person,[{...row,rider_grade:grade}]).grade,'','no guessed unrestricted grade')
assert.equal(jefRiderQualification(person,[...rows,{...row,import_date:'2026-10-24',rider_grade:null}]).grade,'','do not reuse older grade after latest blank')
assert.equal(autofillApplicationPerson(person,[{...row,rider_grade:'B(D)'}]).grade,'','remove old autofill when a newer record cannot confirm it')
assert.equal(autofillApplicationDraft(filled,rows),filled,'unchanged reread preserves confirmations')
let calls=0
global.fetch=async(url,options)=>{
 calls++;const u=new URL(url);assert.equal(u.pathname,'/rest/v1/jef_rider_master');assert.equal(u.searchParams.get('member_no'),'in.(123)');assert.equal(u.searchParams.get('select'),'member_no,name,rider_grade,import_date');assert.equal(options.method,'GET');assert.equal(options.headers.Authorization,'Bearer synthetic-token');assert.equal(options.body,undefined)
 return {ok:true,json:async()=>[row]}
}
;(async()=>{
 assert.deepEqual(await loadJefRiderQualifications(['１２３','123','bad),id.*'], 'synthetic-token'),[row]);assert.equal(calls,1)
 assert.deepEqual(await loadJefRiderQualifications([], 'synthetic-token'),[]);assert.equal(calls,1)
 await assert.rejects(loadJefRiderQualifications(['123'],''),/ログイン/)
 global.fetch=async()=>({ok:true,json:async()=>[{...row,member_no:'456'}]});await assert.rejects(loadJefRiderQualifications(['123'],'synthetic-token'),/形式/)
 global.fetch=async()=>({ok:false});await assert.rejects(loadJefRiderQualifications(['123'],'synthetic-token'),/取得/)
 console.log('PASS: kana-only horse readings, source preservation, dated number/name qualification matching, conflict/limited-grade rejection, manual edits, checkpoint provenance and bounded authenticated GET (synthetic data)')
})().catch(e=>{console.error(e);process.exitCode=1})
