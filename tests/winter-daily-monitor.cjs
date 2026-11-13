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
draft.officialOrder=['draft']
data.entries.push({...rows[0],entry_id:'draft',competition_id:'dressage',rider_id:'dr',horse_id:'dh',is_op:true})
data.riders.push({id:'dr',name:'調整中の選手'})
data.horses.push({id:'dh',name:'調整中の馬'})
const day={...single,followingCompetitions:[draft]}
assert.deepEqual(validateWinterMonitor(JSON.parse(JSON.stringify(day))),day)
assert.throws(()=>validateWinterMonitor({...day,followingCompetitions:[{...draft,date:'2026-11-15'}]}))
assert.throws(()=>validateWinterMonitor({...day,followingCompetitions:[single]}))
const refreshed=reconcileWinterMonitor(day,data)
assert.equal(refreshed.rows.length,34)
assert.deepEqual(refreshed.followingCompetitions.map(c=>c.competitionId),['dressage','empty'])
assert.equal(refreshed.followingCompetitions[0].draft,true)
assert.deepEqual(refreshed.followingCompetitions[0].rows,draft.rows)
assert.equal(refreshed.followingCompetitions[1].rows.length,0)
const view=(state,nameSize)=>renderToStaticMarkup(React.createElement(WinterMonitorView,{state,nameSize}))
const html=view(refreshed)
assert.equal((html.match(/<tbody>/g)||[]).length,3)
assert.equal((html.match(/<td /g)||[]).length,35*5)
for(const name of ['調整中の選手','インドア競技場','11/14','登録されると表示'])assert.ok(html.includes(name),name)
assert.ok(!html.includes('競技other'))
assert.doesNotMatch(html,/自動スクロール|grid-cols-2/)
assert.match(html,/flex flex-col gap-4/)
assert.equal((html.match(/inline-block whitespace-nowrap/g)||[]).length,35*3)
assert.equal((html.match(/font-size:18px/g)||[]).length,35*3)
for(const nameSize of [36,46,54,69]){
 const meeting=view(refreshed,nameSize)
 assert.equal((meeting.match(new RegExp('font-size:'+nameSize+'px','g'))||[]).length,35*3)
 assert.equal((meeting.match(/inline-block whitespace-nowrap/g)||[]).length,35*3)
}
const legacy=view(reconcileWinterMonitor(single,data))
assert.equal((legacy.match(/<td /g)||[]).length,30*5)
assert.ok(!legacy.includes('自動スクロール'))
console.log('PASS daily display, saved updates, per-competition drafts, days and orders isolated, empty competitions, more than 30 starts, venue and legacy single view')

const {officialMonitorFallback}=require('../lib/winter-monitor')
const savedOrder=refreshed.rows.map(r=>r.id)
const reversed={...refreshed,draft:true,officialOrder:savedOrder,rows:[...refreshed.rows].reverse().map((r,i)=>({...r,number:i+1}))}
assert.deepEqual(officialMonitorFallback(reversed).rows.map(row=>row.id),savedOrder)
assert.equal(officialMonitorFallback(reversed).draft,false)
assert.equal(reconcileWinterMonitor(reversed,data).draft,true)
const moved={...data,entries:data.entries.map(row=>row.entry_id==='entry0'?{...row,start_order:99}:row)}
assert.equal(reconcileWinterMonitor(reversed,moved).draft,false)
assert.equal(reconcileWinterMonitor(reversed,moved).rows.at(-1).id,'entry0')
assert.equal(reconcileWinterMonitor(single,data,new Set(['wd'])).rows.at(-1).mark,'棄権')
