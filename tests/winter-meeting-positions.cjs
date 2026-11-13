require('./register-ts.cjs')
const assert=require('node:assert/strict')
const {emptyWinterQueue}=require('../lib/winter-batch')
const {meetingRows,meetingDisplay,updateMeetingWork,savedMeetingContent,restoreMeeting}=require('../lib/winter-meeting')
const {meetingOrderAfterMove}=require('../lib/master/meeting-preview')
const {winterStartListModel}=require('../lib/winter-start-list-model')
const {WINTER_EVENT_ID:event_id,winterCompetition}=require('../lib/winter-event')

const id=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const date='2026-11-14'
function competition(n) {
 const c=winterCompetition(String(n))
 return {id:id(n),event_id,competition_date:date,competition_no:c.number,name:c.name,official:c.official,fee:c.fee,member_fee:c.memberFee,nonmember_fee:c.nonmemberFee,op_fee:c.opFee}
}
const from=competition(1),to=competition(2),organization={id:id(100),event_id,name:'団体'}
const rider={id:id(101),event_id,name:'選手',organization_id:organization.id},horse={...rider,id:id(102),name:'馬'}
const entry=(n,comp,order)=>({entry_id:id(n),event_id,competition_no:comp.competition_no,competition_id:comp.id,start_order:order,rider_id:rider.id,horse_id:horse.id,organization_id:organization.id,organization_name:organization.name,is_op:false,status:'active'})
const [a,b,c,d]=[1,2,3,4].map(n=>entry(10+n,from,n))
const other=entry(20,to,1)
const data={eventId:event_id,entries:[a,b,c,d,other],competitions:[from,to],organizations:[organization],riders:[rider],horses:[horse],timetable:[]}
const wd={id:id(81),type:'withdraw',entry:b,organizationId:organization.id,organizationName:organization.name,riderName:rider.name,horseName:horse.name,visitorName:''}
const change={type:'change',input:{original:c,from,fromSelection:{},target:{id:id(82),organization,competition:to,rider,horse,visitorName:'',selection:{},masterForm:true}}}
const token='request:'+change.input.target.id
const starts=q=>meetingRows(data,q).rows.filter(row=>row.competitionId===from.id)
const ids=rows=>rows.map(row=>row.id)
const stage=(q,item)=>updateMeetingWork(data,q,{...q,items:[...q.items,item]})
const queue=stage(stage(emptyWinterQueue(),wd),change)
const names=[a,b,c,d].map(row=>row.entry_id)
assert.deepEqual(ids(starts(queue)),names)
const screen=meetingDisplay(data,date,queue,meetingRows(data,queue))
assert.deepEqual(screen.rows.map(row=>[row.number,row.mark]),[[1,''],[2,'棄権'],[3,'棄権'],[4,'']])
assert.deepEqual(screen.followingCompetitions[0].rows.map(row=>[row.id,row.mark]),[[other.entry_id,''],[token,'変更']])
const saved=savedMeetingContent(data,queue)
assert.deepEqual(saved.groups.find(g=>g.id===from.id).order,[a.entry_id,d.entry_id])
assert.deepEqual(saved.batch.p_items.map(item=>item.type),['withdraw','change'])
assert.deepEqual(ids(starts(restoreMeeting({id:queue.meeting.id,status:'draft',revision:1,content:saved}))),names)
const legacy={...queue,meeting:{...queue.meeting,orders:{[from.id]:[d.entry_id,a.entry_id]}}}
assert.deepEqual(ids(starts(legacy)),[d.entry_id,b.entry_id,c.entry_id,a.entry_id])
assert.deepEqual(meetingOrderAfterMove(starts(legacy),d.entry_id,a.entry_id),names)
const custom={...emptyWinterQueue(),meeting:{...queue.meeting,orders:{[from.id]:[c.entry_id,d.entry_id,b.entry_id,a.entry_id]}}}
const customDraft=stage(stage(custom,wd),change)
assert.deepEqual(starts(customDraft).map(row=>[row.id,!!row.withdrawn]),[[c.entry_id,true],[d.entry_id,false],[b.entry_id,true],[a.entry_id,false]])
const undo=updateMeetingWork(data,customDraft,{...customDraft,items:[wd]})
assert.deepEqual(ids(starts(undo)),custom.meeting.orders[from.id])
assert.ok(!starts(undo)[0].withdrawn)
const committed={...data,entries:[a,{...d,start_order:2},{...b,status:'withdrawn',start_order:null,meetingWithdrawal:true},{...c,competition_id:to.id,start_order:2},other,{...b,entry_id:id(99),status:'withdrawn',start_order:null}]}
assert.deepEqual(winterStartListModel(committed,from.id,[],true).entriesByCompetition(from.id).map(row=>[row.id,row.order,!!row.withdrawn]),[[a.entry_id,1,false],[d.entry_id,2,false],[b.entry_id,3,true]])
const after=meetingDisplay(committed,date,emptyWinterQueue(),meetingRows(committed,emptyWinterQueue()))
assert.deepEqual(after.rows.map(row=>[row.id,row.mark]),[[a.entry_id,''],[d.entry_id,''],[b.entry_id,'棄権']])
const {reconcileWinterMonitor}=require('../lib/winter-monitor')
const publicData={...committed,entries:committed.entries.map(({meetingWithdrawal,...entry})=>entry)}
assert.deepEqual(reconcileWinterMonitor(after,publicData).rows.map(row=>[row.id,row.mark]),after.rows.map(row=>[row.id,row.mark]))
assert.deepEqual(data.entries.map(e=>[e.status,e.start_order]),[['active',1],['active',2],['active',3],['active',4],['active',1]])
console.log('PASS staged withdrawals and transfers, custom and legacy order, restore and undo, final order and charges, confirmed withdrawal footer')
