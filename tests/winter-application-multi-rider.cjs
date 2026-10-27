// Synthetic workbook and in-memory registration only. No real names, files or database writes.
require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {extractWinterApplication,applicationReview,rosterCandidates}=require('../lib/winter-application.ts')
const {splitApplicationRiders}=require('../lib/master/application-entry-input.ts')
const {addApplicationEntry,addApplicationPerson,removeApplicationAddition}=require('../lib/master/application-additions.ts')
const {createApplicationDraft,readApplicationDraft,serializeApplicationDraft,parseApplicationDraft}=require('../lib/winter-application-draft.ts')
const {createApplicationRegistration,serializeApplicationRegistration,parseApplicationRegistration,runApplicationRegistration}=require('../lib/winter-application-registration.ts')
const {setup,uuid}=require('./winter-application-registration-fixture.cjs')
const fixture=require('./winter-application-fixture.cjs')
global.fetch=()=>{throw Error('No live network')}
const sheet=(name,values)=>({name,hidden:false,cells:Object.fromEntries(Object.entries(values).map(([key,value])=>[key,{value:String(value)}]))})
const riders={A2:'選手名簿',C76:'団体名',D76:''},horses={H1:'馬匹名簿'}
for(let i=1;i<=6;i++){const row=i*3;riders['A'+row]=i;riders['B'+(row+1)]='合成選手'+i;riders['E'+row]='未登録'}
for(let i=1;i<=5;i++){const row=i*3;horses['A'+row]=i;horses['B'+(row+1)]='合成馬'+i}
const jump={D4:'種目',E4:'馬名',J4:'合成馬1号',K4:'合成馬2号',L4:'合成馬3号',M4:'合成馬4号',N4:'合成馬5号'}
for(const [row,competition] of [[9,'1'],[12,'4'],[29,'21'],[32,'24']]){
 jump['C'+row]=competition
 if(['1','21'].includes(competition)){jump['J'+row]='合成選手1・合成選手2';jump['M'+row]='合成選手3・合成選手4';jump['N'+row]='合成選手5＝OP・合成選手6'}
 else {jump['K'+row]='合成選手5=OP・合成選手1';jump['L'+row]='合成選手5=OP・合成選手3'}
}
const book={sheets:[sheet('選手名簿',riders),sheet('馬匹名簿',horses),sheet('障害',jump),sheet('申込集計書',{A1:'2026 Fuji Horse Show Winter Grand Prix',A2:'申込集計書',F6:70000,F7:170000,F8:0,F10:240000})]}
const app=extractWinterApplication(book,'synthetic-multiple.xlsx','b'.repeat(64))
assert.equal(app.entries.length,20);assert.equal(app.entries.filter(e=>e.op).length,6)
assert(app.entries.every(e=>e.rider&&e.horse));assert.equal(new Set(app.entries.map(e=>e.key)).size,20)
assert.equal(app.entries[0].origin.cell,app.entries[1].origin.cell);assert.equal(app.entries[0].rawRider,'合成選手1')
app.club='合成クラブ';const review=applicationReview(app,'0',true)
assert.equal(review.report.entryFeeTotal,170000);assert.equal(review.amounts.find(a=>a.key==='total').calculated,240000)
assert.equal(review.ready,true)
assert.deepEqual(splitApplicationRiders('外国・選手',['外国・選手']).map(x=>x.name),['外国・選手'])
assert.deepEqual(splitApplicationRiders('姓 名\n(別 選手)／追加選手',[]).map(x=>[x.name,x.op]),[['姓 名',false],['別 選手',true],['追加選手',false]])

let draft=createApplicationDraft(fixture());const original=JSON.stringify(draft.original)
draft.edited=addApplicationEntry(draft.edited,uuid(),draft.edited.entries[0].key)
const added=draft.edited.entries[1];assert.equal(added.rider,'');assert.equal(added.horse,'h1');assert.equal(added.op,false)
draft.edited=addApplicationPerson(draft.edited,'rider',uuid());const addedPerson=draft.edited.people.at(-1)
Object.assign(addedPerson,{name:'追加合成選手',reading:'ついかごうせいせんしゅ',grade:'未登録',sportsMember:'会員'})
added.rider=addedPerson.key
draft.edited.amounts.jump='10000';draft.edited.amounts.total='24000';draft.paid='0';draft.accountChecked=true
draft.choices=Object.fromEntries(draft.edited.people.map(p=>[p.key,'new']))
assert.deepEqual(parseApplicationDraft(serializeApplicationDraft(draft)),draft)
assert.equal(JSON.stringify(draft.original),original);assert.equal(applicationReview(draft.edited,'0',true).ready,true)
const forged=structuredClone(draft);forged.edited.entries[0].added=true;assert.throws(()=>readApplicationDraft(forged))
const badOrigin=structuredClone(draft);badOrigin.edited.entries[1].origin.cell='J99';assert.throws(()=>readApplicationDraft(badOrigin))
const missing=structuredClone(draft);missing.edited.entries.shift();assert.throws(()=>readApplicationDraft(missing))
const removed=removeApplicationAddition(draft.edited,addedPerson.key);assert.equal(removed.entries[1].rider,'');assert.equal(removed.people.length,2)
assert.throws(()=>removeApplicationAddition(draft.edited,'r1'))

// The club is a ranking hint, never a filter. Name and number searches work without it.
const roster={entities:[{id:uuid(),kind:'rider',name:'合成選手',reading:'ごうせいせんしゅ',jef_number:'900000',archived_at:null},{id:uuid(),kind:'horse',name:'別表記馬',reading:'うま',jef_number:'900001',archived_at:null}],clubs:[],affiliations:[],participants:[]}
assert.equal(rosterCandidates(draft.edited.people[0],roster,'').length,1)
assert.equal(rosterCandidates({...draft.edited.people[1],jef:'900001'},roster,'').length,1)

;(async()=>{
 const env=setup()
 // Existing identities selected explicitly; preserve the original workbook through final confirmation/retry.
 for(const p of draft.edited.people)draft.choices[p.key]=env.addPerson({kind:p.kind,name:p.name,reading:p.reading,jefNumber:p.jef,clubName:draft.edited.club})
 const work=createApplicationRegistration(draft)
 assert.deepEqual(parseApplicationRegistration(serializeApplicationRegistration(work)),work)
 const result=await runApplicationRegistration(work,env.deps)
 assert.equal(env.posts.entry,2);assert.equal(env.snapshot.initial.reduce((n,x)=>n+x.entry_fee,0),10000)
 await runApplicationRegistration(parseApplicationRegistration(env.raw),env.deps)
 assert.equal(env.posts.entry,2,'retry never adds the manual entry twice');assert.deepEqual(result.review.original,JSON.parse(original))
 console.log('PASS: 20 entries / 6 OP / 170000 entry fees; multi-rider separators; source-preserving manual rows; draft and registration roundtrips; number/name candidates without club; fee checks and idempotent registration in memory')
})().catch(e=>{console.error(e);process.exitCode=1})
