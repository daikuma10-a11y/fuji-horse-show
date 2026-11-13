require('./register-ts.cjs')
const assert=require('node:assert/strict')
const React=require('react'),{renderToStaticMarkup}=require('react-dom/server')
const {WINTER_EVENT_ID:eventId}=require('../lib/winter-event')
const {validateWinterMonitor,reconcileWinterMonitor}=require('../lib/winter-monitor')
const {WinterMonitorView}=require('../components/winter-monitor-view')
const date='2026-11-14'
const comp=(id,competition_no,competition_date=date)=>({id,competition_no,competition_date,name:'競技'+id})
const competitions=[comp('jump','1'),comp('dressage','15'),comp('empty','16'),comp('other','30','2026-11-15')]
const rows=Array.from({length:34},(_,i)=>({entry_id:'entry'+i,competition_id:'jump',start_order:i+1,rider_id:'r',horse_id:'h',organization_name:'団体',is_op:false,status:'active'}))
const data={eventId,competitions,entries:[...rows,{...rows[0],entry_id:'wd',status:'wd'}],riders:[{id:'r',name:'選手'}],horses:[{id:'h',name:'馬'}],timetable:[]}
const single={eventId,version:1,competitionId:'jump',competitionNo:'1',competitionName:'障害',date,page:0,draft:false,rows:[],updatedAt:'now'}
const draft={competitionId:'dressage',competitionNo:'15',competitionName:'馬場',date,page:0,draft:true,rows:[{id:'draft',number:1,rider:'調整中の選手',horse:'調整中の馬',organization:'団体',isOp:true,mark:'追加'}]}
const day={...single,followingCompetitions:[draft]}
assert.deepEqual(validateWinterMonitor(JSON.parse(JSON.stringify(day))),day)
assert.throws(()=>validateWinterMonitor({...day,followingCompetitions:[{...draft,date:'2026-11-15'}]}))
assert.throws(()=>validateWinterMonitor({...day,followingCompetitions:[single]}))
const refreshed=reconcileWinterMonitor(day,data)
assert.equal(refreshed.rows.length,34)
assert.deepEqual(refreshed.followingCompetitions.map(c=>c.competitionId),['dressage','empty'])
assert.deepEqual(refreshed.followingCompetitions[0],draft)
assert.equal(refreshed.followingCompetitions[1].rows.length,0)
const view=s=>renderToStaticMarkup(React.createElement(WinterMonitorView,{state:s}))
const html=view(refreshed)
assert.equal((html.match(/<tbody>/g)||[]).length,3)
assert.equal((html.match(/<td /g)||[]).length,35*5)
for(const name of ['調整中の選手','インドア競技場','自動スクロールを停止','11/14','登録されると表示'])assert.ok(html.includes(name),name)
assert.ok(!html.includes('競技other'))
const legacy=view(reconcileWinterMonitor(single,data))
assert.equal((legacy.match(/<td /g)||[]).length,30*5)
assert.ok(!legacy.includes('自動スクロール'))
console.log('PASS daily display, saved updates, per-competition drafts, days and orders isolated, empty competitions, more than 30 starts, venue and legacy single view')
