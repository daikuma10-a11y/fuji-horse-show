require('./register-ts.cjs')
const assert=require('node:assert/strict'),React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {isMasterTimetableTime,masterTimetableChoices}=require('../lib/master/timetable.ts')
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
let selected
const field=MasterTimetableTimeField({kind:'inspection',label:'下見時間',value:'組み換え時間',disabled:false,onChange:v=>selected=v})
const fieldHtml=renderToStaticMarkup(field)
assert(fieldHtml.includes('オープン')&&fieldHtml.includes('組み換え時間')&&!fieldHtml.includes('type="time"'))
field.props.children[0].props.children.find(n=>n?.type==='select').props.onChange({target:{value:'time'}})
assert.equal(selected,'')
assert(renderToStaticMarkup(React.createElement(MasterTimetableTimeField,{kind:'start',label:'開始時間',value:'',disabled:true,onChange(){}})).includes('disabled=""'))
let inspection='オープン',start='前競技に引き続き'
const table=()=>({competition_id:'c',event_id:ev,inspection_time:inspection,start_time:start,phase:'final',updated_at:'now'})
const row=x=>({event_id:ev,...x})
const data={eventId:ev,organizations:[row({id:'o',name:'団体'})],riders:[row({id:'r',name:'選手',organization_id:'o'})],horses:[row({id:'h',name:'馬',organization_id:'o'})],competitions:[row({id:'c',competition_no:'1',competition_date:'2026-11-14',name:'競技',official:false})],entries:[row({entry_id:'e',competition_id:'c',rider_id:'r',horse_id:'h',organization_id:'o',organization_name:'団体',status:'active',start_order:1})],timetable:[]}
const state={version:1,eventId:ev,competitionId:'c',page:0,draft:false,rows:[]}
global.fetch=async url=>{const name=new URL(url).pathname.split('/').at(-1);const rows=name==='reception_entries'?data.entries:name==='competitions'?data.competitions.map(c=>({...c,notes:JSON.stringify({originalNotes:'残す競技メモ',winterTimetable:table()})})):data[name];return{ok:true,json:async()=>rows}}
;(async()=>{
 for(const v of ['オープン','組み換え時間','08:15']){
  inspection=v
  const loaded=await loadWinterData();assert.equal(loaded.timetable[0].inspection_time,v);assert.equal(loaded.timetable[0].start_time,start)
  const time=renderToStaticMarkup(React.createElement(MasterCompetitionTime,{inspection:v,start,phase:'final'}));assert(time.includes(v)&&time.includes(start))
  const timetable=renderToStaticMarkup(React.createElement(WinterTimetable,{data:loaded,session:{},onSession(){},onChanged(){}}));assert(timetable.includes(v)&&timetable.includes(start))
  const refreshed=reconcileWinterMonitor(state,loaded);assert.equal(refreshed.inspectionTime,v);assert.equal(refreshed.startTime,start)
  const monitor=renderToStaticMarkup(React.createElement(WinterMonitorView,{state:refreshed}));assert(monitor.includes(v)&&monitor.includes(start))
  assert(exportWinterCsv(loaded,'entries').includes('"'+v+'","'+start+'"'))
 }
 inspection='前競技に引き続き';await assert.rejects(loadWinterData(),/時間設定/)
 inspection='08:15';start='オープン';await assert.rejects(loadWinterData(),/時間設定/)
 console.log('PASS: shared clock/instruction field, strict per-field validation, real loader, daily table/start heading, monitor refresh/render and CSV preserve instructions; wrong-field values rejected')
})().catch(e=>{console.error(e);process.exitCode=1})
