require('./register-ts.cjs')
const assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {isMasterTimetableTime,masterTimetableChoices,inspectionForStart}=require('../lib/master/timetable.ts')
const {MasterTimetableTimeField}=require('../components/master/timetable-time-field.tsx')
const {MasterCompetitionTime}=require('../components/master/timetable.tsx')
const {WinterTimetable}=require('../components/winter-timetable.tsx')
const {WinterMonitorView}=require('../components/winter-monitor-view.tsx')
const {reconcileWinterMonitor}=require('../lib/winter-monitor.ts')
const {exportWinterCsv}=require('../lib/winter-export.ts')
const {loadWinterData}=require('../lib/winter-data.ts')
const ev=require('../lib/winter-event.ts').WINTER_EVENT_ID
for(const kind of ['inspection','start']){
 for(const v of [null,'00:00','23:59',...masterTimetableChoices[kind]])assert(isMasterTimetableTime(v,kind))
 for(const v of [undefined,'','24:00','8:00','適当な文字',42])assert(!isMasterTimetableTime(v,kind))
}
assert(!isMasterTimetableTime('前競技に引き続き','inspection'))
assert(!isMasterTimetableTime('オープン','start'))
assert(!isMasterTimetableTime('組み換え時間','start'))
assert(!isMasterTimetableTime('前競技と同時','start'))
assert.equal(inspectionForStart('07:15','07:30','08:10'),'07:55')
assert.equal(inspectionForStart('前競技と同時','07:30','08:10'),'前競技と同時')
assert.equal(inspectionForStart('07:20','07:30','08:10'),'07:20')
let selected
const field=MasterTimetableTimeField({kind:'inspection',label:'下見時間',value:'組み換え時間',disabled:false,onChange:v=>selected=v})
const fieldHtml=renderToStaticMarkup(field)
assert(fieldHtml.includes('オープン')&&fieldHtml.includes('組み換え時間')&&!fieldHtml.includes('type="time"'))
field.props.children[0].props.children.find(n=>n?.type==='select').props.onChange({target:{value:'time'}})
assert.equal(selected,'')
assert(renderToStaticMarkup(React.createElement(MasterTimetableTimeField,{kind:'start',label:'開始時間',value:'',disabled:true,onChange(){}})).includes('disabled=""'))
let cancelled=false
let inspection='オープン',start='前競技に引き続き'
const table=()=>({competition_id:'c',event_id:ev,inspection_time:inspection,start_time:start,phase:'final',...(cancelled?{cancelled:true}:{}),updated_at:'now'})
const row=x=>({event_id:ev,...x})
const data={eventId:ev,organizations:[row({id:'o',name:'団体'})],riders:[row({id:'r',name:'選手',organization_id:'o'})],horses:[row({id:'h',name:'馬',organization_id:'o'})],competitions:[row({id:'c',competition_no:'1',competition_date:'2026-11-14',name:'競技',official:false})],entries:[row({entry_id:'e',competition_id:'c',rider_id:'r',horse_id:'h',organization_id:'o',organization_name:'団体',status:'active',start_order:1})],timetable:[]}
const state={version:1,eventId:ev,competitionId:'c',page:0,draft:false,rows:[]}
data.fhs_winter_event_affiliations=[]
global.fetch=async url=>{const name=new URL(url).pathname.split('/').at(-1);const rows=name==='reception_entries'?data.entries:name==='competitions'?data.competitions.map(c=>({...c,notes:JSON.stringify({originalNotes:'残す競技メモ',winterTimetable:table()})})):data[name];return{ok:true,json:async()=>rows}}
;(async()=>{
 for(const v of ['オープン','組み換え時間','前競技と同時','08:15']){
  inspection=v
  const loaded=await loadWinterData();assert.equal(loaded.timetable[0].inspection_time,v);assert.equal(loaded.timetable[0].start_time,start)
  const time=renderToStaticMarkup(React.createElement(MasterCompetitionTime,{inspection:v,start,phase:'final'}));assert(time.includes(v)&&time.includes(start))
  const timetable=renderToStaticMarkup(React.createElement(WinterTimetable,{data:loaded,session:{},onSession(){},onChanged(){}}));assert(timetable.includes(v)&&timetable.includes(start))
  const refreshed=reconcileWinterMonitor(state,loaded);assert.equal(refreshed.inspectionTime,v);assert.equal(refreshed.startTime,start)
  const monitor=renderToStaticMarkup(React.createElement(WinterMonitorView,{state:refreshed}));assert(monitor.includes(v)&&monitor.includes(start))
  assert(exportWinterCsv(loaded,'entries').includes('"'+v+'","'+start+'"'))
 }
 // Existing dressage records may already have an inspection time. Suppress it only in the presentation.
 data.competitions[0].competition_no='32'
 inspection='08:15'
 start='13:42'
 const dressageData=await loadWinterData()
 const dressageTable=renderToStaticMarkup(React.createElement(WinterTimetable,{data:dressageData,session:{},onSession(){},onChanged(){}}))
 assert(!dressageTable.includes('下見開始') && !dressageTable.includes('下見時間') && !dressageTable.includes('08:15'))
 assert(dressageTable.includes('13:42') && dressageTable.includes('競技開始') && dressageTable.includes('確定'))
 const heading=renderToStaticMarkup(React.createElement(MasterCompetitionTime,{showInspection:false,inspection,start,phase:'final'}))
 assert(!heading.includes('下見') && !heading.includes('08:15') && heading.includes(start))
 const legacyMonitor={...reconcileWinterMonitor(state,dressageData),inspectionTime:'08:15'}
 const monitorHtml=renderToStaticMarkup(React.createElement(WinterMonitorView,{state:legacyMonitor}))
 assert(!monitorHtml.includes('下見') && !monitorHtml.includes('08:15') && monitorHtml.includes(start))
 assert(exportWinterCsv(dressageData,'entries').includes('"","13:42"'))
 assert.equal(dressageData.timetable[0].inspection_time,'08:15')
 // A saved cancellation survives reload and replaces timing in every public projection.
 cancelled=true
 const cancelledData=await loadWinterData()
 const {timetablePhase}=require('../lib/master/timetable.ts')
 const {winterTimetablePrintData}=require('../lib/winter-timetable-print.ts')
 const {timetablePrintHtml}=require('../lib/master/timetable-print.ts')
 for(const number of ['1','15']){
  const empty={...cancelledData,entries:[],competitions:cancelledData.competitions.map(c=>({...c,competition_no:number}))}
  const screen=renderToStaticMarkup(React.createElement(WinterTimetable,{data:empty,session:{},onSession(){},onChanged(){}}))
  const monitor=renderToStaticMarkup(React.createElement(WinterMonitorView,{state:reconcileWinterMonitor(state,empty)}))
  const print=timetablePrintHtml(winterTimetablePrintData(empty),'')
  const heading=renderToStaticMarkup(React.createElement(MasterCompetitionTime,{start,inspection,phase:timetablePhase(empty.timetable[0])}))
  for(const output of [screen,monitor,print,heading]){
   assert(output.includes('中止'));assert(!output.includes(start));assert(!output.includes(inspection))
  }
  assert(!monitor.includes('登録されると表示'))
  assert(screen.includes('value="cancelled" selected'))
  const active=renderToStaticMarkup(React.createElement(WinterTimetable,{data:{...empty,timetable:[],entries:data.entries},session:{},onSession(){},onChanged(){}}))
  assert(!active.includes('value="cancelled"'))
 }
 cancelled=false
 inspection='前競技に引き続き';await assert.rejects(loadWinterData(),/時間設定/)
 inspection='08:15';start='オープン';await assert.rejects(loadWinterData(),/時間設定/)
 console.log('PASS: shared clock/instruction field, strict per-field validation, real loader, daily table/start heading, monitor refresh/render and CSV preserve instructions; wrong-field values rejected')
})().catch(e=>{console.error(e);process.exitCode=1})
