import {meetingEntries, type MeetingPreviewRequest} from './master/meeting-preview'
import {WINTER_EVENT_ID} from './winter-event'
import {emptyWinterQueue, validateWinterQueue, winterBatchPayload, type WinterQueue, type WinterDraft} from './winter-batch'
import {reviewWinterChange} from './winter-change'
import {winterOrderSnapshot,type WinterMonitorState} from './winter-monitor'
import {winterRpc} from './winter-reception'
import {winterStartListModel} from './winter-start-list-model'
import type {loadWinterData} from './winter-data'

type Data = Awaited<ReturnType<typeof loadWinterData>>
export type MeetingWork = {id:string;revision:number;saved:boolean;orders:Record<string,string[]>;baselines:Record<string,ReturnType<typeof winterOrderSnapshot>>}
export const newMeetingWork = ():MeetingWork => ({id:crypto.randomUUID(),revision:0,saved:false,orders:{},baselines:{}})
function requestFor(item:WinterDraft):MeetingPreviewRequest {
 if(item.type==='withdraw'){
  const e=item.entry
  return {id:item.id,orgId:item.organizationId,withdraw:{entryId:e.entry_id,competitionId:e.competition_id,playerId:e.rider_id,horseId:e.horse_id}}
 }
 const target=item.type==='add'?item.input:item.input.target
 const common={id:target.id,orgId:target.organization.id}
 if(item.type==='add')return {...common,add:{competitionId:target.competition.id,playerId:target.rider.id,horseId:target.horse.id,isOp:target.selection.isOp,note:target.note??''}}
 const e=item.input.original, review=reviewWinterChange(item.input,{requireVisitor:false})
 return {...common,change:{entryId:e.entry_id,fromCompetitionId:e.competition_id,fromPlayerId:e.rider_id,fromHorseId:e.horse_id,toCompetitionId:target.competition.id,toPlayerId:target.rider.id,toHorseId:target.horse.id,toIsOp:target.selection.isOp,treatedAsWithdrawAdd:review.treatedAsWithdrawAdd,changedFields:review.changedFields.filter(field=>field!=='membership')}}
}
export function meetingBaseline(data:Data,id:string){
 return winterOrderSnapshot(data.entries.filter(e=>e.competition_id===id&&!['wd','withdrawn'].includes(e.status.toLowerCase())))
}
export function meetingAffected(queue:WinterQueue){
 const ids=new Set(Object.keys(queue.meeting?.orders??{}))
 for(const item of queue.items){
  if(item.type==='withdraw')ids.add(item.entry.competition_id)
  else if(item.type==='add')ids.add(item.input.competition.id)
  else {ids.add(item.input.original.competition_id);ids.add(item.input.target.competition.id)}
 }
 return [...ids].sort()
}
export function meetingRows(data:Data,queue:WinterQueue){
 const models=new Map(data.competitions.map(c=>[c.id,winterStartListModel(data,c.id,[])]))
 const baseEntries=data.competitions.flatMap(c=>models.get(c.id)!.entriesByCompetition(c.id))
 const rows=meetingEntries({baseEntries,staged:queue.items.map(item=>({request:requestFor(item)})),orders:queue.meeting?.orders??{}},data.competitions)
 return {models,rows}
}
/** Maintain locally moved rows when a staged entry replaces an existing place. */
export function updateMeetingWork(data:Data,before:WinterQueue,after:WinterQueue):WinterQueue{
 const work=before.meeting??newMeetingWork()
 const orders={...work.orders},baselines={...work.baselines}
 const inserted=after.items.length>before.items.length
 // Deserialized snapshots are comparable by their stable request IDs.
 const idsBefore=new Set(before.items.map(item=>requestFor(item).id)),idsAfter=new Set(after.items.map(item=>requestFor(item).id))
 const item=inserted?after.items.find(item=>!idsBefore.has(requestFor(item).id)):before.items.find(item=>!idsAfter.has(requestFor(item).id))
 if(!item)return {...after,meeting:{...work,saved:false}}
 const req=requestFor(item),source=req.change?.entryId??req.withdraw?.entryId
 const previousRows=meetingRows(data,before).rows
 const natural=meetingRows(data,{...after,meeting:{...work,orders:{}}}).rows
 const token='request:'+req.id
 for(const group of meetingAffected({...emptyWinterQueue(),items:[item]})){
  baselines[group]??=meetingBaseline(data,group)
  if(!orders[group])continue
  const previous=previousRows.filter(e=>e.competitionId===group&&!e.withdrawn).map(e=>e.id)
  const defaults=natural.filter(e=>e.competitionId===group&&!e.withdrawn).map(e=>e.id)
  const sequence=previous.filter(id=>defaults.includes(id))
  for(const id of defaults.filter(id=>!sequence.includes(id))){
   const inPlace=inserted&&id===token&&req.change&&!req.change.treatedAsWithdrawAdd&&req.change.fromCompetitionId===group?previous.indexOf(source!):
     !inserted&&id===source?previous.indexOf(token):-1
   sequence.splice(inPlace<0?defaults.indexOf(id):Math.min(inPlace,sequence.length),0,id)
  }
  orders[group]=sequence
 }
 return {...after,meeting:{...work,saved:false,orders,baselines}}
}
export function meetingDisplay(data:Data,date:string,queue:WinterQueue,preview:ReturnType<typeof meetingRows>):WinterMonitorState|null{
 const affected=new Set(meetingAffected(queue))
 const groups=data.competitions.filter(c=>c.competition_date===date).map(c=>{
  const model=preview.models.get(c.id)!,time=data.timetable.find(t=>t.competition_id===c.id)
  return {competitionId:c.id,competitionNo:c.competition_no,competitionName:c.name,date,inspectionTime:time?.inspection_time,startTime:time?.start_time,timePhase:time?.phase,page:0,draft:affected.has(c.id),
   rows:preview.rows.filter(e=>e.competitionId===c.id).map((e,i)=>({id:e.id,number:i+1,rider:model.getPlayer(e.playerId)?.name??'要確認',horse:model.getHorse(e.horseId)?.name??'要確認',organization:model.getOrg(e.organizationId??'')?.name??'要確認',isOp:!!e.isOp,mark:e.withdrawn?'棄権':e.adminChangeMark==='added'?'追加':e.adminChangeMark==='changed'?'変更':''}))}
 })
 return groups.length?{...groups[0],version:1,eventId:WINTER_EVENT_ID,updatedAt:new Date().toISOString(),followingCompetitions:groups.slice(1)}:null
}
export function savedMeetingContent(data:Data,queue:WinterQueue){
 const work=queue.meeting
 if(!work)throw new Error('打ち合わせ会の下書きを確認してください')
 const {rows}=meetingRows(data,queue)
 const groups=meetingAffected(queue).map(id=>{
  const latest=meetingBaseline(data,id),expected=work.baselines[id]??latest
  if(expected.length!==latest.length||expected.some((row,i)=>!latest[i]||row.entryId!==latest[i].entryId||row.startOrder!==latest[i].startOrder||row.riderId!==latest[i].riderId||row.horseId!==latest[i].horseId||row.isOp!==latest[i].isOp))throw new Error('相談中に正式出番表が更新されました。保留内容を保存して、最新の出番表で確認してください')
  return {id,expected,order:rows.filter(e=>e.competitionId===id&&!e.withdrawn).map(e=>e.id)}
 })
 const batch=queue.items.length?winterBatchPayload(queue,'meeting'):{p_items:[],p_expected_total:0}
 return {items:queue.items,orders:work.orders,groups,batch}
}
type SavedContent=ReturnType<typeof savedMeetingContent>
type SavedDraft={id:string;revision:number;status:'draft'|'applied'|'archived';content:SavedContent}
export function restoreMeeting(record:SavedDraft):WinterQueue{
 if(record.status!=='draft'||!Array.isArray(record.content?.groups))throw new Error('保存済み下書きを確認できません')
 return validateWinterQueue({...emptyWinterQueue(),items:record.content.items,meeting:{id:record.id,revision:record.revision,saved:true,orders:record.content.orders,baselines:Object.fromEntries(record.content.groups.map(g=>[g.id,g.expected]))}},'meeting')
}
export async function meetingTransaction(action:'load'|'save'|'apply'|'archive',work:MeetingWork|null,token:string,content?:SavedContent){
 return await winterRpc('winter_meeting_draft',{p_action:action,p_id:work?.id??null,p_revision:work?.revision??0,p_content:content??null},token,AbortSignal.timeout(35000)) as SavedDraft|null
}
