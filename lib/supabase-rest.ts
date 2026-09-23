import type { AppRequest, Competition, Horse, Player, StartEntry } from "./types"

const SUPABASE_URL = "https://mhgyhyxagkkwdiepifdp.supabase.co"
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95"
export const AUTUMN_EVENT_ID = "2af66251-66a2-4c51-8180-a5badf0584d4"

const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" }
type RequestRow={id:string;request_type:AppRequest["type"];status:AppRequest["status"];created_at:string;fee:number;payload:AppRequest}
type EntryRow={entry_id:string;competition_id:string;competition_no:string;start_order:number;status:string;rider_id:string;rider_name:string;horse_id:string;horse_name:string;organization_name:string}
export type EntryMatch={row:EntryRow;local:StartEntry|null;reason:"matched"|"not_found"|"ambiguous"}

const norm=(value:string|undefined)=> (value??"").normalize("NFKC").replace(/[\s　]+/g,"").toLocaleLowerCase("ja-JP")

export async function loadReceptionRequests():Promise<AppRequest[]>{const url=`${SUPABASE_URL}/rest/v1/reception_requests?event_id=eq.${AUTUMN_EVENT_ID}&select=id,request_type,status,created_at,fee,payload&order=created_at.desc`;const response=await fetch(url,{headers,cache:"no-store"});if(!response.ok)throw new Error(`受付データ取得失敗: ${response.status}`);const rows=await response.json() as RequestRow[];return rows.map(row=>({...row.payload,id:row.id,type:row.request_type,status:row.status,createdAt:row.created_at}))}

export async function saveReceptionRequest(request:AppRequest):Promise<void>{const body={id:request.id,event_id:AUTUMN_EVENT_ID,request_type:request.type,fee_amount:request.fee.total,fee:request.fee.total,status:request.status,source:"fuji-horse-show-web",treated_as_withdraw_add:request.change?.treatedAsWithdrawAdd??false,note:request.add?.note||null,payload:request};const response=await fetch(`${SUPABASE_URL}/rest/v1/reception_requests`,{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify(body)});if(!response.ok)throw new Error(`受付データ保存失敗: ${response.status}`)}

export async function markReceptionRequestReflected(request:AppRequest):Promise<void>{const response=await fetch(`${SUPABASE_URL}/rest/v1/reception_requests?id=eq.${request.id}&event_id=eq.${AUTUMN_EVENT_ID}`,{method:"PATCH",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({status:"reflected",reflected_at:new Date().toISOString(),payload:{...request,status:"reflected"}})});if(!response.ok)throw new Error(`受付反映状態の保存失敗: ${response.status}`)}

export async function loadAutumnEntryRows():Promise<EntryRow[]>{const select="entry_id,competition_id,competition_no,start_order,status,rider_id,rider_name,horse_id,horse_name,organization_name";const response=await fetch(`${SUPABASE_URL}/rest/v1/reception_entries?event_id=eq.${AUTUMN_EVENT_ID}&select=${select}&order=competition_no.asc,start_order.asc`,{headers,cache:"no-store"});if(!response.ok)throw new Error(`出番表データ取得失敗: ${response.status}`);return response.json() as Promise<EntryRow[]>}

export function reconcileAutumnEntries(rows:EntryRow[],entries:StartEntry[],competitions:Competition[],players:Player[],horses:Horse[]):EntryMatch[]{return rows.map(row=>{const competition=competitions.find(c=>c.number===Number(row.competition_no));if(!competition)return{row,local:null,reason:"not_found"};const candidates=entries.filter(e=>e.competitionId===competition.id&&e.order===row.start_order&&norm(players.find(p=>p.id===e.playerId)?.name)===norm(row.rider_name)&&norm(horses.find(h=>h.id===e.horseId)?.name)===norm(row.horse_name));if(candidates.length===1)return{row,local:candidates[0],reason:"matched"};if(candidates.length>1)return{row,local:null,reason:"ambiguous"};return{row,local:null,reason:"not_found"}})}
