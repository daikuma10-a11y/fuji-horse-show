require('./register-ts.cjs')
const assert=require('node:assert/strict'),fixture=require('./winter-application-fixture.cjs')
const {createApplicationDraft,readApplicationDraft,parseApplicationDraft,serializeApplicationDraft,persistApplicationDraft,applicationDraftKey}=require('../lib/winter-application-draft.ts')
const original=fixture(),draft=createApplicationDraft(original)
draft.edited.people[0].name='訂正後の合成選手';draft.paid='0';draft.reference='SYNTHETIC-1';draft.choices.r1='new'
assert.equal(original.people[0].name,'合成選手');assert.equal(draft.original.people[0].name,'合成選手')
assert.deepEqual(parseApplicationDraft(JSON.stringify(draft)),draft)
assert.deepEqual(parseApplicationDraft(serializeApplicationDraft(draft)),draft)
assert.equal(readApplicationDraft({...draft,accessToken:'synthetic-ignored'}).accessToken,undefined)
for(const bad of [
 {...draft,eventId:'Autumn'}, {...draft,version:99},{...draft,kind:'winter-import-registration'},
 {...draft,choices:{r1:'bad-id'}}, {...draft,choices:{missing:'new'}},
 {...draft,edited:{...draft.edited,digest:'b'.repeat(64)}},
 {...draft,edited:{...draft.edited,entries:[]}},
 {...draft,edited:{...draft.edited,clubOrigin:{...draft.edited.clubOrigin,value:'changed original'}}},
 {...draft,edited:{...draft.edited,issues:['changed source warning']}},
 {...draft,edited:{...draft.edited,people:draft.edited.people.map(p=>({...p,kind:'horse'}))}},
 {...draft,edited:{...draft.edited,people:[...draft.edited.people,draft.edited.people[0]]}}
])assert.throws(()=>readApplicationDraft(bad))
let saved=null;const storage={getItem:()=>saved,setItem:(_key,v)=>{saved=v}}
const first=persistApplicationDraft(storage,draft,null);assert.equal(saved,first);assert.equal(parseApplicationDraft(first).paid,'0')
const changed={...draft,paid:'100'};const second=persistApplicationDraft(storage,changed,first);assert.equal(parseApplicationDraft(second).paid,'100');assert.equal(parseApplicationDraft(second).edited.amounts.total,'19000')
assert.throws(()=>persistApplicationDraft(storage,draft,first),/別の確認/);assert.equal(saved,second)
assert.throws(()=>persistApplicationDraft({getItem:()=>null,setItem:()=>{throw Error('quota')}},draft,null),/quota/)
assert.throws(()=>persistApplicationDraft({getItem:()=>null,setItem(){}},draft,null),/端末保存/)
assert.match(applicationDraftKey(original.digest),new RegExp(original.eventId))
console.log('PASS: review checkpoint roundtrip, immutable original, payment separation, event/schema bounds, no credentials, concurrent-save conflict and storage failure')
