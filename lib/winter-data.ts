import {isMasterTimetableTime,type ScheduledPhase} from './master/timetable'
import { WINTER_EVENT_ID, WINTER_DATES, assertWinterEvent } from "./winter-event"

import { compareWinterCompetitions, compareWinterOrganizations, winterAffiliatedOrganizations, winterPickerOrder } from "./winter-display-order"

const URL = "https://mhgyhyxagkkwdiepifdp.supabase.co"
const KEY = "sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95"
type ReceptionRosterState = { reading?:string; is_participant?: boolean; roster_source?: string | null }
export function isWinterReceptionParticipant(row: ReceptionRosterState) { return row.roster_source !== "winter-substituted" && (row.roster_source !== "shared_roster" || row.is_participant === true) }
type EventRow = { event_id: string }
export type WinterOrganizationRow = EventRow & { id: string; name: string }
export type WinterRiderRow = EventRow & ReceptionRosterState & { id: string; name: string; organization_id: string; jef_member_no: string | null }
export type WinterHorseRow = EventRow & ReceptionRosterState & { id: string; name: string; organization_id: string; jef_registration_no: string | null }
export type WinterCompetitionRow = EventRow & {
  id: string; notes?:string|null; competition_no: string; competition_date: string; name: string; official: boolean
  fee: number; op_fee: number | null; member_fee: number | null; nonmember_fee: number | null
}
export type WinterEntryRow = EventRow & {
  entry_id: string; meetingWithdrawal?:boolean; receptionWithdrawal?:boolean; source?: string | null; competition_id: string; notes?:string|null; competition_no: string; start_order: number; status: string
  rider_id: string; horse_id: string; organization_id?: string; organization_name: string; is_op: boolean | null
}
export type WinterTimetableRow = EventRow & { competition_id:string; inspection_time:string|null; start_time:string|null; phase:ScheduledPhase; cancelled?:boolean; updated_at:string }

/** 各ページで大会IDを検証。通信失敗時にAutumnの原本へフォールバックしない。 */
async function rows<T extends EventRow>(table: string, select: string, order: string, signal?: AbortSignal, token=KEY, filters:Record<string,string>={}): Promise<T[]> {
  const result: T[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({ event_id: `eq.${WINTER_EVENT_ID}`, select, order, ...filters, limit: String(pageSize), offset: String(offset) })
    const response = await fetch(`${URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${token}` }, cache: "no-store", signal,
    })
    if (!response.ok) throw new Error(`Winterデータの取得に失敗しました (${table}: ${response.status})`)
    const page: unknown = await response.json()
    if (!Array.isArray(page)) throw new Error("Winterデータの形式が正しくありません")
    for (const row of page) {
      if (!row || typeof row !== "object" || !("event_id" in row) || typeof row.event_id !== "string") throw new Error("大会IDのないデータは使用できません")
      assertWinterEvent(row.event_id)
    }
    result.push(...page as T[])
    if (page.length < pageSize) return result
  }
}

export async function loadWinterData(signal?: AbortSignal, meetingToken?:string) {
  const [organizations, allRiders, allHorses, competitions, allEntries, affiliations, confirmed, receptionWithdrawals] = await Promise.all([
    rows<WinterOrganizationRow>("organizations", "event_id,id,name", "id.asc", signal),
    rows<WinterRiderRow>("riders", "event_id,id,name,organization_id,jef_member_no,is_participant,roster_source", "id.asc", signal),
    rows<WinterHorseRow>("horses", "event_id,id,name,organization_id,jef_registration_no,is_participant,roster_source", "id.asc", signal),
    rows<WinterCompetitionRow>("competitions", "event_id,id,competition_no,competition_date,name,official,fee,op_fee,member_fee,nonmember_fee,notes", "id.asc", signal),
    rows<WinterEntryRow>("reception_entries", "event_id,entry_id,source,competition_id,competition_no,start_order,status,rider_id,horse_id,organization_id,organization_name,is_op", "entry_id.asc", signal),
    rows<EventRow & {organization_id:string; official_name:string}>("fhs_winter_event_affiliations", "event_id,organization_id,official_name", "organization_id.asc", signal),
    meetingToken ? rows<EventRow & {reception_requests:{original_entry_id:string;from_competition_id:string;entry_id:string;request_type:string}}>(
      'fhs_winter_meeting_requests','event_id,reception_requests!inner(original_entry_id,from_competition_id,entry_id,request_type)','request_id.asc',signal,meetingToken,
      {'reception_requests.event_id':`eq.${WINTER_EVENT_ID}`,'reception_requests.status':'eq.reflected','reception_requests.request_type':'in.(withdraw,change)'},
    ) : [],
    meetingToken ? rows<EventRow & {original_entry_id:string;from_competition_id:string}>(
      'reception_requests','event_id,original_entry_id,from_competition_id','id.asc',signal,meetingToken,
      {request_type:'eq.withdraw',status:'eq.reflected'},
    ) : [],
  ])
  const receptionSources=new Set(receptionWithdrawals.map(q=>q.from_competition_id+'/'+q.original_entry_id))
  const withdrawnSources=new Set(confirmed.filter(({reception_requests:q})=>q.request_type==='withdraw'||q.original_entry_id!==q.entry_id).map(({reception_requests:q})=>q.from_competition_id+'/'+q.original_entry_id))
  const affiliationNames: Record<string, string> = {}
  for (const affiliation of affiliations) {
    if (!organizations.some(org => org.id === affiliation.organization_id) || !affiliation.official_name?.trim() || Object.hasOwn(affiliationNames, affiliation.organization_id)) {
      throw new Error("Winterの大会所属と登録団体IDを確認してください")
    }
    affiliationNames[affiliation.organization_id] = affiliation.official_name
  }
  const entries = allEntries.filter(row => row.source !== "winter-initial-cancelled").map(row => {
    const name = row.organization_id && affiliationNames[row.organization_id]
    const meetingWithdrawal=/^(wd|withdrawn)$/i.test(row.status) && withdrawnSources.has(row.competition_id+'/'+row.entry_id)
    const receptionWithdrawal=/^(wd|withdrawn)$/i.test(row.status) && receptionSources.has(row.competition_id+'/'+row.entry_id)
    return {...row,...(receptionWithdrawal ? {receptionWithdrawal:true} : {}),...(name ? {organization_name:name} : {}),...(meetingWithdrawal ? {meetingWithdrawal:true} : {})}
  })
  organizations.sort(compareWinterOrganizations)
  for (const row of competitions) row.name=row.name.normalize("NFKC").replace(/\s+/g," ").trim()
  competitions.sort(compareWinterCompetitions)
  const pickerOrder=winterPickerOrder(winterAffiliatedOrganizations({organizations, affiliationNames}))
  const riders=allRiders.filter(isWinterReceptionParticipant).sort(pickerOrder)
  const horses=allHorses.filter(isWinterReceptionParticipant).sort(pickerOrder)
  const orgIds = new Set(organizations.map(row => row.id))
  const riderIds = new Set(riders.map(row => row.id))
  const horseIds = new Set(horses.map(row => row.id))
  const historicalHorses = allHorses.filter(row => !isWinterReceptionParticipant(row))
  const retiredIds = new Set(historicalHorses.map(row => row.id))
  const competitionIds = new Set(competitions.map(row => row.id))
  if (riders.some(row => !orgIds.has(row.organization_id)) || horses.some(row => !orgIds.has(row.organization_id))) {
    throw new Error("Winter人馬の所属を確認できません")
  }
  if (competitions.some(row => !WINTER_DATES.some(date => date === row.competition_date))) throw new Error("Winter競技の日付を確認してください")
  if (entries.some(row => (row.organization_id!==undefined&&!orgIds.has(row.organization_id)) || !competitionIds.has(row.competition_id) || !riderIds.has(row.rider_id) || (!horseIds.has(row.horse_id) && !(retiredIds.has(row.horse_id) && /^(wd|withdrawn)$/i.test(row.status))))) {
    throw new Error("Winter出番表に所属大会を確認できない人馬があります")
  }
  const timetable=competitions.flatMap(row=>{
    let metadata:unknown
    try{metadata=JSON.parse(row.notes??'null')}catch{return []}
    if(!metadata||typeof metadata!=='object'||!('winterTimetable' in metadata))return []
    const t=metadata.winterTimetable as WinterTimetableRow
    if(!t||t.event_id!==WINTER_EVENT_ID||t.competition_id!==row.id||(t.cancelled!==undefined&&typeof t.cancelled!=='boolean')||!['provisional','final'].includes(t.phase)||!isMasterTimetableTime(t.inspection_time,'inspection')||!isMasterTimetableTime(t.start_time,'start'))throw new Error('Winterの時間設定を確認できません')
    return [t]
  })
  return { eventId: WINTER_EVENT_ID, organizations, riders, horses, competitions, entries, timetable, ...(affiliations.length ? {affiliationNames} : {}), ...(historicalHorses.length ? {historicalHorses} : {}) }
}
