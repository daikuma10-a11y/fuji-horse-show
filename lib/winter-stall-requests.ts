import { WINTER_EVENT_ID, assertWinterEvent } from './winter-event'
import { winterRpc } from './winter-reception'
import { emptyStallRequest, mergeStallImport, readStallRequest, type StallRequest } from './master/stall-request'
import type { ApplicationDraft } from './winter-application-draft'
export type SavedStallRequest={event_id:string;organization_id:string;request_id:string;value:StallRequest;confirmed_at:string}
export type StallRequestExpectation={expected:string|null;value:StallRequest}
export type StallRequestSave=StallRequestExpectation&{eventId:string;organizationId:string;organizationName:string;requestId:string}
const hash=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{64}$/.test(v)
const uuid=(v:unknown):v is string=>typeof v==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
export function readStallExpectation(v:unknown):StallRequestExpectation{
 const o=v as StallRequestExpectation
 if(!o||o.expected!==null&&!hash(o.expected))throw new Error('厩舎割要望の保存開始記録を確認してください。')
 return {expected:o.expected,value:readStallRequest(o.value)}
}
export async function stallRequestId(organizationId:string,expectation:StallRequestExpectation){
 const bytes=new TextEncoder().encode(JSON.stringify(['winter-stall-request-v1',WINTER_EVENT_ID,organizationId,readStallExpectation(expectation)]))
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('')
}
export async function loadWinterStallRequests(token:string):Promise<SavedStallRequest[]>{
 if(!token)throw new Error('本部ログインが必要です。')
 const rows:SavedStallRequest[]=[],seen=new Set<string>()
 for(let offset=0;;offset+=500){
  const q=new URLSearchParams({event_id:`eq.${WINTER_EVENT_ID}`,select:'event_id,organization_id,request_id,value,confirmed_at',order:'organization_id.asc',limit:'500',offset:String(offset)})
  const r=await fetch('https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/fhs_current_stall_requests?'+q,{cache:'no-store',signal:AbortSignal.timeout(15000),headers:{apikey:'sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95',Authorization:`Bearer ${token}`}})
  if(!r.ok)throw new Error('厩舎割要望を取得できません。保存先の準備と本部ログインを確認してください。')
  const page:unknown=await r.json();if(!Array.isArray(page))throw new Error('厩舎割要望の保存形式が異なります。')
  for(const row of page){assertWinterEvent(row.event_id);if(!uuid(row.organization_id)||seen.has(row.organization_id)||!hash(row.request_id)||!Number.isFinite(Date.parse(row.confirmed_at)))throw new Error('厩舎割要望の保存形式が異なります。');seen.add(row.organization_id);rows.push({...row,value:readStallRequest(row.value)})}
  if(page.length<500)return rows
 }
}
export async function saveWinterStallRequest(input:StallRequestSave,token:string){
 assertWinterEvent(input.eventId);readStallExpectation(input)
 if(!token||!uuid(input.organizationId)||!hash(input.requestId)||!input.organizationName.trim()||input.organizationName.length>200||await stallRequestId(input.organizationId,input)!==input.requestId)throw new Error('厩舎割要望の保存先を確認してください。')
 const result=await winterRpc('save_winter_stall_request',{p_input:input},token,AbortSignal.timeout(20000))
 if(result!==input.requestId)throw new Error('厩舎割要望の保存応答を確認できません。')
 return input.requestId
}
export function reviewStallImport(draft:ApplicationDraft,rows:SavedStallRequest[]|undefined,organizations:{id:string;name:string;event_id:string}[],expectation?:StallRequestExpectation){
 const text=draft.edited.stallRequest??'',needed=!!text.trim()
 if(!needed)return {needed:false,complete:true,issues:[] as string[],expectation:undefined,organizationId:''}
 const orgs=organizations.filter(o=>o.name===draft.edited.club.trim()),org=orgs.length===1?orgs[0]:undefined,current=rows?.find(r=>r.organization_id===org?.id)
 const issues:string[]=[]
 if(!rows)issues.push('保存済みの厩舎割要望を読み込んでから再確認してください。')
 if(orgs.length>1)issues.push('厩舎割要望の団体を一意に確認できません。')
 let merged=emptyStallRequest()
 try{merged=mergeStallImport(current?.value??merged,{digest:draft.original.digest,text,source:draft.original.fileName+' '+(draft.original.stallRequestOrigins??[]).map(o=>o.sheet+'!'+o.cell).join('、')})}catch(e){issues.push(e instanceof Error?e.message:'要望を確認してください。')}
 const expected=expectation??{expected:current?.request_id??null,value:merged}
 const complete=!!current&&JSON.stringify(current.value)===JSON.stringify(expected.value)
 if(expectation&&!complete&&(current?.request_id??null)!==expected.expected)issues.push('厩舎割要望が別の操作で更新されています。最新の要望を確認してください。')
 if(expectation&&!complete&&(current?.request_id??null)===expected.expected&&JSON.stringify(expected.value)!==JSON.stringify(merged))issues.push('申込書と厩舎割要望の保存開始記録が異なります。')
 return {needed:true,complete,issues,expectation:expected,organizationId:org?.id??''}
}
