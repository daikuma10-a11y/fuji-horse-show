// Synthetic review data only. No live entries, roster records, payments or network.
require('./register-ts.cjs')
const assert=require('node:assert/strict'),Module=require('node:module'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {addApplicationCountEntry,removeApplicationAddition}=require('../lib/master/application-additions.ts')
const {reviewApplicationEntryCounts,applicationCountMessage}=require('../lib/master/application-entry-counts.ts')
const {applicationReview}=require('../lib/winter-application.ts')
const {createApplicationDraft,serializeApplicationDraft,parseApplicationDraft}=require('../lib/winter-application-draft.ts')
const {applicationRosterSignature,retainRosterPreparation}=require('../lib/winter-application-roster-stage.ts')
const fixture=require('./winter-application-fixture.cjs')
global.fetch=()=>{throw Error('Real network forbidden')}
const id='12345678-1234-4234-8234-123456789abc',key='障害!C22'
const app=fixture();app.entryCounts=[
 {key:'障害!C13',block:'障害!4',competition:'5',horseKeys:['h1'],entryKeys:[app.entries[0].key],membership:'sportsMember',buckets:[{kind:'member',origin:{sheet:'障害',cell:'U14',value:'1'}},{kind:'nonmember',origin:{sheet:'障害',cell:'Q14',value:'0'}}]},
 {key,block:'障害!4',competition:'12',horseKeys:['h1'],entryKeys:[],buckets:[{kind:'regular',origin:{sheet:'障害',cell:'Q22',value:'1'}},{kind:'op',origin:{sheet:'障害',cell:'U22',value:''}}]}
]
const before=JSON.stringify(app),baseFee=applicationReview(app,'0',true).report.entryFeeTotal
assert.match(applicationCountMessage(reviewApplicationEntryCounts(app).find(r=>r.key===key).buckets[0]),/Excel原本では出場者1名となっていますが、人馬の記載がありません/)
// Path A: fix the mistaken count without inventing an entry or touching fees/source.
const countOnly={...app,entryCountCorrections:{[key+':regular']:'0'}}
assert(reviewApplicationEntryCounts(countOnly).find(r=>r.key===key).buckets.every(b=>!b.reason))
assert.equal(countOnly.entries.length,1);assert.equal(applicationReview(countOnly,'0',true).report.entryFeeTotal,baseFee)
// Path B: an omitted rider/horse is attached to this exact count scope, then recalculated.
const added=addApplicationCountEntry(app,id,key,{rider:'r1',horse:'h1',op:false}),entry=added.entries.at(-1)
assert.deepEqual([entry.competition,entry.rider,entry.horse,entry.countBlock,entry.added],['12','r1','h1','障害!4',true])
assert.equal(applicationReview(added,'0',true).report.entryFeeTotal,baseFee+12000)
assert(reviewApplicationEntryCounts(added).find(r=>r.key===key).buckets.every(b=>!b.reason))
assert(reviewApplicationEntryCounts(added).find(r=>r.key===key).changed,'resolved addition stays visible for correction/undo')
assert.equal(JSON.stringify(app),before);assert.deepEqual(added.amounts,app.amounts,'reviewed claim amounts are not rewritten to force agreement')
assert.throws(()=>addApplicationCountEntry(added,'another',key,{rider:'r1',horse:'h1',op:false}),/すでにあります/)
for(const input of [{rider:'',horse:'h1',op:false},{rider:'h1',horse:'r1',op:false},{rider:'r1',horse:'unknown',op:false}])assert.throws(()=>addApplicationCountEntry(app,id,key,input),/選手と馬/)
assert.throws(()=>addApplicationCountEntry(app,id,'missing',{rider:'r1',horse:'h1',op:false}),/追加先/)
assert.throws(()=>addApplicationCountEntry(app,id,'障害!C13',{rider:'r1',horse:'h1',op:true}),/OP/)
assert.deepEqual(removeApplicationAddition(added,entry.key),app)
// Multiple pages of the same competition must stay distinct even for the same horse.
const copied=structuredClone(app);copied.entryCounts.push({...structuredClone(app.entryCounts[1]),key:'障害コピー!C22',block:'障害コピー!4'})
const copiedAdded=addApplicationCountEntry(copied,id,'障害コピー!C22',{rider:'r1',horse:'h1',op:false})
assert.equal(reviewApplicationEntryCounts(copiedAdded).find(r=>r.key===key).buckets[0].actual,0)
assert.equal(reviewApplicationEntryCounts(copiedAdded).find(r=>r.key==='障害コピー!C22').buckets[0].actual,1)
assert.match(reviewApplicationEntryCounts(copiedAdded).find(r=>r.key===key).scopeLabel,/申込欄1.*合成馬/)
const op=addApplicationCountEntry(app,id,key,{rider:'r1',horse:'h1',op:true})
assert.deepEqual(reviewApplicationEntryCounts(op).find(r=>r.key===key).buckets.map(b=>b.actual),[0,1])
const memberBase=structuredClone(app);memberBase.entries=[];memberBase.entryCounts[0].entryKeys=[]
const member=addApplicationCountEntry(memberBase,id,'障害!C13',{rider:'r1',horse:'h1',op:false})
assert.equal(reviewApplicationEntryCounts(member).find(r=>r.key==='障害!C13').buckets.find(b=>b.kind==='member').actual,1)
// The added entry survives checkpoints and leaves the prepared roster valid.
const draft=createApplicationDraft(app);draft.choices={r1:'new',h1:'new'};draft.rosterPreparation={signature:applicationRosterSignature(draft),corrections:{}}
const corrected=retainRosterPreparation({...draft,edited:added,accountChecked:false})
assert.deepEqual(corrected.rosterPreparation,draft.rosterPreparation)
const restored=parseApplicationDraft(serializeApplicationDraft(corrected));assert.deepEqual(restored,corrected);assert.equal(restored.edited.entries.at(-1).key,entry.key);assert.deepEqual(restored.original,app)

// Exercise actual inline handlers with state: incomplete selection, rejection, success, edit, undo and lock.
let values=[],index=0;const hooks={useState(initial){const i=index++;values[i]??={value:initial};return [values[i].value,v=>{values[i].value=typeof v==='function'?v(values[i].value):v}]}}
const originalLoad=Module._load;Module._load=function(name,...args){return name==='react'?{...React,...hooks}:originalLoad.call(this,name,...args)}
const {MasterApplicationCountReview,ApplicationCountEntryAdder}=require('../components/master/application-count-review.tsx')
const nodes=t=>Array.isArray(t)?t.flatMap(nodes):!t||typeof t!=='object'?[]:[t,...nodes(t.props?.children)]
const row=reviewApplicationEntryCounts(app).find(r=>r.key===key),calls=[]
let reject=false;const adderProps={row,people:app.people,disabled:false,onAdd:(...args)=>{calls.push(args);return reject?'合成の追加エラー':undefined}}
const renderAdder=props=>{index=0;return ApplicationCountEntryAdder(props??adderProps)}
let tree=renderAdder();assert(nodes(tree).find(n=>n.type==='button').props.disabled)
for(const [label,value] of [['選手','r1'],['馬','h1']]){nodes(tree).find(n=>n.type==='select'&&n.props['aria-label']===key+' 追加する'+label).props.onChange({target:{value}});tree=renderAdder()}
assert(!nodes(tree).find(n=>n.type==='button').props.disabled)
reject=true;nodes(tree).find(n=>n.type==='button').props.onClick();tree=renderAdder();assert(nodes(tree).some(n=>n.props?.role==='alert'));assert.equal(nodes(tree).find(n=>n.type==='select').props.value,'r1')
reject=false;nodes(tree).find(n=>n.type==='button').props.onClick();tree=renderAdder();assert.deepEqual(calls.at(-1),[key,{rider:'r1',horse:'h1',op:false}]);assert(nodes(tree).some(n=>n.props?.role==='status'));assert.equal(nodes(tree).find(n=>n.type==='select').props.value,'')
const count=calls.length;nodes(renderAdder({...adderProps,disabled:true})).find(n=>n.type==='button').props.onClick();assert.equal(calls.length,count)
values=[];index=0
const changes=[],countProps={rows:reviewApplicationEntryCounts(added),people:added.people,entries:added.entries,competitions:[{number:'12',name:'フジ中障害飛越競技A'}],disabled:false,onChange:()=>{},onAddEntry:adderProps.onAdd,onEntry:(...args)=>changes.push(args),onRemoveEntry:key=>changes.push(key)}
const html=renderToStaticMarkup(React.createElement(MasterApplicationCountReview,countProps))
assert(html.includes('第12競技 ／ フジ中障害飛越競技A'));assert(html.includes('人馬の書き忘れの場合'));assert(!html.includes('障害!Q22'));assert(!html.includes('／ 障害!C22'))
const controls=nodes(MasterApplicationCountReview(countProps))
controls.find(n=>n.type==='select'&&n.props['aria-label']===key+' '+entry.key+' 馬').props.onChange({target:{value:'h1'}});assert.deepEqual(changes.pop(),[entry.key,{horse:'h1'}])
controls.find(n=>n.type==='button'&&n.props.children==='追加した出場者を取り消す').props.onClick();assert.equal(changes.pop(),entry.key)
for(const n of nodes(MasterApplicationCountReview({...countProps,disabled:true})).filter(n=>n.type==='fieldset'))assert(n.props.disabled)
Module._load=originalLoad
console.log('PASS: count-only vs omitted-entry corrections; exact page/competition binding; recalculated fees and OP/member counts; duplicate guard; original/checkpoint preservation; prepared roster retained; inline add/edit/undo/lock; readable competition names and no source coordinates')
