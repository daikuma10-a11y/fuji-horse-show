require('./register-ts.cjs')
const assert=require('node:assert/strict'),Module=require('node:module'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
function hooks(){let index=0;const values=[];return {render(fn){index=0;return fn()},useState(initial){const i=index++;values[i]??={value:typeof initial==='function'?initial():initial};return [values[i].value,v=>{values[i].value=typeof v==='function'?v(values[i].value):v}]},useRef(initial){const i=index++;return values[i]??(values[i]={current:initial})}}}
const h=hooks(),oldLoad=Module._load
Module._load=function(name,...args){if(name==='react')return {...React,useState:h.useState,useRef:h.useRef};return oldLoad.call(this,name,...args)}
const {MasterStableScheduleEditor}=require('../components/master/stable-schedule-editor.tsx')
const {MasterStableScheduleFields}=require('../components/master/stable-schedule-fields.tsx')
const {MasterFilePicker}=require('../components/master/file-picker.tsx')
const {MasterStableReports}=require('../components/master/stable-reports.tsx')
const {bookletRows}=require('../lib/master/stable-reports.ts')
const {emptyStableSchedule}=require('../lib/master/stable-schedule.ts')
const schedule={arrivalDate:'2026-11-13',arrivalTime:'08:00',departureDate:'2026-11-15',departureTime:'17:00',notes:''}
let saved=[],reads=0,readClub='架空団体',resolveSave,fail=false,reloads=0
const props={rows:[{id:'org',name:'架空団体',value:schedule,revision:'read-revision'}],loading:false,error:'',year:'2026',onReadExcel:async()=>{reads++;return {club:readClub,value:{...emptyStableSchedule(),arrivalTime:'10:00',arrivalDate:'2026-11-13'}}},onSave:async(...args)=>{saved.push(args);await new Promise(resolve=>{resolveSave=resolve});if(fail)throw Error('同時更新を検出しました')},onReload:async()=>{reloads++}}
function nodes(n){if(!n||typeof n!=='object')return [];return [n,...React.Children.toArray(n.props?.children).flatMap(nodes)]}
const render=()=>h.render(()=>MasterStableScheduleEditor(props))
const by=(fn)=>nodes(render()).find(fn)
const button=label=>by(n=>n.type==='button'&&n.props.children===label)
const settle=async()=>{for(let i=0;i<15;i++)await Promise.resolve()}
;(async()=>{
 by(n=>n.type==='select').props.onChange({target:{value:'org'}})
 const fields=()=>by(n=>n.type===MasterStableScheduleFields)
 fields().props.onChange({...schedule,arrivalTime:'09:30'})
 button('日時のみ保存').props.onClick();button('日時のみ保存').props.onClick();await settle()
 assert.equal(saved.length,1,'double tap posts once');assert.equal(saved[0][0],'org');assert.equal(saved[0][1].arrivalTime,'09:30');assert.equal(saved[0][2],'read-revision','save uses the revision displayed before editing')
 assert.ok(nodes(render()).some(n=>n.props?.role==='status'&&String(n.props.children).includes('保存中')))
 resolveSave();await settle();assert.ok(nodes(render()).some(n=>n.props?.role==='status'&&String(n.props.children).includes('保存しました')))
 by(n=>n.type==='select').props.onChange({target:{value:'org'}})
 readClub='違う団体';by(n=>n.type===MasterFilePicker).props.onFiles([{name:'dummy.xlsx'}]);await settle()
 assert.equal(reads,1);assert.equal(fields().props.value.arrivalTime,'08:00');assert.ok(nodes(render()).some(n=>n.props?.role==='alert'&&String(n.props.children).includes('異なります')))
 readClub='架空団体';by(n=>n.type===MasterFilePicker).props.onFiles([{name:'dummy.xlsx'}]);await settle()
 assert.equal(fields().props.value.arrivalTime,'10:00');assert.equal(fields().props.value.departureDate,'2026-11-15');assert.equal(saved.length,1,'Excel read does not save')
 fail=true;button('日時のみ保存').props.onClick();await settle();resolveSave();await settle()
 assert.ok(nodes(render()).some(n=>n.props?.role==='alert'&&String(n.props.children).includes('同時更新')));assert.equal(fields().props.value.arrivalTime,'10:00','failure retains edits')
 button('最新の保存内容を読み直す').props.onClick();await settle();assert.equal(reloads,1)
 const booklets=bookletRows([{id:'org',name:'架空団体',horses:[{id:'h',name:'架空馬'}]}],[{id:'org',value:schedule}])
 const report={booklets,unsettled:[],loading:false,error:'',unsettledLoading:false,unsettledError:'',loadBookletPrint:async()=>'',loadUnsettledPrint:async()=>''}
 let html=renderToStaticMarkup(React.createElement(MasterStableReports,report));assert.ok(html.includes('2026/11/13 08:00'));assert.ok(html.includes('2026/11/15 17:00'))
 html=renderToStaticMarkup(React.createElement(MasterStableReports,{...report,bookletError:'日時の読込に失敗'}));assert.ok(!html.includes('2026/11/13'));assert.match(html,/<button[^>]*disabled[^>]*>手帳チェックを印刷/)
 Module._load=oldLoad
 console.log('PASS: inline date edits, correct target/revision, double-tap guard, progress/success/failure, mismatched Excel club rejected, read-only preview, blank preservation, reload, screen dates and failed-load print disabled')
})().catch(e=>{console.error(e);process.exit(1)})
