import {WINTER_EVENT_ID,assertWinterEvent} from './winter-event'
import {winterRpc} from './winter-reception'
import type {ApplicationPerson} from './master/application'
import type {ApplicationDraft} from './winter-application-draft'
import {validHorseDeclaration} from './master/application-credentials'

export type WinterCredential={event_id:string;entity_id:string;club_id:string;target_id:string;kind:'rider'|'horse';value:string;request_id:string;source_reference:string;confirmed_at:string}
export type CredentialExpectation={requestId:string;expected:string|null}
export type CredentialSave={eventId:string;entityId:string;clubId:string;targetId:string;kind:'rider'|'horse';name:string;jef:string;value:string;requestId:string;expected:string|null;digest:string;reference:string;location:string}
export const credentialValue=(p:ApplicationPerson)=>(p.kind==='rider'?p.grade:p.horseGrade??'').normalize('NFKC').trim()
export const credentialLabel=(kind:string)=>kind==='rider'?'所有資格級':'グレード宣言'
export const credentialDisplay=(kind:string,value:string)=>kind==='rider'&&/^[ABC]$/.test(value)?value+'級':value
export const credentialHash=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{64}$/.test(s)
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
export function validCredential(kind:string,value:string){return kind==='rider'?['A','B','C','未登録'].includes(value):kind==='horse'&&!!value&&validHorseDeclaration(value)}
export async function credentialRequestId(d:ApplicationDraft,p:ApplicationPerson){
 const source=JSON.stringify(['winter-application-credential-v1',WINTER_EVENT_ID,d.reference,d.original.digest,p.key,p.kind,credentialValue(p)])
 return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(source))),b=>b.toString(16).padStart(2,'0')).join('')
}
export async function loadWinterApplicationCredentials(token:string,signal?:AbortSignal):Promise<WinterCredential[]>{
 if(!token)throw new Error('本部ログインが必要です')
 const result:WinterCredential[]=[],seen=new Set<string>()
 for(let offset=0;;offset+=500){
  const query=new URLSearchParams({event_id:`eq.${WINTER_EVENT_ID}`,select:'event_id,entity_id,club_id,target_id,kind,value,request_id,source_reference,confirmed_at',order:'entity_id.asc,club_id.asc',limit:'500',offset:String(offset)})
  const response=await fetch('https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/fhs_winter_current_credentials?'+query,{method:'GET',cache:'no-store',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)]),headers:{apikey:'sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95',Authorization:`Bearer ${token}`}})
  if(!response.ok)throw new Error('保存済みの資格級・グレード宣言を取得できません。本部ログインと接続を確認してください')
  const page:unknown=await response.json()
  if(!Array.isArray(page))throw new Error('資格級・グレード宣言の保存形式を確認できません')
  for(const row of page){
   const key=JSON.stringify([row?.entity_id,row?.club_id])
   if(!row||!uuid(row.entity_id)||!uuid(row.club_id)||!uuid(row.target_id)||!credentialHash(row.request_id)||typeof row.value!=='string'||!validCredential(row.kind,row.value)||typeof row.source_reference!=='string'||typeof row.confirmed_at!=='string'||seen.has(key))throw new Error('資格級・グレード宣言の保存形式を確認できません')
   assertWinterEvent(row.event_id);seen.add(key);result.push(row)
  }
  if(page.length<500)return result
 }
}
export async function saveWinterApplicationCredential(input:CredentialSave,token:string){
 assertWinterEvent(input.eventId)
 if(![input.entityId,input.clubId,input.targetId].every(uuid)||!credentialHash(input.requestId)||!credentialHash(input.digest)||input.expected!==null&&!credentialHash(input.expected)||!validCredential(input.kind,input.value))throw new Error('資格級・グレード宣言の保存内容を確認してください')
 const result=await winterRpc('save_winter_application_credential',{p_input:input},token,AbortSignal.timeout(20000))
 if(result!==input.requestId)throw new Error('資格級・グレード宣言の保存結果を再確認してください')
 return input.requestId
}
