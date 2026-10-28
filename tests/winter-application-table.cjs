// Synthetic inline-editing checks. No authenticated browser, workbook or DB writes.
require('./register-ts.cjs')
const assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {MasterApplicationReview}=require('../components/master/application-review.tsx')
const {MasterApplicationReviewRow,MasterApplicationReviewField}=require('../components/master/application-review-row.tsx')
const {applicationReview}=require('../lib/winter-application.ts')
const {applicationTodos}=require('../lib/winter-application-guide.ts')
const {createApplicationDraft}=require('../lib/winter-application-draft.ts')
const {applicationEntryTarget,applicationPersonTarget}=require('../lib/master/application-guide.ts')
const {WINTER_HORSE_REGISTRATION_FEE}=require('../lib/winter-horse-registration.ts')
const preparation=require('../config/winter-2026-preparation.json'),fixture=require('./winter-application-fixture.cjs')
let network=0;global.fetch=()=>{network++;throw Error('No real network')}
const app=fixture(),rider=app.people[0],horse=app.people[1],entry=app.entries[0]
app.people=[rider,...Array.from({length:4},(_,i)=>({...horse,key:'h'+(i+1),name:'合成馬'+(i+1),horseGrade:'中D'}))]
app.entries=Array.from({length:60},(_,i)=>({...entry,key:'entry-'+i,competition:i%2?'7':'5',horse:'h'+(i%4+1),origin:{sheet:'合成障害',cell:'J'+(i+1),value:'合成出番'}}))
app.amounts={horse:'56000',jump:'450000',dressage:'0',total:'506000'}
const original=structuredClone(app),before=JSON.stringify(app),calls=[],noop=()=>{}
function model(edited){const r=applicationReview(edited,'0',true);return {amounts:r.amounts,issues:[],entryPrices:r.report.entries.map(e=>e.price),entryFeeTotal:r.report.entryFeeTotal,horseRegistration:{count:edited.people.filter(p=>p.kind==='horse').length,unit:WINTER_HORSE_REGISTRATION_FEE},ready:r.ready}}
const p={busy:false,message:'',error:'',fileName:'synthetic.xlsx',eventName:'合成大会',formatDescription:'合成様式',original,edited:app,reference:'SYNTHETIC',paid:'0',accountChecked:true,review:model(app),candidates:{},choices:Object.fromEntries(app.people.map(p=>[p.key,'new'])),rosterLoaded:true,differences:null,revisionName:'',competitions:preparation.competitions,
 todos:[{label:'30件目',message:'合成の確認対象',target:applicationEntryTarget('entry-29'),blocking:true,fields:['competition']}],
 onFiles:noop,onRead:noop,onRestoreFile:noop,onSave:noop,onOpenSaved:noop,onDownload:noop,onLoadRoster:noop,onReset:noop,onReference:noop,onClub:noop,onPaid:noop,onAccountChecked:noop,onPerson:(...args)=>calls.push(['person',...args]),onEntry:(...args)=>calls.push(['entry',...args]),onAmount:(...args)=>calls.push(['amount',...args]),onChoice:(...args)=>calls.push(['choice',...args])}
const nodes=t=>Array.isArray(t)?t.flatMap(nodes):!t||typeof t!=='object'?[]:[t,...nodes(t.props?.children)]
const rows=props=>nodes(MasterApplicationReview(props)).filter(n=>n.type===MasterApplicationReviewRow)
const controls=row=>row.props.cells.flatMap(c=>nodes(c.content))
const tree=MasterApplicationReview(p),allRows=rows(p),entryRows=allRows.filter(n=>n.props.target.startsWith('application-entry-'))
assert.equal(allRows.length,69);assert.equal(entryRows.length,60,'all entries remain present without pagination or filtering')
assert.deepEqual(entryRows.map(r=>r.props.target),app.people.filter(p=>p.kind==='horse').flatMap(p=>app.entries.filter(e=>e.horse===p.key).map(e=>applicationEntryTarget(e.key))),'display groups entries by horse roster order without reordering source identities')
for(const row of entryRows){const index=Number(decodeURIComponent(row.props.target).split('entry-').at(-1));const fee=row.props.cells.find(c=>c.label==='料金');assert.equal(fee.content.props.children.props.children,index%2?'10,000円':'5,000円','sorted display keeps the original fee index')}
const html=renderToStaticMarkup(React.createElement(MasterApplicationReview,p))
for(const label of ['選手一覧（1名）','馬一覧（4頭）','エントリー確認一覧（全60件）','所有資格級','グレード宣言','所属（申込団体）','4頭 × 14,000円','450,000円','506,000円'])assert.ok(html.includes(label),label)
assert.equal((html.match(/data-review-row="true"/g)||[]).length,69)
assert.equal((html.match(/<table /g)||[]).length,4)
assert.ok(html.includes('scope="row"'));assert.ok(html.includes('scope="col"'))
assert.ok(!html.includes('data-review-toggle'));assert.ok(!html.includes('aria-expanded='),'there is no edit expansion button')
assert.ok(!html.includes('hidden=""'),'editable rows are not hidden')
assert.equal((html.match(/table-fixed/g)||[]).length,4,'all tables size to their container')
assert.ok(!/min-w-\[(760|960|980)px\]/.test(html));assert.ok(html.includes('@max-[760px]:grid-cols-2'),'narrow containers reflow without hiding columns')
for(const colgroup of nodes(tree).filter(n=>n.type==='colgroup'))assert.equal(nodes(colgroup).filter(n=>n.type==='col').reduce((sum,n)=>sum+parseFloat(n.props.style.width),0),100)
const last=controls(entryRows[59])
last.find(n=>n.type==='select'&&n.props['aria-label']==='entry-59 競技').props.onChange({target:{value:'5'}})
assert.deepEqual(calls.pop(),['entry','entry-59',{competition:'5'}])
for(const kind of ['rider','horse']){last.find(n=>n.type==='select'&&n.props['aria-label']===`entry-59 ${kind}`).props.onChange({target:{value:'chosen'}});assert.deepEqual(calls.pop(),['entry','entry-59',{[kind]:'chosen'}])}
last.find(n=>n.type==='input'&&n.props.type==='checkbox').props.onChange({target:{checked:true}});assert.deepEqual(calls.pop(),['entry','entry-59',{op:true}])
const riderControls=controls(allRows[0])
for(const [type,label,value,patch] of [
 ['textarea','r1 name','訂正選手',{name:'訂正選手'}],['textarea','r1 reading','テスト',{reading:'テスト'}],['input','r1 jef','900001',{jef:'900001'}],
 ['select','r1 騎乗者資格','A',{grade:'A'}],['select','r1 乗馬協会の会員区分','非会員',{sportsMember:'非会員'}],['select','r1 指導者協会の会員区分','会員',{instructorMember:'会員'}]
]){riderControls.find(n=>n.type===type&&n.props['aria-label']===label).props.onChange({target:{value}});assert.deepEqual(calls.pop(),['person','r1',patch])}
riderControls.find(n=>n.type==='select'&&n.props['aria-label']==='r1 対応する人馬').props.onChange({target:{value:'candidate-id'}});assert.deepEqual(calls.pop(),['choice','r1','candidate-id'])
controls(allRows[1]).find(n=>n.type==='select'&&n.props['aria-label']==='h1 グレード宣言').props.onChange({target:{value:'中C'}});assert.deepEqual(calls.pop(),['person','h1',{horseGrade:'中C'}])
controls(allRows.at(-1)).find(n=>n.type==='input').props.onChange({target:{value:'506001'}});assert.deepEqual(calls.pop(),['amount','total','506001'])

// Real validation identifies the exact cells, then clears those markers after corrections.
const d=createApplicationDraft(fixture());d.choices={r1:'new',h1:'new'};d.paid='0';d.accountChecked=true
const personTarget=applicationPersonTarget('r1'),horseTarget=applicationPersonTarget('h1')
d.edited.people[0].jef='900001';d.edited.people[0].grade='C';d.edited.people[1].jef='900002';d.edited.people[1].reading=''
d.edited.entries[0].competition='12';d.edited.amounts.jump='12000';d.edited.amounts.total='26000'
const live=()=>({...p,original:d.original,edited:d.edited,choices:d.choices,review:model(d.edited),todos:applicationTodos(d,true)})
const fields=()=>rows(live()).flatMap(controls).filter(n=>n.type===MasterApplicationReviewField)
const issueAt=id=>fields().find(n=>n.props.id===id)?.props.notes??[]
assert(issueAt(`${personTarget}-checked`).some(n=>n.blocking));assert(issueAt(`${personTarget}-grade`).some(n=>n.blocking))
assert(issueAt(`${horseTarget}-checked`).some(n=>n.blocking));assert(issueAt(`${horseTarget}-reading`).some(n=>!n.blocking))
assert.equal(issueAt(`${personTarget}-name`).length,0,'valid name is not colored for a qualification error')
assert.equal(issueAt(`${personTarget}-jef`).length,0,'present number is not confused with a missing verification check')
let liveMarkup=renderToStaticMarkup(React.createElement(MasterApplicationReview,live()))
assert.ok(liveMarkup.includes('data-review-issue="blocking"'));assert.ok(liveMarkup.includes('data-review-issue="advisory"'));assert.ok(liveMarkup.includes('aria-invalid="true"'));assert.ok(liveMarkup.includes('aria-describedby='))
d.edited.people[0].grade='A';d.edited.people[0].checked=true;d.edited.people[1].checked=true;d.edited.people[1].reading='ごうせいうま'
assert.equal(issueAt(`${personTarget}-checked`).length,0);assert.equal(issueAt(`${personTarget}-grade`).length,0);assert.equal(issueAt(`${horseTarget}-reading`).length,0)
assert.equal(applicationTodos(d,true).filter(n=>n.blocking).length,0)
const amountHelp=renderToStaticMarkup(React.createElement(MasterApplicationReview,{...p,edited:{...app,amounts:{...app.amounts,jump:'462000',total:'518000'}},review:model({...app,amounts:{...app.amounts,jump:'462000',total:'518000'}})}))
for(const explanation of ['申込内容を確認したうえで手直しできる請求額','出場者・競技・OP・会員区分・頭数','集計人数を直しても','元のExcelファイルは自動では書き換わりません','確認後の請求額が計算額より','12,000円','application-amount-help'])assert(amountHelp.includes(explanation),explanation)
const corrected=renderToStaticMarkup(React.createElement(MasterApplicationReview,live()));assert.ok(!corrected.includes('data-review-issue='));assert.ok(!corrected.includes('aria-invalid="true"'))
d.edited.entries[0].competition='5';d.edited.people[0].sportsMember='';assert(issueAt(`${personTarget}-sportsMember`).some(n=>n.blocking));assert.equal(issueAt(`${personTarget}-instructorMember`).length,0)
d.edited.entries[0].competition='8';assert(issueAt(`${personTarget}-qualified`).some(n=>n.blocking));d.edited.people[0].qualified=true;assert(issueAt(`${personTarget}-instructorMember`).some(n=>n.blocking))
d.edited.entries[0].competition='12';d.edited.entries[0].op=true;assert(applicationTodos(d,true).some(n=>n.fields?.includes('op')&&n.target.startsWith('application-entry-')))

const unknown=structuredClone(app);unknown.entries[29].competition='999'
const summary=renderToStaticMarkup(React.createElement(MasterApplicationReview,{...p,edited:unknown,review:model(unknown)})).split('aria-label="今回のExcelの料金合計"')[1].split('</dl>')[0]
assert.match(summary,/エントリー合計[\s\S]*未確認/);assert.match(summary,/総額[\s\S]*未確認/);assert.ok(!summary.includes('506,000円'))
for(const locked of [{frozen:true},{busy:true}])for(const r of rows({...p,...locked})){
 assert(r.props.disabled);assert.ok(nodes(MasterApplicationReviewRow(r.props)).filter(n=>n.type==='fieldset').every(n=>n.props.disabled))
}
let scrolled=false,focused=false
const control={scrollIntoView:()=>{scrolled=true},focus:()=>{focused=true}}
global.HTMLDetailsElement=class {};global.requestAnimationFrame=fn=>fn()
global.document={getElementById:id=>{assert.equal(id,applicationEntryTarget('entry-29'));return {querySelector:selector=>{assert.equal(selector,'[data-review-issue=blocking]');return {querySelector:()=>control}}}}}
nodes(tree).find(n=>n.type==='button'&&String(n.props.children).includes('最初の確認箇所へ')).props.onClick();assert(scrolled&&focused,'jump focuses the affected inline control')
assert.equal(JSON.stringify(app),before);assert.equal(network,0)
console.log('PASS: 60-entry inline tables; all edits keep row keys; no edit toggle/hidden controls; exact blocking/advisory fields clear on correction; qualification/membership/OP dependencies; responsive-width structure; totals/unknown fees; frozen/busy guards; warning focus; no source mutation or network')
