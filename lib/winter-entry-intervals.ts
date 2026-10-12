import {assertWinterEvent} from './winter-event'
import {verifyAdminSession,type AdminSession} from './supabase-rest'
import type {WinterEntryRow} from './winter-data'
export type WinterRosterIdentity={entity_id:string;rider_id:string|null;horse_id:string|null}
export type EntryInterval={rider:{before:number|null;after:number|null};horse:{before:number|null;after:number|null}}
export function winterEntryIntervals(eventId:string,ids:string[],entries:WinterEntryRow[],identities:WinterRosterIdentity[]=[]){
 assertWinterEvent(eventId)
 const byId=new Map(entries.map(e=>[e.entry_id,e])),riders=new Map<string,string>(),horses=new Map<string,string>()
 for(const m of identities){if(m.rider_id)riders.set(m.rider_id,m.entity_id);if(m.horse_id)horses.set(m.horse_id,m.entity_id)}
 if(new Set(ids).size!==ids.length)throw new Error('出番番号の重複を確認してください')
 const rows=ids.map(id=>{const e=byId.get(id);if(!e)throw new Error('出番の人馬を確認してください');assertWinterEvent(e.event_id);if(['wd','withdrawn'].includes(e.status.toLowerCase()))throw new Error('棄権済みの出番は間隔の対象外です');return e})
 const result=new Map<string,EntryInterval>(ids.map(id=>[id,{rider:{before:null,after:null},horse:{before:null,after:null}}]))
 for(const kind of ['rider','horse'] as const){const last=new Map<string,number>();rows.forEach((e,index)=>{const id=kind==='rider'?e.rider_id:e.horse_id,key=(kind==='rider'?riders:horses).get(id)??`event:${id}`,previous=last.get(key);if(previous!==undefined){const gap=index-previous-1;result.get(e.entry_id)![kind].before=gap;result.get(rows[previous].entry_id)![kind].after=gap}last.set(key,index)})}
 return result
}
export async function loadWinterRosterIdentities(session:AdminSession,signal:AbortSignal){
 const verified=await verifyAdminSession(session),rows:WinterRosterIdentity[]=[]
 for(let offset=0;;offset+=500){const q=new URLSearchParams({select:'entity_id,rider_id,horse_id',order:'entity_id.asc,club_id.asc',limit:'500',offset:String(offset)}),response=await fetch(`https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/fhs_winter_reception_roster?${q}`,{headers:{apikey:'sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95',Authorization:`Bearer ${verified.accessToken}`},cache:'no-store',signal:AbortSignal.any([signal,AbortSignal.timeout(15000)])});if(!response.ok)throw new Error('所属違いの人馬の照合を読み込めません');const page:unknown=await response.json();if(!Array.isArray(page)||page.some(x=>!x.entity_id||(!x.rider_id&&!x.horse_id)||(x.rider_id&&x.horse_id)))throw new Error('共通名簿の照合形式を確認できません');rows.push(...page);if(page.length<500)return{session:verified,identities:rows}}
}
