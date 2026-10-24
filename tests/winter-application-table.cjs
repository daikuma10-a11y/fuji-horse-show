// Synthetic presentation checks. No authenticated browser, workbook or DB writes.
require('./register-ts.cjs')
const assert=require('node:assert/strict'),React=require('react'),Module=require('node:module'),{renderToStaticMarkup}=require('react-dom/server')
const {MasterApplicationReview}=require('../components/master/application-review.tsx')
const {MasterApplicationReviewRow}=require('../components/master/application-review-row.tsx')
const {applicationReview}=require('../lib/winter-application.ts')
const {applicationEntryTarget}=require('../lib/master/application-guide.ts')
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
 todos:[{label:'30件目',message:'合成の確認対象',target:applicationEntryTarget('entry-29'),blocking:true}],
 onFiles:noop,onRead:noop,onRestoreFile:noop,onSave:noop,onOpenSaved:noop,onDownload:noop,onLoadRoster:noop,onReset:noop,onReference:noop,onClub:noop,onPaid:noop,onAccountChecked:noop,onPerson:(...args)=>calls.push(['person',...args]),onEntry:(...args)=>calls.push(['entry',...args]),onAmount:noop,onChoice:noop}
const nodes=t=>!t||typeof t!=='object'?[]:[t,...[t.props?.children].flat(Infinity).flatMap(nodes)]
const tree=MasterApplicationReview(p),rows=nodes(tree).filter(n=>n.type===MasterApplicationReviewRow),entryRows=rows.filter(n=>n.props.target.startsWith('application-entry-'))
assert.equal(rows.length,65);assert.equal(entryRows.length,60,'all entries remain present without pagination or filtering')
assert.deepEqual(entryRows.map(r=>r.props.target),app.entries.map(e=>applicationEntryTarget(e.key)),'workbook order and identity are stable')
assert.equal(entryRows[29].props.blocking,1);assert.equal(entryRows[28].props.blocking,0)
const html=renderToStaticMarkup(React.createElement(MasterApplicationReview,p))
for(const label of ['選手一覧（1名）','馬一覧（4頭）','エントリー確認一覧（全60件）','所有資格級','グレード宣言','所属（申込団体）','4頭 × 14,000円','450,000円','506,000円'])assert.ok(html.includes(label),label)
assert.equal((html.match(/data-review-row="true"/g)||[]).length,65)
assert.equal((html.match(/<table /g)||[]).length,4,'separate rider, horse, entry and amount tables')
assert.ok(html.includes('scope="row"'));assert.ok(html.includes('scope="col"'));assert.ok(html.includes('aria-expanded="false"'));assert.ok(html.includes('hidden=""'))
const details=nodes(entryRows[59].props.children),competition=details.find(n=>n.type==='select'&&n.props['aria-label']==='entry-59 競技')
competition.props.onChange({target:{value:'5'}});assert.deepEqual(calls.pop(),['entry','entry-59',{competition:'5'}],'last-row edit addresses only that entry')
const personInput=nodes(rows[0].props.children).find(n=>n.type==='input'&&n.props['aria-label']==='r1 jef')
personInput.props.onChange({target:{value:'900001'}});assert.deepEqual(calls.pop(),['person','r1',{jef:'900001'}])
const op=details.find(n=>n.type==='input'&&n.props.type==='checkbox');op.props.onChange({target:{checked:true}});assert.deepEqual(calls.pop(),['entry','entry-59',{op:true}])
const unknown=structuredClone(app);unknown.entries[29].competition='999'
const unknownMarkup=renderToStaticMarkup(React.createElement(MasterApplicationReview,{...p,edited:unknown,review:model(unknown)}))
const summary=unknownMarkup.split('aria-label="今回のExcelの料金合計"')[1].split('</dl>')[0]
assert.match(summary,/エントリー合計[\s\S]*未確認/);assert.match(summary,/総額[\s\S]*未確認/);assert.ok(!summary.includes('506,000円'),'unknown fee never silently becomes zero or a stale total')
const frozenRows=nodes(MasterApplicationReview({...p,frozen:true})).filter(n=>n.type===MasterApplicationReviewRow)
assert.ok(frozenRows.every(n=>n.props.disabled));assert.equal(JSON.stringify(app),before)

// Expand/collapse and warning jump exercise the real row handlers with a tiny state fixture.
const load=Module._load;let opened=false
Module._load=function(name,...args){if(name==='react')return {...React,useState:()=>[opened,v=>{opened=typeof v==='function'?v(opened):v}]};return load.call(this,name,...args)}
delete require.cache[require.resolve('../components/master/application-review-row.tsx')]
const Row=require('../components/master/application-review-row.tsx').MasterApplicationReviewRow
const rowProps={...entryRows[29].props,disabled:true}
let row=Row(rowProps),button=nodes(row).find(n=>n.type==='button')
assert.equal(button.props['aria-expanded'],false);assert.equal(button.props.disabled,undefined,'frozen values still allow inspection')
let scrolled=false,focused=false,clicked=false
global.HTMLDetailsElement=class {}
global.requestAnimationFrame=fn=>fn()
global.document={getElementById:id=>{assert.equal(id,rowProps.target);return {querySelector:()=>({getAttribute:()=>String(opened),click:()=>{clicked=true;button.props.onClick()}}),scrollIntoView:()=>{scrolled=true},focus:()=>{focused=true}}}}
nodes(tree).find(n=>n.type==='button'&&String(n.props.children).includes('最初の確認箇所へ')).props.onClick()
row=Row(rowProps);assert.equal(opened,true);assert(clicked&&scrolled&&focused);assert.equal(nodes(row).find(n=>n.type==='tr'&&n.props.hidden!==undefined).props.hidden,false);assert.equal(nodes(row).find(n=>n.type==='fieldset').props.disabled,true)
nodes(row).find(n=>n.type==='button').props.onClick();row=Row(rowProps);assert.equal(opened,false);assert.ok(nodes(row).find(n=>n.type==='fieldset').props.children.includes(rowProps.children),'closing keeps the same review controls and values')
Module._load=load;assert.equal(network,0)
console.log('PASS: 60-entry tables, stable row identity/order, rider/horse columns, existing fee totals, unknown-fee handling, row edits, warning navigation, expansion and frozen inspection (synthetic presentation)')
