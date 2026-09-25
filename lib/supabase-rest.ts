import type { AppRequest, Competition, FeeBreakdown, Horse, Player, StartEntry } from "./types"
import { competitions as seedCompetitions, horses as seedHorses, players as seedPlayers, startEntries as seedStartEntries } from "./mock-data"

const SUPABASE_URL = "https://mhgyhyxagkkwdiepifdp.supabase.co"
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95"
export const AUTUMN_EVENT_ID = "2af66251-66a2-4c51-8180-a5badf0584d4"
export const ADMIN_SESSION_KEY = "fhs-admin-session-v1"

const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`, "Content-Type": "application/json" }
type RequestRow={id:string;request_type:AppRequest["type"];status:AppRequest["status"];created_at:string;fee:number|null;fee_amount?:number|null;organization_id?:string|null;original_entry_id?:string|null;entry_id?:string|null;target_competition_id?:string|null;from_competition_id?:string|null;to_competition_id?:string|null;rider_id?:string|null;horse_id?:string|null;treated_as_withdraw_add?:boolean|null;note?:string|null;request_note?:string|null;payload:unknown}
type EntryRow={entry_id:string;competition_id:string;competition_no:string;start_order:number;status:string;rider_id:string;rider_name:string;horse_id:string;horse_name:string;organization_name:string}
type CompetitionFeeRow={competition_no:string;fee:number|null}
export type AdminSession={accessToken:string;refreshToken:string;expiresAt:number;email:string}
export type EntryMatch={row:EntryRow;local:StartEntry|null;reason:"matched"|"not_found"|"ambiguous"}

const norm=(value:string|undefined)=>(value??"").normalize("NFKC").replace(/[\s　]+/g,"").toLocaleLowerCase("ja-JP")
const obj=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{}
const str=(value:unknown)=>typeof value==="string"?value:""
const bool=(value:unknown)=>value===true
const num=(value:unknown)=>typeof value==="number"&&Number.isFinite(value)?value:0
const emptyFee=(total:number):FeeBreakdown=>({addBase:0,addEntry:0,changeBase:0,competitionDiff:0,total:Number.isFinite(total)?total:0})
const feeFromPayload=(payload:Record<string,unknown>,fallbackTotal:number):FeeBreakdown=>{const f=obj(payload.fee);const addBase=num(f.addBase),addEntry=num(f.addEntry),changeBase=num(f.changeBase),competitionDiff=num(f.competitionDiff),parts=addBase+addEntry+changeBase+competitionDiff,total=num(f.total)||fallbackTotal;return parts!==0?{addBase,addEntry,changeBase,competitionDiff,total:total||parts}:emptyFee(total)}
const playerName=(id:string)=>seedPlayers.find(p=>p.id===id)?.name??""
const horseName=(id:string)=>seedHorses.find(h=>h.id===id)?.name??""
const competitionNo=(id:string)=>seedCompetitions.find(c=>c.id===id)?.number??null
const entryOrder=(id:string)=>seedStartEntries.find(e=>e.id===id)?.order??null
function enrichedPayload(request:AppRequest){
 if(request.add)return {...request,add:{...request.add,playerName:playerName(request.add.playerId),horseName:horseName(request.add.horseId),competitionNo:competitionNo(request.add.competitionId)}}
 if(request.withdraw)return {...request,withdraw:{...request.withdraw,playerName:playerName(request.withdraw.playerId),horseName:horseName(request.withdraw.horseId),competitionNo:competitionNo(request.withdraw.competitionId),entryOrder:entryOrder(request.withdraw.entryId)}}
 if(request.change)return {...request,change:{...request.change,fromPlayerName:playerName(request.change.fromPlayerId),fromHorseName:horseName(request.change.fromHorseId),toPlayerName:playerName(request.change.toPlayerId),toHorseName:horseName(request.change.toHorseId),fromCompetitionNo:competitionNo(request.change.fromCompetitionId),toCompetitionNo:competitionNo(request.change.toCompetitionId),entryOrder:entryOrder(request.change.entryId)}}
 return request
}
function normalizeRequestRow(row:RequestRow):AppRequest|null{
 const p=obj(row.payload),type=row.request_type,status=row.status
 if(!["add","change","withdraw"].includes(type)||!["pending","reflected"].includes(status))return null
 const total=Number(row.fee_amount??row.fee??0),orgId=str(p.orgId)||row.organization_id||""
 const base={id:row.id,type,status,createdAt:str(p.createdAt)||row.created_at,orgId,fee:feeFromPayload(p,total)} as AppRequest
 if(type==="add"){const q=obj(p.add),competitionId=str(q.competitionId)||str(p.competitionId)||row.target_competition_id||row.to_competition_id||"",playerId=str(q.playerId)||str(p.playerId)||row.rider_id||"",horseId=str(q.horseId)||str(p.horseId)||row.horse_id||"";if(!competitionId||!playerId||!horseId)return null;return {...base,add:{competitionId,playerId,horseId,note:str(q.note)||str(p.note)||row.note||row.request_note||""}}}
 if(type==="withdraw"){const q=obj(p.withdraw),entryId=str(q.entryId)||str(p.entryId)||row.entry_id||row.original_entry_id||"",competitionId=str(q.competitionId)||str(p.competitionId)||row.from_competition_id||"",playerId=str(q.playerId)||str(p.playerId)||row.rider_id||"",horseId=str(q.horseId)||str(p.horseId)||row.horse_id||"";if(!entryId||!competitionId||!playerId||!horseId)return null;return {...base,withdraw:{entryId,competitionId,playerId,horseId}}}
 const q=obj(p.change),entryId=str(q.entryId)||str(p.entryId)||row.entry_id||row.original_entry_id||"",fromCompetitionId=str(q.fromCompetitionId)||str(p.fromCompetitionId)||row.from_competition_id||"",fromPlayerId=str(q.fromPlayerId)||str(p.fromPlayerId)||row.rider_id||"",fromHorseId=str(q.fromHorseId)||str(p.fromHorseId)||row.horse_id||"",toCompetitionId=str(q.toCompetitionId)||str(p.toCompetitionId)||row.to_competition_id||row.target_competition_id||"",toPlayerId=str(q.toPlayerId)||str(p.toPlayerId)||row.rider_id||"",toHorseId=str(q.toHorseId)||str(p.toHorseId)||row.horse_id||""
 if(!entryId||!fromCompetitionId||!fromPlayerId||!fromHorseId||!toCompetitionId||!toPlayerId||!toHorseId)return null
 const rawFields=Array.isArray(q.changedFields)?q.changedFields:Array.isArray(p.changedFields)?p.changedFields:[],changedFields=rawFields.filter((v):v is "competition"|"player"|"horse"=>v==="competition"||v==="player"||v==="horse")
 return {...base,change:{entryId,fromCompetitionId,fromPlayerId,fromHorseId,toCompetitionId,toPlayerId,toHorseId,changedFields,treatedAsWithdrawAdd:bool(q.treatedAsWithdrawAdd)||bool(p.treatedAsWithdrawAdd)||row.treated_as_withdraw_add===true}}
}
export async function signInAdmin(email:string,password:string):Promise<AdminSession>{const response=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:{apikey:SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},body:JSON.stringify({email,password})});const body=await response.json() as {access_token?:string;refresh_token?:string;expires_in?:number;user?:{email?:string;app_metadata?:{role?:string}};msg?:string;error_description?:string};if(!response.ok||!body.access_token||!body.refresh_token)throw new Error(body.error_description||body.msg||"ログインに失敗しました");if(body.user?.app_metadata?.role!=="admin")throw new Error("このアカウントには本部管理者権限がありません");return{accessToken:body.access_token,refreshToken:body.refresh_token,expiresAt:Date.now()+(body.expires_in??3600)*1000,email:body.user.email??email}}
export async function refreshAdminSession(session:AdminSession):Promise<AdminSession>{if(session.expiresAt>Date.now()+60000)return session;const response=await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`,{method:"POST",headers:{apikey:SUPABASE_PUBLISHABLE_KEY,"Content-Type":"application/json"},body:JSON.stringify({refresh_token:session.refreshToken})});const body=await response.json() as {access_token?:string;refresh_token?:string;expires_in?:number;user?:{email?:string;app_metadata?:{role?:string}}};if(!response.ok||!body.access_token||!body.refresh_token||body.user?.app_metadata?.role!=="admin")throw new Error("本部ログインの有効期限が切れました。再ログインしてください");return{accessToken:body.access_token,refreshToken:body.refresh_token,expiresAt:Date.now()+(body.expires_in??3600)*1000,email:body.user.email??session.email}}
export async function loadReceptionRequests():Promise<AppRequest[]>{const select="id,request_type,status,created_at,fee,fee_amount,organization_id,original_entry_id,entry_id,target_competition_id,from_competition_id,to_competition_id,rider_id,horse_id,treated_as_withdraw_add,note,request_note,payload";const response=await fetch(`${SUPABASE_URL}/rest/v1/reception_requests?event_id=eq.${AUTUMN_EVENT_ID}&select=${select}&order=created_at.desc`,{headers,cache:"no-store"});if(!response.ok)throw new Error(`受付データ取得失敗: ${response.status}`);const rows=await response.json() as RequestRow[];return rows.map(normalizeRequestRow).filter((row):row is AppRequest=>row!==null)}
export async function loadCompetitionFees():Promise<Map<number,number>>{const response=await fetch(`${SUPABASE_URL}/rest/v1/competitions?event_id=eq.${AUTUMN_EVENT_ID}&select=competition_no,fee`,{headers,cache:"no-store"});if(!response.ok)throw new Error(`競技料金取得失敗: ${response.status}`);const rows=await response.json() as CompetitionFeeRow[];return new Map(rows.map(row=>[Number(row.competition_no),Number(row.fee??0)]))}
export async function saveReceptionRequest(request:AppRequest):Promise<void>{const payload=enrichedPayload(request);const body={id:request.id,event_id:AUTUMN_EVENT_ID,request_type:request.type,fee_amount:request.fee.total,fee:request.fee.total,status:request.status,source:"fuji-horse-show-web",treated_as_withdraw_add:request.change?.treatedAsWithdrawAdd??false,note:request.add?.note||null,payload};const response=await fetch(`${SUPABASE_URL}/rest/v1/reception_requests`,{method:"POST",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify(body)});if(!response.ok)throw new Error(`受付データ保存失敗: ${response.status}`)}
export async function applyReceptionRequest(requestId:string,targetOrder:number|undefined,accessToken:string):Promise<void>{const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/resolve_and_apply_reception_request`,{method:"POST",headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},body:JSON.stringify({p_request_id:requestId,p_start_order:targetOrder??null})});if(!response.ok){let detail="";try{const body=await response.json() as {message?:string};detail=body.message?`: ${body.message}`:""}catch{}throw new Error(`正式出番表への反映に失敗しました (${response.status})${detail}`)}}
export async function reorderEntries(competitionId:string,entryIds:string[],accessToken:string):Promise<void>{
 let dbCompetitionId=competitionId
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(dbCompetitionId)){
  const no=competitionNo(competitionId)
  if(no==null)throw new Error("出番順の保存に失敗しました: 競技番号を特定できません")
  const lookup=await fetch(`${SUPABASE_URL}/rest/v1/competitions?event_id=eq.${AUTUMN_EVENT_ID}&competition_no=eq.${no}&select=id&limit=2`,{headers,cache:"no-store"})
  if(!lookup.ok)throw new Error(`出番順の保存に失敗しました: 競技ID取得エラー (${lookup.status})`)
  const rows=await lookup.json() as {id:string}[]
  if(rows.length!==1||!rows[0]?.id)throw new Error("出番順の保存に失敗しました: 競技IDを一意に特定できません")
  dbCompetitionId=rows[0].id
 }
 const current=await fetch(`${SUPABASE_URL}/rest/v1/entries?competition_id=eq.${dbCompetitionId}&select=id,status,start_order&order=start_order.asc`,{headers,cache:"no-store"})
 if(!current.ok)throw new Error(`出番順の保存に失敗しました: 最新出番表取得エラー (${current.status})`)
 const rows=await current.json() as {id:string;status:string|null;start_order:number}[]
 const activeRows=rows.filter(row=>!["WD","withdrawn"].includes(row.status??"active"))
 const activeIds=new Set(activeRows.map(row=>row.id))
 const requested=entryIds.filter(id=>activeIds.has(id))
 const requestedSet=new Set(requested)
 const missing=activeRows.map(row=>row.id).filter(id=>!requestedSet.has(id))
 const canonical=[...requested,...missing]
 if(canonical.length!==activeRows.length||new Set(canonical).size!==activeRows.length)throw new Error("出番順の保存に失敗しました: 出番表IDの整合性を確認できません")
 const response=await fetch(`${SUPABASE_URL}/rest/v1/rpc/reorder_entries`,{method:"POST",headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${accessToken}`,"Content-Type":"application/json"},body:JSON.stringify({p_competition_id:dbCompetitionId,p_entry_ids:canonical})});if(!response.ok){let detail="";try{const body=await response.json() as {message?:string};detail=body.message?`: ${body.message}`:""}catch{}throw new Error(`出番順の保存に失敗しました (${response.status})${detail}`)}
}
export async function markReceptionRequestReflected(request:AppRequest):Promise<void>{const response=await fetch(`${SUPABASE_URL}/rest/v1/reception_requests?id=eq.${request.id}&event_id=eq.${AUTUMN_EVENT_ID}`,{method:"PATCH",headers:{...headers,Prefer:"return=minimal"},body:JSON.stringify({status:"reflected",reflected_at:new Date().toISOString(),payload:{...enrichedPayload(request),status:"reflected"}})});if(!response.ok)throw new Error(`受付反映状態の保存失敗: ${response.status}`)}
export async function loadAutumnEntryRows():Promise<EntryRow[]>{const select="entry_id,competition_id,competition_no,start_order,status,rider_id,rider_name,horse_id,horse_name,organization_name";const response=await fetch(`${SUPABASE_URL}/rest/v1/reception_entries?event_id=eq.${AUTUMN_EVENT_ID}&select=${select}&order=competition_no.asc,start_order.asc`,{headers,cache:"no-store"});if(!response.ok)throw new Error(`出番表データ取得失敗: ${response.status}`);return response.json() as Promise<EntryRow[]>}
export function reconcileAutumnEntries(rows:EntryRow[],entries:StartEntry[],competitions:Competition[],players:Player[],horses:Horse[]):EntryMatch[]{return rows.map(row=>{const competition=competitions.find(c=>c.number===Number(row.competition_no));if(!competition)return{row,local:null,reason:"not_found"};const candidates=entries.filter(e=>e.competitionId===competition.id&&e.order===row.start_order&&norm(players.find(p=>p.id===e.playerId)?.name)===norm(row.rider_name)&&norm(horses.find(h=>h.id===e.horseId)?.name)===norm(row.horse_name));if(candidates.length===1)return{row,local:candidates[0],reason:"matched"};if(candidates.length>1)return{row,local:null,reason:"ambiguous"};const loose=entries.filter(e=>e.competitionId===competition.id&&norm(players.find(p=>p.id===e.playerId)?.name)===norm(row.rider_name)&&norm(horses.find(h=>h.id===e.horseId)?.name)===norm(row.horse_name));return loose.length===1?{row,local:loose[0],reason:"matched"}:{row,local:null,reason:loose.length>1?"ambiguous":"not_found"}})}