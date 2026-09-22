import { AUTUMN_EVENT } from "./autumn-config"
import { mapAutumnRows, type AutumnDbRow, type AutumnStoreSeed } from "./autumn-db-loader"
import { hasSupabaseConfig, supabaseRest } from "./supabase"

type CompetitionRow={id:string;competition_no:string|number;competition_date:string;name:string;official:boolean;fee:number}
type EntryRow={id:string;competition_id:string;rider_id:string;horse_id:string;organization_id:string;start_order:number|null;status:string|null;source:string|null}
type NamedOrgRow={id:string;name:string;organization_id?:string}

export async function loadAutumnData(): Promise<AutumnStoreSeed | null> {
  if (!hasSupabaseConfig) return null
  const event=`event_id=eq.${AUTUMN_EVENT.id}`
  const [competitions,entries,riders,horses,organizations]=await Promise.all([
    supabaseRest<CompetitionRow>("competitions",`${event}&select=id,competition_no,competition_date,name,official,fee&order=competition_no.asc`),
    supabaseRest<EntryRow>("entries",`${event}&select=id,competition_id,rider_id,horse_id,organization_id,start_order,status,source&order=start_order.asc`),
    supabaseRest<NamedOrgRow>("riders",`${event}&select=id,name,organization_id`),
    supabaseRest<NamedOrgRow>("horses",`${event}&select=id,name,organization_id`),
    supabaseRest<NamedOrgRow>("organizations",`${event}&select=id,name`),
  ])
  const riderMap=new Map(riders.map(r=>[r.id,r])), horseMap=new Map(horses.map(h=>[h.id,h])), orgMap=new Map(organizations.map(o=>[o.id,o]))
  const byCompetition=new Map<string,EntryRow[]>()
  for(const entry of entries){const list=byCompetition.get(entry.competition_id)??[];list.push(entry);byCompetition.set(entry.competition_id,list)}
  const rows:AutumnDbRow[]=[]
  for(const c of competitions){const list=byCompetition.get(c.id)??[]
    if(!list.length){rows.push({competition_id:c.id,competition_no:c.competition_no,competition_date:c.competition_date,competition_name:c.name,official:c.official,fee:c.fee,entry_id:null,start_order:null,status:null,source:null,rider_id:null,rider_name:null,horse_id:null,horse_name:null,organization_id:null,organization_name:null});continue}
    for(const e of list){rows.push({competition_id:c.id,competition_no:c.competition_no,competition_date:c.competition_date,competition_name:c.name,official:c.official,fee:c.fee,entry_id:e.id,start_order:e.start_order,status:e.status,source:e.source,rider_id:e.rider_id,rider_name:riderMap.get(e.rider_id)?.name??null,horse_id:e.horse_id,horse_name:horseMap.get(e.horse_id)?.name??null,organization_id:e.organization_id,organization_name:orgMap.get(e.organization_id)?.name??null})}
  }
  return mapAutumnRows(rows)
}
