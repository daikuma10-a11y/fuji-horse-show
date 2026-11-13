import {timetablePhase, type TimetablePhase} from './master/timetable'
import { WINTER_EVENT_ID, WINTER_DATES, assertWinterEvent } from './winter-event'
import type { WinterEntryRow,loadWinterData } from './winter-data'
import { winterRpc } from './winter-reception'
import {isConfirmedWithdrawal,winterOfficialStarts} from './winter-confirmed-withdrawals'
import {isScrollKey,type ScrollKey} from './winter-monitor-scroll'
export type WinterMonitorRow={id:string;number:number;rider:string;horse:string;organization:string;isOp:boolean;mark:string}
export type WinterMonitorCompetition={competitionId:string;competitionNo:string;competitionName:string;date:string;inspectionTime?:string|null;startTime?:string|null;timePhase?:TimetablePhase;rows:WinterMonitorRow[];officialOrder?:string[];page:number;draft:boolean}
// The first competition stays at the top level for existing monitor clients and the publishing RPC.
export type WinterMonitorState = WinterMonitorCompetition & {version:1;eventId:string;updatedAt:string;draftId?:string;scrollController?:ScrollKey;followingCompetitions?:WinterMonitorCompetition[]}
export function winterMonitorViewId(state:WinterMonitorState){return [state.date,state.followingCompetitions?'day':state.competitionId,state.followingCompetitions?0:state.page].join('/')}
// A draft is displayed only while the publishing editor continues to send signed heartbeats.
export const draftHeartbeatMs=2500
export const draftTimeoutMs=10000
export function draftHeartbeatView(id:string){return 'order-preview/'+id}
export function officialMonitorFallback(state:WinterMonitorState):WinterMonitorState|null {
 const restore=(group:WinterMonitorCompetition)=>{
  if(!group.draft)return group
  if(!group.officialOrder)return null
  const byId=new Map(group.rows.map(row=>[row.id,row]))
  const rows=group.officialOrder.map((id,index)=>({...byId.get(id)!,number:index+1}))
  return {...group,rows,draft:false}
 }
 const first=restore(state), following=state.followingCompetitions?.map(restore)
 if(!first||following?.some(group=>!group))return null
 return {...state,...first,...(following?{followingCompetitions:following as WinterMonitorCompetition[]}:{} )}
}
export const WINTER_MONITOR_CHANNEL = `fhs-winter-display-${WINTER_EVENT_ID}`
export const WINTER_MONITOR_KEY=`fhs:winter:${WINTER_EVENT_ID}:monitor:v1`
export function winterOrderSnapshot(entries:WinterEntryRow[]){return [...entries].sort((a,b)=>a.entry_id.localeCompare(b.entry_id)).map(row=>({entryId:row.entry_id,startOrder:row.start_order,riderId:row.rider_id,horseId:row.horse_id,isOp:!!row.is_op}))}
export function moveWinterEntry(ids:string[],from:string,to:string){const a=ids.indexOf(from),b=ids.indexOf(to);if(a<0||b<0)throw new Error('移動する人馬を確認してください');const next=[...ids];next.splice(a,1);next.splice(b,0,from);return next}
export function validateWinterMonitor(value:WinterMonitorState) {
 assertWinterEvent(value.eventId)
 const invalid = () => new Error('モニター情報を確認できません')
 if (value.version !== 1 || (value.scrollController!==undefined&&!isScrollKey(value.scrollController))) throw invalid()
 const following = value.followingCompetitions
 if (following !== undefined && (!Array.isArray(following) || !WINTER_DATES.some(date => date === value.date))) throw invalid()
 const groups = [value, ...(following ?? [])]
 if (new Set(groups.map(group => group.competitionId)).size !== groups.length) throw invalid()
 for (const group of groups) {
  if(!Array.isArray(group.rows))throw invalid()
  if(group.officialOrder){
   const ids=new Set(group.rows.map(row=>row.id))
   if(!Array.isArray(group.officialOrder)||group.officialOrder.length!==group.rows.length||ids.size!==group.rows.length||new Set(group.officialOrder).size!==ids.size||group.officialOrder.some(id=>!ids.has(id)))throw invalid()
  }
  if (typeof group.competitionId !== 'string' || group.date !== value.date || !Array.isArray(group.rows) || !Number.isInteger(group.page) || group.page < 0 ||
      group.rows.some((row,index) => row.number !== index+1 || typeof row.rider !== 'string' || typeof row.horse !== 'string')) throw invalid()
 }
 return value
}
export function publishWinterMonitor(value:WinterMonitorState){validateWinterMonitor(value);try{window.localStorage.setItem(WINTER_MONITOR_KEY,JSON.stringify(value));window.dispatchEvent(new Event('winter-monitor-changed'))}catch{throw new Error('モニターに送信できません。ブラウザーの保存設定を確認してください')}}
export async function saveWinterOrder(comp:string,ids:string[],entries:WinterEntryRow[],token:string){
 for(const row of entries)assertWinterEvent(row.event_id)
 const result=await winterRpc('save_winter_start_order',{p_competition_id:comp,p_entry_ids:ids,p_expected:winterOrderSnapshot(entries)},token) as {ids?:string[];savedAt?:string}
 if(JSON.stringify(result?.ids)!==JSON.stringify(ids)||typeof result.savedAt!=='string')throw new Error('保存結果を確認できません。最新の表を読み込んでください');return result.savedAt
}

/** Refresh untouched lists; preserve a local draft when new requests arrive. */
export function winterOrderAfterRefresh(ids:string[],baseline:string,latest:string[]){return JSON.stringify(ids)===baseline?[...latest]:null}

/** A saved display follows DB changes even when the admin editor is closed. */
export function reconcileWinterMonitor(state:WinterMonitorState,data:Awaited<ReturnType<typeof loadWinterData>>,withdrawalIds?:ReadonlySet<string>){
 validateWinterMonitor(state);assertWinterEvent(data.eventId)
 const {version,eventId,updatedAt,draftId,scrollController,followingCompetitions,...first} = state
 const groups = [first, ...(followingCompetitions ?? [])]
 const previous = new Map(groups.map(group => [group.competitionId,group]))
 const daily = state.followingCompetitions !== undefined
 const competitions = data.competitions.filter(c => daily ? c.competition_date === state.date : c.id === state.competitionId)
 if (!competitions.length) throw new Error('表示中のWinter競技を確認できません')
 const refreshed = competitions.map((comp): WinterMonitorCompetition => {
  const old = previous.get(comp.id)
  const t = data.timetable.find(t=>t.competition_id===comp.id)
  const marks = new Map(old?.rows.map(row => [row.id,row.mark]))
  // The public monitor receives confirmed withdrawal IDs in the admin-published snapshot.
  const entries = winterOfficialStarts(data.entries.map(e=>(withdrawalIds?withdrawalIds.has(e.entry_id):marks.get(e.entry_id)==='棄権')?{...e,receptionWithdrawal:true}:e),comp.id)
  const rows = entries.map((e,i) => {
   const rider=data.riders.find(r=>r.id===e.rider_id),horse=data.horses.find(h=>h.id===e.horse_id) ?? (isConfirmedWithdrawal(e)?data.historicalHorses?.find(h=>h.id===e.horse_id):undefined)
   if (!rider || !horse) throw new Error('モニターの人馬を確認できません')
   return {id:e.entry_id,number:i+1,rider:rider.name,horse:horse.name,organization:e.organization_name,isOp:!!e.is_op,mark:isConfirmedWithdrawal(e)?'棄権':marks.get(e.entry_id)==='棄権'?'更新':marks.get(e.entry_id)??'更新'}
  })
  if(old?.draft && old.officialOrder && rows.length===old.officialOrder.length){
   const byId=new Map(old.rows.map(row=>[row.id,row]))
   const matches=rows.every((row,index)=>{
    const prior=byId.get(row.id)
    return old.officialOrder![index]===row.id && prior?.rider===row.rider && prior.horse===row.horse && prior.isOp===row.isOp && prior.organization===row.organization && (prior.mark==='棄権')===(row.mark==='棄権')
   })
   if(matches)return {...old,inspectionTime:t?.inspection_time,startTime:t?.start_time,timePhase:timetablePhase(t)}
  }
  return {competitionId:comp.id,competitionNo:comp.competition_no,competitionName:comp.name,date:comp.competition_date,inspectionTime:t?.inspection_time,startTime:t?.start_time,timePhase:timetablePhase(t),
   draft:false,rows,page:Math.min(old?.page??0,Math.max(0,Math.ceil(rows.length/30)-1))}
 })
 return {version,eventId,updatedAt,...(draftId?{draftId}:{}),...(scrollController?{scrollController}:{}),...refreshed[0],...(daily ? {followingCompetitions:refreshed.slice(1)} : {})}
}
