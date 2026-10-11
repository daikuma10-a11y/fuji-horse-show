import { WINTER_EVENT_ID, assertWinterEvent } from './winter-event'
import type { WinterEntryRow } from './winter-data'
import { winterRpc } from './winter-reception'
export type WinterMonitorRow={id:string;number:number;rider:string;horse:string;organization:string;isOp:boolean;mark:string}
export type WinterMonitorState={version:1;eventId:string;competitionId:string;competitionNo:string;competitionName:string;date:string;inspectionTime?:string|null;startTime?:string|null;timePhase?:'provisional'|'final';rows:WinterMonitorRow[];page:number;draft:boolean;updatedAt:string}
export const WINTER_MONITOR_KEY=`fhs:winter:${WINTER_EVENT_ID}:monitor:v1`
export function winterOrderSnapshot(entries:WinterEntryRow[]){return [...entries].sort((a,b)=>a.entry_id.localeCompare(b.entry_id)).map(row=>({entryId:row.entry_id,startOrder:row.start_order,riderId:row.rider_id,horseId:row.horse_id,isOp:!!row.is_op}))}
export function moveWinterEntry(ids:string[],from:string,to:string){const a=ids.indexOf(from),b=ids.indexOf(to);if(a<0||b<0)throw new Error('移動する人馬を確認してください');const next=[...ids];next.splice(a,1);next.splice(b,0,from);return next}
export function validateWinterMonitor(value:WinterMonitorState){assertWinterEvent(value.eventId);if(value.version!==1||!Array.isArray(value.rows)||!Number.isInteger(value.page)||value.page<0||value.rows.some((row,index)=>row.number!==index+1||typeof row.rider!=='string'||typeof row.horse!=='string'))throw new Error('モニター情報を確認できません');return value}
export function publishWinterMonitor(value:WinterMonitorState){validateWinterMonitor(value);try{window.localStorage.setItem(WINTER_MONITOR_KEY,JSON.stringify(value));window.dispatchEvent(new Event('winter-monitor-changed'))}catch{throw new Error('モニターに送信できません。ブラウザーの保存設定を確認してください')}}
export async function saveWinterOrder(comp:string,ids:string[],entries:WinterEntryRow[],token:string){
 for(const row of entries)assertWinterEvent(row.event_id)
 const result=await winterRpc('save_winter_start_order',{p_competition_id:comp,p_entry_ids:ids,p_expected:winterOrderSnapshot(entries)},token) as {ids?:string[];savedAt?:string}
 if(JSON.stringify(result?.ids)!==JSON.stringify(ids)||typeof result.savedAt!=='string')throw new Error('保存結果を確認できません。最新の表を読み込んでください');return result.savedAt
}
