import { assertWinterEvent, WINTER_EVENT_ID } from './winter-event'
import { winterRpc } from './winter-reception'
import { readStallPlan, type SavedStallPlan, type StallPlan } from './master/stall-allocation'
const URL='https://mhgyhyxagkkwdiepifdp.supabase.co'
const KEY='sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95'
export async function loadWinterStallPlan(token:string):Promise<SavedStallPlan|null>{
  if(!token)throw new Error('本部ログインが必要です。')
  const q=new URLSearchParams({event_id:`eq.${WINTER_EVENT_ID}`,select:'event_id,request_id,value,confirmed_at',order:'revision.desc',limit:'1'})
  const response=await fetch(`${URL}/rest/v1/fhs_stable_allocation_versions?${q}`,{cache:'no-store',signal:AbortSignal.timeout(15000),headers:{apikey:KEY,Authorization:`Bearer ${token}`}})
  if(!response.ok)throw new Error('保存済みの厩舎割を取得できません。本部ログイン・接続を確認してください。')
  const rows:unknown=await response.json()
  if(!Array.isArray(rows)||rows.length>1)throw new Error('厩舎割の保存結果を確認できません。')
  if(!rows.length)return null
  const row=rows[0];assertWinterEvent(row.event_id)
  if(typeof row.request_id!=='string'||!/^[0-9a-f]{64}$/.test(row.request_id)||typeof row.confirmed_at!=='string'||!Number.isFinite(Date.parse(row.confirmed_at)))throw new Error('厩舎割の保存形式が異なります。')
  return {requestId:row.request_id,savedAt:row.confirmed_at,plan:readStallPlan(row.value)}
}
export async function saveWinterStallPlan(plan:StallPlan,expected:string|null,token:string):Promise<SavedStallPlan>{
  const value=readStallPlan(plan)
  if(!token||expected!==null&&!/^[0-9a-f]{64}$/.test(expected))throw new Error('本部ログイン・保存番号を確認してください。')
  const input={eventId:WINTER_EVENT_ID,expected,value}
  const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify(input)))
  const requestId=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('')
  let failure:unknown
  try{const result=await winterRpc('save_winter_stall_allocation',{p_input:{...input,requestId}},token,AbortSignal.timeout(20000));if(result!==requestId)throw new Error('保存応答を確認できません。')}catch(e){failure=e}
  const saved=await loadWinterStallPlan(token)
  if(saved?.requestId!==requestId)throw new Error((failure instanceof Error?failure.message:'厩舎割の保存結果を確認できません。')+' 最新の内容を読み直して確認してください。')
  return saved
}
