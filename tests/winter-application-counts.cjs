// Synthetic source cells only. No participant records, original workbooks or network calls.
require('./register-ts.cjs')
const assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {extractWinterApplication,applicationReview,applicationSource,applicationDifferences}=require('../lib/winter-application.ts')
const {createApplicationDraft,serializeApplicationDraft,parseApplicationDraft}=require('../lib/winter-application-draft.ts')
const {upgradeApplicationCounts}=require('../lib/winter-application-count-upgrade.ts')
const {reviewApplicationEntryCounts,applicationEntryCountAssignments,entryCountKey,applicationEntriesByHorse}=require('../lib/master/application-entry-counts.ts')
const {addApplicationEntry}=require('../lib/master/application-additions.ts')
const {applicationTodos}=require('../lib/winter-application-guide.ts')
const {MasterApplicationCountReview}=require('../components/master/application-count-review.tsx')
const {MasterApplicationReviewField}=require('../components/master/application-review-row.tsx')
const {setup}=require('./winter-application-registration-fixture.cjs')
const {createApplicationRegistration,runApplicationRegistration,reviewApplicationRegistration}=require('../lib/winter-application-registration.ts')
global.fetch=()=>{throw Error('Real network prohibited')}
const clone=structuredClone
const sheet=(name,values)=>({name,hidden:false,cells:Object.fromEntries(Object.entries(values).map(([cell,value])=>[cell,{value:String(value)}]))})
const book=()=>({sheets:[
 sheet('選手名簿',{A2:'選手名簿',A6:1,B6:'テストセンシュ',B7:'合成 選手',D6:'900001',E6:'A',C76:'団体名',D76:'合成クラブ'}),
 sheet('馬匹名簿',{H1:'馬匹名簿',A5:1,B5:'ゴウセイウマイチ',B6:'合成馬1',C5:'900002',A8:2,B8:'ゴウセイウマニ',B9:'合成馬2',C8:'900003'}),
 sheet('障害',{D4:'種目',E4:'馬名',J4:'合成馬1号',O4:'料 金',W4:'小 計',C33:26,O33:12000,Q33:1,W33:12000,
  D51:'種目',E51:'馬名',J51:'合成馬2号',O51:'料 金',W51:'小 計',C84:30,J84:'合成 選手',O84:12000,W84:0}),
 sheet('申込集計書',{A1:'2026 Fuji Horse Show Winter Grand Prix',A2:'申込集計書',F6:28000,F7:12000,F8:0,F10:40000})
]})
const parse=b=>extractWinterApplication(b,'synthetic-counts.xlsx','c'.repeat(64))
const raw=parse(book()),app=clone(raw);app.people.forEach(p=>p.checked=true)
assert.equal(app.entries.length,1,'a count without a rider never invents an entry')
assert.equal(app.entryCounts.length,2)
let review=applicationReview(app,'0',true)
assert(review.amounts.every(a=>!a.reason),'the total passes despite the deliberate 26/30 offset')
assert.equal(review.countIssues.length,2);assert.equal(review.ready,false)
assert.match(review.countIssues[0],/障害!Q33・第26競技.*集計欄1名.*出場者0名/)
assert.match(review.countIssues[1],/障害!Q84・第30競技.*集計欄0名.*出場者1名.*入力漏れ/)
const draft=createApplicationDraft(app);draft.paid='0';draft.accountChecked=true;draft.choices={r1:'new',h1:'new',h2:'new'}
assert.equal(applicationTodos(draft,true).filter(t=>t.target.startsWith('application-count-')).length,2)
assert(applicationTodos(draft,true).some(t=>t.target.startsWith('application-entry-')&&t.fields.includes('fee')))
draft.edited.entryCountCorrections={'障害!C33:regular':'0','障害!C84:regular':'1'}
assert.equal(applicationReview(draft.edited,'0',true).ready,true)
assert.deepEqual(parseApplicationDraft(serializeApplicationDraft(draft)),draft)
assert.equal(draft.original.entryCounts[0].buckets[0].origin.value,'1','source count kept as submitted')
assert.equal(draft.original.entryCounts[1].buckets[0].origin.value,'','omitted source count kept empty')
for(const bad of ['-1','1.5','abc','5001']){const copy=clone(draft);copy.edited.entryCountCorrections['障害!C84:regular']=bad;assert.equal(applicationReview(copy.edited,'0',true).ready,false)}
for(const tamper of [d=>d.edited.entryCounts[0].buckets[0].origin.value='0',d=>d.edited.entryCounts=[],d=>d.edited.entryCountCorrections.unknown='1',d=>d.original.entryCountCorrections={}]){const copy=clone(draft);tamper(copy);assert.throws(()=>serializeApplicationDraft(copy),/確認できません/)}
const revised=parse(book());revised.entryCounts[0].buckets[0].origin.value='0';assert(applicationDifferences(raw,revised).some(d=>d.location.includes('Q33')))

// The source sheet/block is part of the identity: even the same competition cannot net off.
const same=book();same.sheets[2].cells.C84.value='26';const sameApp=parse(same)
assert.equal(reviewApplicationEntryCounts(sameApp).flatMap(r=>r.buckets.filter(b=>b.reason)).length,2)
const copied=book();copied.sheets[2].cells.C84.value='26';copied.sheets[2].cells.Q84={value:'1'}
copied.sheets.push(sheet('コピー障害',{D4:'種目',E4:'馬名',J4:'合成馬1号',O4:'料金',W4:'小計',C33:26,Q33:1}))
assert.equal(reviewApplicationEntryCounts(parse(copied)).filter(r=>r.buckets.some(b=>b.reason)).length,2)

// A split cell is counted once per rider; OP is counted separately.
const multiple=book();Object.assign(multiple.sheets[2].cells,{C33:{value:'1'},J33:{value:'合成 選手・OP:別 選手'},Q33:{value:'1'},U33:{value:'1'}})
let multi=parse(multiple),row=reviewApplicationEntryCounts(multi).find(r=>r.competition==='1')
assert.deepEqual(row.buckets.map(b=>b.actual),[1,1]);assert(row.buckets.every(b=>!b.reason));assert.equal(row.names.length,2)
multi.entryCountCorrections={'障害!C33:regular':'2','障害!C33:op':'0'}
assert.equal(reviewApplicationEntryCounts(multi).find(r=>r.competition==='1').buckets.filter(b=>b.reason).length,2)
multi=addApplicationEntry(parse(multiple),'11111111-1111-4111-8111-111111111111',parse(multiple).entries[0].key)
multi.entries.find(e=>e.added).rider='r1';row=reviewApplicationEntryCounts(multi).find(r=>r.competition==='1');assert.equal(row.buckets[0].actual,2)
multi.entries.find(e=>e.added).competition='26';assert.equal(reviewApplicationEntryCounts(multi).find(r=>r.competition==='1').buckets[0].actual,1)

// Standalone manual rows must select a block when the same horse/competition occurs twice.
const ambiguousBook=book();ambiguousBook.sheets[2].cells.C84.value='26';ambiguousBook.sheets[2].cells.J51.value='合成馬1号'
const ambiguousBase=parse(ambiguousBook),ambiguous=addApplicationEntry(ambiguousBase,'22222222-2222-4222-8222-222222222222')
const manual=ambiguous.entries.find(e=>e.added);Object.assign(manual,{competition:'26',horse:'h1',rider:'r1'})
assert.match(applicationEntryCountAssignments(ambiguous).get(manual.key).reason,/集計欄/)
manual.countBlock='障害!4';assert.equal(applicationEntryCountAssignments(ambiguous).get(manual.key).reason,'');assert.equal(reviewApplicationEntryCounts(ambiguous).find(r=>r.key==='障害!C33').buckets[0].actual,1)
const manualDraft=createApplicationDraft(ambiguousBase);manualDraft.edited=ambiguous
assert.equal(parseApplicationDraft(serializeApplicationDraft(manualDraft)).edited.entries.find(e=>e.added).countBlock,'障害!4')
manual.countBlock='unknown';assert.throws(()=>serializeApplicationDraft(manualDraft),/確認できません/)

// Member count cells are below the label row; the member column is not OP.
for(const competition of ['5','8','25']){
 const b=book();Object.assign(b.sheets[2].cells,{C33:{value:competition},J33:{value:'合成 選手'},O33:{value:'非会員'},S33:{value:'会員'},Q34:{value:'0'},U34:{value:'1'}})
 const a=parse(b);a.people[0][competition==='8'?'instructorMember':'sportsMember']='会員';const r=reviewApplicationEntryCounts(a).find(r=>r.competition===competition)
 assert.deepEqual(r.buckets.map(b=>[b.origin.cell,b.actual,b.reason]),[['Q34',0,''],['U34',1,'']])
}
const dressage=book();dressage.sheets.push(sheet('馬場',{D3:'馬　　　　　名',F3:'合成馬1号',K3:'料金',W3:'小計',C4:15,F4:'合成 選手',M4:1,C9:32,F9:'合成 選手',K9:'非会員',O9:'会員',S9:'会員',M10:0,Q10:1,U10:0}))
const da=parse(dressage);da.people[0].instructorMember='会員'
assert(reviewApplicationEntryCounts(da).filter(r=>['15','32'].includes(r.competition)).every(r=>r.buckets.every(b=>!b.reason)))
assert.deepEqual(da.entryCounts.find(r=>r.competition==='32').buckets.map(b=>b.origin.cell),['M10','Q10','U10'])
const formula=book();formula.sheets[2].cells.Q84={value:'0',formula:'SUM(A1:A2)'};assert.match(reviewApplicationEntryCounts(parse(formula))[1].buckets[0].reason,/出場者1名/)

// Horse sorting is a pure view: source indexes, TSV order, entry IDs and prices stay attached.
const sorted=clone(app);sorted.entries.push({...sorted.entries[0],key:'extra',horse:'h1'});const before=JSON.stringify(sorted),sourceBefore=applicationSource(sorted,'0',true)
assert.deepEqual(applicationEntriesByHorse(sorted).map(r=>r.sourceIndex),[1,0]);assert.equal(JSON.stringify(sorted),before);assert.deepEqual(applicationSource(sorted,'0',true),sourceBefore)

// Older drafts acquire count cells only by reading the identical workbook, retaining edits.
const old=createApplicationDraft(raw);delete old.original.entryCounts;delete old.edited.entryCounts;old.edited.people[0].name='訂正済み選手';old.edited.entries[0].op=true
const upgraded=upgradeApplicationCounts(old,raw);assert.equal(upgraded.edited.people[0].name,'訂正済み選手');assert.equal(upgraded.edited.entries[0].op,true);assert.deepEqual(upgraded.original.entryCounts,raw.entryCounts)
assert.equal(upgradeApplicationCounts(old,raw,true),null);assert.equal(upgradeApplicationCounts(upgraded,raw),null);assert.equal(upgradeApplicationCounts(old,{...raw,digest:'d'.repeat(64)}),null)
assert.equal(old.original.entryCounts,undefined)

// Explain the discrepancy before edits; the source coordinates remain in the immutable record only.
let edits=[];const props={rows:review.entryCounts,disabled:false,competitions:[{number:'26',name:'フジウィンターグランプリ'},{number:'30',name:'フジ中障害飛越競技Dファイナル'}],onChange:(...args)=>edits.push(args)}
const html=renderToStaticMarkup(React.createElement(MasterApplicationCountReview,props))
for(const text of ['競技ごとの集計人数の照合','第26競技 ／ フジウィンターグランプリ','第30競技 ／ フジ中障害飛越競技Dファイナル','Excel原本では出場者1名となっていますが、人馬の記載がありません。','要確認：2競技欄','aria-invalid="true"','bg-amber-100'])assert(html.includes(text),text)
for(const text of ['障害!Q33','障害!Q84','障害!C33','障害!C84'])assert(!html.includes(text),text)
assert(html.indexOf('人馬の記載がありません。')<html.indexOf('人数の入力ミスの場合'))
const nodes=t=>Array.isArray(t)?t.flatMap(nodes):!t||typeof t!=='object'?[]:[t,...nodes(t.props?.children)]
const tree=MasterApplicationCountReview(props),field=nodes(tree).filter(n=>n.type===MasterApplicationReviewField)[0],input=nodes(field).find(n=>n.type==='input')
input.props.onChange({target:{value:'0'}});assert.deepEqual(edits,[['障害!C33:regular','0']])
assert(nodes(MasterApplicationCountReview({...props,disabled:true})).filter(n=>n.type==='fieldset').every(n=>n.props.disabled))
assert(renderToStaticMarkup(React.createElement(MasterApplicationCountReview,{...props,rows:reviewApplicationEntryCounts(draft.edited)})).includes('訂正後の人数が一致しました'))

;(async()=>{
 const e=setup(),d=clone(e.work.review)
 const counts=[{key:'障害!C13',block:'障害!4',competition:'5',horseKeys:['h1'],entryKeys:[d.original.entries[0].key],membership:'sportsMember',buckets:[{kind:'nonmember',origin:{sheet:'障害',cell:'Q14',value:'0'}},{kind:'member',origin:{sheet:'障害',cell:'U14',value:'0'}}]}]
 d.original.entryCounts=clone(counts);d.edited.entryCounts=clone(counts);const work=createApplicationRegistration(d)
 assert.equal((await reviewApplicationRegistration(work,e.snapshot)).ready,false)
 await assert.rejects(runApplicationRegistration(work,e.deps),/集計欄|確認/)
 assert.deepEqual(e.posts,{person:0,participants:0,entry:0},'count errors block the runner before any writes')
 console.log('PASS: offsetting 26/30 counts, block/copy isolation, split riders, OP/member/dressage counts, inline correction, source/checkpoint preservation, sorting, same-file upgrade and zero-write preflight')
})().catch(e=>{console.error(e);process.exitCode=1})
