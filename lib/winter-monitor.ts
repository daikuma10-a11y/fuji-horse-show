import { WINTER_EVENT_ID, WINTER_DATES, assertWinterEvent } from './winter-event'
import type { WinterEntryRow,loadWinterData } from './winter-data'
import { winterRpc } from './winter-reception'
export type WinterMonitorRow={id:string;number:number;rider:string;horse:string;organization:string;isOp:boolean;mark:string}
export type WinterMonitorCompetition={competitionId:string;competitionNo:string;competitionName:string;date:string;inspectionTime?:string|null;startTime?:string|null;timePhase?:'provisional'|'final';rows:WinterMonitorRow[];page:number;draft:boolean}
// The first competition stays at the top level for existing monitor clients and the publishing RPC.
export type WinterMonitorState = WinterMonitorCompetition & {version:1;eventId:string;updatedAt:string;followingCompetitions?:WinterMonitorCompetition[]}
export const WINTER_MONITOR_KEY=`fhs:winter:${WINTER_EVENT_ID}:monitor:v1`
export function winterOrderSnapshot(entries:WinterEntryRow[]){return [...entries].sort((a,b)=>a.entry_id.localeCompare(b.entry_id)).map(row=>({entryId:row.entry_id,startOrder:row.start_order,riderId:row.rider_id,horseId:row.horse_id,isOp:!!row.is_op}))}
export function moveWinterEntry(ids:string[],from:string,to:string){const a=ids.indexOf(from),b=ids.indexOf(to);if(a<0||b<0)throw new Error('移動する人馬を確認してください');const next=[...ids];next.splice(a,1);next.splice(b,0,from);return next}
export function validateWinterMonitor(value:WinterMonitorState) {
 assertWinterEvent(value.eventId)
 const invalid = () => new Error('モニター情報を確認できません')
 if (value.version !== 1) throw invalid()
 const following = value.followingCompetitions
 if (following !== undefined && (!Array.isArray(following) || !WINTER_DATES.some(date => date === value.date))) throw invalid()
 const groups = [value, ...(following ?? [])]
 if (new Set(groups.map(group => group.competitionId)).size !== groups.length) throw invalid()
 for (const group of groups) {
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
export function reconcileWinterMonitor(state:WinterMonitorState,data:Awaited<ReturnType<typeof loadWinterData>>){
 validateWinterMonitor(state);assertWinterEvent(data.eventId)
 const {version,eventId,updatedAt,followingCompetitions,...first} = state
 const groups = [first, ...(followingCompetitions ?? [])]
 const previous = new Map(groups.map(group => [group.competitionId,group]))
 const daily = state.followingCompetitions !== undefined
 const competitions = data.competitions.filter(c => daily ? c.competition_date === state.date : c.id === state.competitionId)
 if (!competitions.length) throw new Error('表示中のWinter競技を確認できません')
 const refreshed = competitions.map((comp): WinterMonitorCompetition => {
  const old = previous.get(comp.id)
  if (old?.draft) return old
  const marks = new Map(old?.rows.map(row => [row.id,row.mark]))
  const entries = data.entries.filter(e => e.competition_id === comp.id && !['wd','withdrawn'].includes(e.status.toLowerCase()))
  const rows = entries.sort((a,b) => a.start_order-b.start_order || a.entry_id.localeCompare(b.entry_id)).map((e,i) => {
   const rider=data.riders.find(r=>r.id===e.rider_id),horse=data.horses.find(h=>h.id===e.horse_id)
   if (!rider || !horse) throw new Error('モニターの人馬を確認できません')
   return {id:e.entry_id,number:i+1,rider:rider.name,horse:horse.name,organization:e.organization_name,isOp:!!e.is_op,mark:marks.get(e.entry_id)??'更新'}
  })
  const t = data.timetable.find(t=>t.competition_id===comp.id)
  return {competitionId:comp.id,competitionNo:comp.competition_no,competitionName:comp.name,date:comp.competition_date,inspectionTime:t?.inspection_time,startTime:t?.start_time,timePhase:t?.phase,
   draft:false,rows,page:Math.min(old?.page??0,Math.max(0,Math.ceil(rows.length/30)-1))}
 })
 return {version,eventId,updatedAt,...refreshed[0],...(daily ? {followingCompetitions:refreshed.slice(1)} : {})}
}
