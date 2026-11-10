import {WINTER_EVENT_ID,WINTER_DATES} from './winter-event'
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from './supabase-rest'

export const openingDate=WINTER_DATES[0]
const valid=(s:unknown):s is string=>typeof s==='string'&&/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(s)
const endpoint=SUPABASE_URL+'/rest/v1/fhs_winter_arena_openings'
function filter(){
  return new URLSearchParams({event_id:'eq.'+WINTER_EVENT_ID,opening_date:'eq.'+openingDate,section_id:'eq.dressage',select:'start_time'})
}
function headers(token:string){return {apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token} }
export async function loadArenaOpening(token:string,signal:AbortSignal=AbortSignal.timeout(15000)):Promise<string>{
  const res=await fetch(endpoint+'?'+filter(),{headers:headers(token),cache:'no-store',signal})
  if(!res.ok)throw new Error('馬場開放の時刻を取得できません。本部ログインと通信を確認してください。')
  const rows=await res.json()
  if(!Array.isArray(rows)||rows.length!==1||!valid(rows[0]?.start_time))throw new Error('金曜の馬場開放時刻を確認できません。')
  return rows[0].start_time
}
export async function saveArenaOpening(token:string,before:string,after:string){
  if(!valid(before)||!valid(after))throw new Error('開放する時刻を指定してください。')
  const query=filter();query.set('start_time','eq.'+before)
  const res=await fetch(endpoint+'?'+query,{method:'PATCH',cache:'no-store',signal:AbortSignal.timeout(15000),
    headers:{...headers(token),'Content-Type':'application/json',Prefer:'return=representation'},body:JSON.stringify({start_time:after})})
  if(!res.ok)throw new Error('馬場開放の時刻を保存できません。再読み込みして確認してください。')
  const rows=await res.json()
  if(rows.length===1&&rows[0].start_time===after)return after
  if(await loadArenaOpening(token)===after)return after
  throw new Error('別の端末で時刻が変更されています。最新の時間を読み込んでください。')
}
