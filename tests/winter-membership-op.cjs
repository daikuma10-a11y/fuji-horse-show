require('./register-ts.cjs')
const assert=require('node:assert/strict')
const React=require('react')
const {renderToStaticMarkup}=require('react-dom/server')
const {AppRouterContext}=require('next/dist/shared/lib/app-router-context.shared-runtime')
const {LoadedWinterReception}=require('../components/winter-master-reception-form')
const {winterCompetition,WINTER_EVENT_ID:event_id}=require('../lib/winter-event')
const {winterMasterCompetition}=require('../lib/winter-master-reception')
const {reviewWinterAdd}=require('../lib/winter-reception')
const {reviewWinterChange}=require('../lib/winter-change')
const {emptyWinterQueue,winterBatchPayload}=require('../lib/winter-batch')
const {meetingRows,meetingDisplay}=require('../lib/winter-meeting')
const {winterStartListModel}=require('../lib/winter-start-list-model')
const uid=n=>'00000000-0000-4000-8000-'+String(n).padStart(12,'0')
const organization={event_id,id:uid(1),name:'テスト団体'}
const rider={event_id,id:uid(2),organization_id:organization.id,name:'選手',jef_member_no:'00123'}
const horse={event_id,id:uid(3),organization_id:organization.id,name:'馬',jef_registration_no:'00456'}
for (const no of ['5','25','8','32','1','6','①']) {
 const source=winterCompetition(no)
 const competition={event_id,id:uid(4),competition_no:no,competition_date:source.date,name:source.name,official:source.official,fee:source.fee,op_fee:source.opFee,member_fee:source.memberFee,nonmember_fee:source.nonmemberFee}
 const entry={event_id,entry_id:uid(5),rider_id:rider.id,horse_id:horse.id,competition_id:competition.id,competition_no:no,organization_id:organization.id,organization_name:organization.name,start_order:1,is_op:false,status:'active'}
 const data={eventId:event_id,organizations:[organization],riders:[rider],horses:[horse],competitions:[competition],entries:[entry],timetable:[]}
 const initialCompetition=winterMasterCompetition(competition)
 const initialEntry=winterStartListModel(data,competition.id,[]).entriesByCompetition(competition.id)[0]
 for (const scope of ['meeting','reception']) for (const mode of ['add','change']) {
  const form=React.createElement(LoadedWinterReception,{data,scope,mode,initialCompetition,initialEntry:mode==='change'?initialEntry:undefined,onClose(){}})
  const html=renderToStaticMarkup(React.createElement(AppRouterContext.Provider,{value:{}},form))
  assert.equal(html.includes('name="entry-op"'),!['6','①'].includes(no),scope+'/'+mode+'/'+no)
 }
 if (source.memberFee==null) continue
 for (const membership of ['member','nonmember']) {
  const selection={membership,isOp:true,instructorConfirmed:source.instructorRequired}
  const fee=(membership==='member'?source.memberFee:source.nonmemberFee)-source.membershipOpDiscount
  const input={id:uid(6),competition,rider,horse,organization,selection,visitorName:'担当',masterForm:true}
  const original={...selection,isOp:false}
  const change={from:competition,original:entry,fromSelection:original,target:input}
  assert.equal(reviewWinterAdd(input).entryFee,fee)
  assert.equal(reviewWinterChange(change).toEntryFee,fee)
  assert.deepEqual(reviewWinterChange(change).changedFields,['op'])
  assert.equal(reviewWinterChange(change).fee.total,2000)
  assert.throws(()=>reviewWinterAdd({...input,selection:{...selection,membership:undefined}}),/会員/)
  if(source.instructorRequired)assert.throws(()=>reviewWinterAdd({...input,selection:{...selection,instructorConfirmed:false}}),/資格/)
  for(const item of [{type:'add',input},{type:'change',input:change}]) {
   const queue={...emptyWinterQueue(),items:[item]}
   for(const scope of ['meeting','reception']) {
    const batch=winterBatchPayload(queue,scope)
    assert.equal(batch.p_items[0].args.p_is_op,true)
    assert.equal(batch.p_items[0].args.p_membership,membership)
   }
   const preview=meetingDisplay(data,source.date,queue,meetingRows(data,queue))
   assert.equal(preview.rows.filter(r=>r.id==='request:'+input.id&&r.isOp).length,1)
  }
 }
}
console.log('PASS OP add/change in both meeting and reception, fee categories, qualification, queue and monitor for all four competitions')
