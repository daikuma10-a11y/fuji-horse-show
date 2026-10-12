import type {StartEntry,Player,Horse,Organization} from '../types'
export type MasterRequestMark={event_id:string;entry_id:string|null;request_type:'add'|'change'|'withdraw';status:string;payload:{changedFields?:string[]}}
export type MasterStartSnapshot={eventId:string;organizations:{event_id:string;id:string;name:string}[];riders:{event_id:string;id:string;name:string;organization_id:string}[];horses:{event_id:string;id:string;name:string;organization_id:string}[];entries:{event_id:string;entry_id:string;competition_id:string;rider_id:string;horse_id:string;start_order:number;status:string;organization_name:string;is_op:boolean|null}[]}

export function eventStartListModel(data:MasterStartSnapshot,eventId:string,competitionId:string,requests:MasterRequestMark[]){
 if(data.eventId!==eventId)throw new Error('大会データが設定と一致しません')
 for(const list of [data.organizations,data.riders,data.horses,data.entries])for(const row of list)if(row.event_id!==eventId)throw new Error('別大会の人馬・出番は使用できません')
 const entries=data.entries.filter(e=>e.competition_id===competitionId&&!['wd','withdrawn'].includes(e.status.toLowerCase())).map<StartEntry>(e=>{
  const history=requests.filter(q=>q.event_id===data.eventId&&q.entry_id===e.entry_id&&q.status==='reflected'&&q.request_type!=='withdraw')
  const org=data.organizations.find(o=>o.name===e.organization_name)
  const fields=new Set(history.flatMap(q=>q.payload.changedFields??[]))
  return{id:e.entry_id,competitionId:e.competition_id,order:e.start_order,playerId:e.rider_id,horseId:e.horse_id,organizationId:org?.id,isOp:!!e.is_op,adminChangeMark:history.some(q=>q.request_type==='add')?'added':history.length?'changed':undefined,adminChangeFields:(['competition','player','horse','op'] as const).filter(f=>fields.has(f))}
 }).sort((a,b)=>a.order-b.order)
 const players=new Map<string,Player>(data.riders.map(r=>[r.id,{id:r.id,name:r.name,orgId:r.organization_id}])),horses=new Map<string,Horse>(data.horses.map(h=>[h.id,{id:h.id,name:h.name,orgId:h.organization_id}])),orgs=new Map<string,Organization>(data.organizations.map(o=>[o.id,{id:o.id,name:o.name}]))
 return{entriesByCompetition:(id:string)=>id===competitionId?entries:[],getPlayer:(id:string)=>players.get(id),getHorse:(id:string)=>horses.get(id),getOrg:(id:string)=>orgs.get(id)}
}
