require('./register-ts.cjs')
const assert=require('node:assert/strict')
const React=require('react')
const {renderToStaticMarkup}=require('react-dom/server')
const {WinterPostRegistration}=require('../components/winter-settlement-actions')
const {postAddition, postChange, savePostItems}=require('../lib/winter-post-registration')
const {WINTER_EVENT_ID:event_id,winterCompetition}=require('../lib/winter-event')
const date='2026-11-14', club={id:'club-h',event_id,name:'馬の団体'},bill={id:'club-r',event_id,name:'選手の団体'}
const template=winterCompetition('5')
const comp={event_id,id:'comp',competition_date:date,competition_no:'5',name:template.name,official:false,fee:template.fee,op_fee:template.opFee,member_fee:template.memberFee,nonmember_fee:template.nonmemberFee}
const rider={event_id,id:'r1',name:'選手甲',organization_id:bill.id},horse={event_id,id:'h1',name:'馬甲',organization_id:club.id}
const entry={event_id,entry_id:'e1',competition_id:comp.id,start_order:4,status:'active',rider_id:rider.id,horse_id:horse.id,is_op:false}
const data={eventId:event_id,organizations:[club,bill],riders:[rider],horses:[horse],entries:[entry],competitions:[comp]}
const props={data,session:{email:'staff@example.invalid'},onChanged(){},onSession(){},onChooseParticipants(){}}
const html=renderToStaticMarkup(React.createElement(WinterPostRegistration,props))
assert.match(html,/大会日を選んでください/)
assert.doesNotMatch(html,/type="radio"|棄権|受付申請/)
const id=()=>crypto.randomUUID()
const input={id:id(),organization:club,competition:comp,rider,horse,visitorName:'本部',selection:{membership:'member',isOp:true}}
const add=postAddition(input),repeat=postAddition({...input,id:id()})
const change=postChange({original:entry,from:comp,fromSelection:{membership:'member',isOp:false},target:{...input,id:id()}},'当日変更')
assert.equal(add.total,7000)
assert.equal(change.total,2000)
assert.equal(change.billingOrg,bill.id)
// Drive the actual registration screen, its shared editors, and their event handlers.
const {LoadedWinterReception}=require('../components/winter-master-reception-form')
const {WinterMasterDateSelect,WinterMasterCompetitionList,WinterMasterStartList}=require('../components/winter-reception-selectors')
const {MasterAddForm}=require('../components/master/add-form')
const {MasterChangeForm}=require('../components/master/change-form')
const {winterMasterCompetition}=require('../lib/winter-master-reception')
function mount(fn,getProps){
 const state=[]
 return ()=>{
  let slot=0
  const originals={useState:React.useState,useRef:React.useRef}
  React.useState=initial=>{
   const i=slot++
   if(!(i in state))state[i]=initial
   return [state[i],value=>{state[i]=typeof value==='function'?value(state[i]):value}]
  }
  React.useRef=initial=>state[slot++]??={current:initial}
  try{return fn(getProps())}finally{Object.assign(React,originals)}
 }
}
function element(node,predicate){
 if(!React.isValidElement(node))return undefined
 if(predicate(node))return node
 for(const child of React.Children.toArray(node.props.children)){
  const found=element(child,predicate)
  if(found)return found
 }
}
function runWorkflow(){
 global.requestAnimationFrame=callback=>{callback();return 1}
 const view=mount(WinterPostRegistration,()=>props)
 const pick=(type)=>element(view(),n=>n.type===type)
 const click=label=>{const b=element(view(),n=>n.type==='button'&&n.props.children===label);assert.ok(b,label);b.props.onClick()}
 pick(WinterMasterDateSelect).props.onSelect(date)
 pick(WinterMasterCompetitionList).props.onSelect(winterMasterCompetition(comp))
 click('この競技に追加・再走行')
 const form=()=>pick(LoadedWinterReception).props
 let editor=mount(LoadedWinterReception,form)
 assert.equal(editor().type,MasterAddForm)
 assert.equal(editor().props.adapter.settlementOnly,true)
 editor().props.adapter.inputFields({competition:winterMasterCompetition(comp),organizationId:bill.id}).props.children[1].props.onChange({membership:'member'})
 const addAdapter=editor().props.adapter
 addAdapter.stageAdd({competitionId:comp.id,playerId:rider.id,horseId:horse.id,isOp:true,organizationId:bill.id,note:''})
 addAdapter.onStaged()
 assert.ok(pick(WinterMasterStartList))
 click('競技を選び直す')
 pick(WinterMasterCompetitionList).props.onSelect(winterMasterCompetition(comp))
 pick(WinterMasterStartList).props.onSelect({id:entry.entry_id,competitionId:comp.id,playerId:rider.id,horseId:horse.id,order:4})
 editor=mount(LoadedWinterReception,form)
 assert.equal(editor().type,MasterChangeForm)
 const fields=editor().props.adapter.inputFields({entry:{isOp:false},organizationId:bill.id,fromCompetition:winterMasterCompetition(comp),toCompetition:winterMasterCompetition(comp),toIsOp:true})
 for(const field of React.Children.toArray(fields.props.children).filter(e=>typeof e.type==='function'&&e.props.competition))field.props.onChange({membership:'member'})
 element(fields,n=>n.type==='textarea').props.onChange({target:{value:'当日変更'}})
 const changeAdapter=editor().props.adapter
 changeAdapter.stageChange({entryId:entry.entry_id,toCompetitionId:comp.id,toPlayerId:rider.id,toHorseId:horse.id,toIsOp:true,organizationId:bill.id,changedFields:['op']})
 changeAdapter.onStaged()
 assert.ok(pick(WinterMasterStartList))
 const review=element(view(),n=>n.props.id==='winter-post-review')
 const content=renderToStaticMarkup(review)
 assert.match(content,/未保存 2件/)
 assert.match(content,/9,000円/)
 assert.match(content,/選手の団体/)
 assert.doesNotMatch(content,/棄権/)
 click('この競技に追加・再走行')
 assert.equal(form().initialCompetition.id,comp.id)
 assert.equal(form().initialEntry,undefined)
}
runWorkflow()

const store=new Map(),calls=[]
let interrupt=true
global.fetch=async(url,options)=>{
 const parsed=new URL(url)
 if(options.method==='POST'){
  const action=parsed.pathname.split('/').at(-1)
  assert.ok(['save_winter_settlement_only_batch','save_winter_settlement_actions_batch'].includes(action))
  const rows=JSON.parse(options.body).p_rows
  calls.push({action,ids:rows.map(r=>r.id)})
  for(const row of rows){
   const saved={...row,action_type:row.action??'add',organization_key:bill.id,event_id,reverses_id:null,
    entry_fee:row.inputs.entryFee??4000,fee_amount:row.inputs.expectedTotal??(row.inputs.entryFee+3000)}
   if(store.has(row.id))assert.deepEqual(store.get(row.id),saved)
   store.set(row.id,saved)
  }
  if(interrupt&&rows[0].action==='change'){interrupt=false;throw Error('lost response')}
  return Response.json(rows.map(r=>r.id))
 }
 assert.ok(parsed.pathname.endsWith('/fhs_winter_settlement_only'))
 const ids=parsed.searchParams.get('id').slice(4,-1).split(',')
 return Response.json(ids.map(key=>store.get(key)))
}
;(async()=>{
 let pending=[add,change,repeat]
 const remove=ids=>{pending=pending.filter(i=>!ids.includes(i.id))}
 await assert.rejects(savePostItems(pending,'test',remove),err=>err.uncertain&&err.completedIds.length===2)
 assert.deepEqual(pending.map(i=>i.id),[change.id])
 await savePostItems(pending,'test',remove)
 assert.equal(pending.length,0)
 assert.deepEqual(calls.map(c=>c.ids),[[add.id,repeat.id],[change.id],[change.id]])
 assert.equal(store.size,3)
 console.log('PASS: date-first entry, cross-club OP addition and repeat, mixed changes, settlement-only readback and idempotent partial retry')
})().catch(e=>{console.error(e);process.exitCode=1})
