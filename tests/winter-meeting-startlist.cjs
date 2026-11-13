require('./register-ts.cjs')
const assert=require('node:assert/strict')
const React=require('react')
const {renderToStaticMarkup}=require('react-dom/server')
const {WinterMeetingPanel}=require('../components/winter-meeting-panel')
const {WINTER_EVENT_ID:event_id}=require('../lib/winter-event')
const {MasterStartSelectors}=require('../components/master/start-list-controls')
const {MasterStartDaySection}=require('../components/master/start-list-day')

const comp=(id,number,date)=>({id,event_id,competition_no:number,competition_date:date,name:'競技'+number,official:false})
const competitions=[comp('fri','①','2026-11-13'),comp('sat','1','2026-11-14'),comp('sat-empty','15','2026-11-14'),comp('sun','20','2026-11-15')]
const entry=(entry_id,competition_id,start_order,status='active')=>({entry_id,event_id,competition_id,start_order,status,rider_id:'r',horse_id:'h',organization_id:'o',organization_name:'所属',is_op:true})
const data={eventId:event_id,competitions,organizations:[{id:'o',event_id,name:'所属'}],riders:[{id:'r',event_id,name:'選手',organization_id:'o'}],horses:[{id:'h',event_id,name:'馬',organization_id:'o'}],timetable:[],entries:[
 entry('fri-entry','fri',1),entry('second','sat',2),entry('first','sat',1),entry('withdrawn','sat',null,'withdrawn'),entry('sunday','sun',1)]}
let selectedDate,openDate
const props={data,dataError:'',session:{},onStartlist:date=>{openDate=date},onSession(){throw Error('session mutation')},onChanged(){throw Error('unexpected write')}}
const children=tree=>React.Children.toArray(tree.props.children)
function panel(){
 const original={useState:React.useState,useEffect:React.useEffect,useRef:React.useRef}
 let state=0
 try{
  React.useState=initial=>state++===0?[selectedDate??initial,v=>{selectedDate=v}]:[initial,()=>{}]
  React.useEffect=()=>{};React.useRef=()=>({current:null})
  return WinterMeetingPanel(props)
 }finally{Object.assign(React,original)}
}
function check(date,ids,entryIds){
 const [starts,queue]=children(panel())
 const nodes=children(starts),selectors=nodes.find(n=>n.type===MasterStartSelectors)
 assert.equal(selectors.props.date,date)
 assert.deepEqual(selectors.props.dates.map(d=>d.value),['2026-11-14','2026-11-15'])
 assert.deepEqual(nodes.filter(n=>n.type===MasterStartDaySection).map(n=>n.props.id),ids.map(id=>'meeting-'+id))
 const html=renderToStaticMarkup(starts)
 assert.deepEqual([...html.matchAll(/data-start-entry-id="([^"]+)"/g)].map(m=>m[1]),entryIds)
 if(entryIds.length)for(const name of ['選手','馬','所属','OP'])assert.ok(html.includes(name))
 assert.ok(!html.includes('data-start-reorderable'))
 assert.ok(renderToStaticMarkup(queue).includes('追加を保留入力'))
 const open=children(nodes.find(n=>n.type==='div'))[0]
 open.props.onClick();assert.equal(openDate,date)
 return selectors
}
const saturday=check('2026-11-14',['sat','sat-empty'],['first','second'])
saturday.props.onDate('2026-11-15')
check('2026-11-15',['sun'],['sunday'])
props.data={...data,entries:[...data.entries,entry('new','sun',2)]}
check('2026-11-15',['sun'],['sunday','new'])
props.data=null
assert.match(renderToStaticMarkup(children(panel())[0]),/読み込んでいます/)
props.dataError='network'
assert.match(renderToStaticMarkup(children(panel())[0]),/取得できません/)
console.log('PASS Saturday default, Sunday switch, saved entry order, withdrawn exclusion, fresh starts, queue access and handoff of selected day')
