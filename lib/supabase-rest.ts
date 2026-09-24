import type { AppRequest, Competition, FeeBreakdown, Horse, Player, StartEntry } from "./types"

const SUPABASE_URL = "https://mhgyhyxagkkwdiepifdp.supabase.co"
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95"
export const AUTUMN_EVENT_ID = "2af66251-66a2-4c51-8180-a5badf0584d4"

const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" }
type RequestRow={id:string;request_type:AppRequest["type"];status:AppRequest["status"];created_at:string;fee:number|null;fee_amount?:number|null;organization_id?:string|null;original_entry_id?:string|null;entry_id?:string|null;target_competition_id?:string|null;from_competition_id?:string|null;to_competition_id?:string|null;rider_id?:string|null;horse_id?:string|null;treated_as_withdraw_add?:boolean|null;note?:string|null;request_note?:string|null;payload:unknown}
type EntryRow={entry_id:string;competition_id:string;competition_no:string;start_order:number;status:string;rider_id:string;rider_name:string;horse_id:string;horse_name:string;organization_name:string}
type CompetitionFeeRow={competition_no:string;fee:number|null}
export type EntryMatch={row:EntryRow;local:StartEntry|null;reason:"matched"|"not_found"|"ambiguous"}

const norm=(value:string|undefined)=> (value??"").normalize("NFKC").replace(/[\s　]+/g,"").toLocaleLowerCase("ja-JP")
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{}
const str=(value:unknown)=>typeof value==="string"?value:""
const bool=(value:unknown)=>value===true
const emptyFee=(total:number):FeeBreakdown=>({addBase:0,addEntry:0,changeBase:0,competitionDiff:0,total:Number.isFinite(total)?total:0})

function normalizeRequestRow(row:RequestRow):AppRequest|null{
 const p=obj(row.payload),type=row.request_type,status=row.status
 if(!["add","change","withdraw"].includes(type)||!["pending","reflected"].includes(status))return null
 const total=Number(row.fee_amount??row.fee??0),orgId=str(p.orgId)||row.organization_id||""
 const base={id:row.id,type,status,createdAt:row.created_at,orgId,fee:emptyFee(total)} as AppRequest
 if(type==="add"){
  const competitionId=str(p.competitionId)||row.target_competition_id||row.to_competition_id||"",playerId=str(p.playerId)||row.rider_id||"",horseId=str(p.horseId)||row.horse_id||""
  if(!competitionId||!playerId||!horseId)return null
  return {...base,add:{competitionId,playerId,horseId,note:str(p.note)||row.note||row.request_note||""}}
 }
 if(type==="withdraw"){
  const entryId=str(p.entryId)||row.entry_id||row.original_entry_id||"",competitionId=str(p.competitionId)||row.from_competition_id||"",playerId=str(p.playerId)||row.rider_id||"",horseId=str(p.horseId)||row.horse_id||""
  if(!entryId||!competitionId||!playerId||!horseId)return null
  return {...base,withdraw:{entryId,competitionId,playerId,horseId}}
 }
 const entryId=str(p.entryId)||row.entry_id||row.original_entry_id||"",fromCompetitionId=str(p.fromCompetitionId)||row.from_competition_id||"",fromPlayerId=str(p.fromPlayerId)||row.rider_id||"",fromHorseId=str(p.fromHorseId)||row.horse_id||"",toCompetitionId=str(p.toCompetitionId)||row.to_competition_id||row.target_competition_id||"",toPlayerId=str(p.toPlayerId)||row.rider_id||"",toHorseId=str(p.toHorseId)||row.horse_id||""
 if(!entryId||!fromCompetitionId||!fromPlayerId||!fromHorseId||!toCompetitionId||!toPlayerId||!toHorseId)return null
 const changedFields=Array.isArray(p.changedFields)?p.changedFields.filter((v):v is "competition"|"player"|"horse"=>v==="competition"||v==="player"||v==="horse"):[]
 return {...base,change:{entryId,fromCompetitionId,fromPlayerId,fromHorseId,toCompetitionId,toPlayerId,toHorseId,changedFields,treatedAsWithdrawAdd:bool(p.treatedAsWithdrawAdd)||row.treated_as_withdraw_add===true}}
}

export async function loadReceptionRequests():Promise<AppRequest[]>{
 const select="id,request_type,status,created_at,fee,fee_amount,organization_id,original_entry_id,entry_id,target_competition_id,from_competition_id,to_competition_id,rider_id,horse_id,treated_as_withdraw_add,note,request_note,payload"
 const url=`${SUPABASE_URL}/rest/v1/reception_requests?event_id=eq.${AUTUMN_EVENT_ID}&select=${select}&order=created_at.desc`
 const response=await fetch(url,{headers,cache:"no-store"});if(!response.ok)throw new Error(`受付データ取得失敗: ${response.status}`)
 const rows=await response.json() as RequestRow[]
 return rows.map(normalizeRequestRow).filter((row):row is AppRequest=>row!==null)
}

export async function loadCompetitionFees():Promise<Map<number,number>>{const response=await fetch(`${SUPABASE_URL}/rest/v1/competitions?event_id=eq.${AUTUMN_EVENT_ID}&select=competition_no,fee`,{headers,cache:"no-store"});if(!response.ok)throw new Error(`競技料金取得失敗: ${response.status}`);const rows=await response.json() as CompetitionFeeRow[];return new Map(rows.map(row=>[Number(row.competition_no),Number(row.fee??0)]))}

export async function saveReceptionRequest(request:AppRequest):Promise<void>{const body={id:request.id,event_id:AUTUMN_EVENT_ID,request_type:request.type,fee_amount:request.fee.total,fee:request.fee.total,status:request.status,source:"fuji-horse-show-web",treated_as_withdraw_add:request.change?.treatedAsWithdrawAdd??false,note:request.add?.note||null,payload:request};const response=await fetch(`${SUPABASE_URL}/rest/v1/reception_requests`,{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify(body)});if(!response.ok)throw new Error(`受付データ保存失敗: ${response.status}`)}

export async function markReceptionRequestReflected(request:AppRequest):Promise<void>{const response=await fetch(`${SUPABASE_URL}/rest/v1/reception_requests?id=eq.${request.id}&event_id=eq.${AUTUMN_EVENT_ID}`,{method:"PATCH",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({status:"reflected",reflected_at:new Date().toISOString(),payload:{...request,status:"reflected"}})});if(!response.ok)throw new Error(`受付反映状態の保存失敗: ${response.status}`)}

export async function loadAutumnEntryRows():Promise<EntryRow[]>{const select="entry_id,competition_id,competition_no,start_order,status,rider_id,rider_name,horse_id,horse_name,organization_name";const response=await fetch(`${SUPABASE_URL}/rest/v1/reception_entries?event_id=eq.${AUTUMN_EVENT_ID}&select=${select}&order=competition_no.asc,start_order.asc`,{headers,cache:"no-store"});if(!response.ok)throw new Error(`出番表データ取得失敗: ${response.status}`);return response.json() as Promise<EntryRow[]>}

export function reconcileAutumnEntries(rows:EntryRow[],entries:StartEntry[],competitions:Competition[],players:Player[],horses:Horse[]):EntryMatch[]{return rows.map(row=>{const competition=competitions.find(c=>c.number===Number(row.competition_no));if(!competition)return{row,local:null,reason:"not_found"};const candidates=entries.filter(e=>e.competitionId===competition.id&&e.order===row.start_order&&norm(players.find(p=>p.id===e.playerId)?.name)===norm(row.rider_name)&&norm(horses.find(h=>h.id===e.horseId)?.name)===norm(row.horse_name));if(candidates.length===1)return{row,local:candidates[0],reason:"matched"};if(candidates.length>1)return{row,local:null,reason:"ambiguous"};return{row,local:null,reason:"not_found"}})}