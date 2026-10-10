import { WINTER_EVENT_ID, WINTER_DATES, assertWinterEvent } from "./winter-event"

const URL = "https://mhgyhyxagkkwdiepifdp.supabase.co"
const KEY = "sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95"
type EventRow = { event_id: string }
export type WinterOrganizationRow = EventRow & { id: string; name: string }
export type WinterRiderRow = EventRow & { id: string; name: string; organization_id: string; jef_member_no: string | null }
export type WinterHorseRow = EventRow & { id: string; name: string; organization_id: string; jef_registration_no: string | null }
export type WinterCompetitionRow = EventRow & {
  id: string; notes?:string|null; competition_no: string; competition_date: string; name: string; official: boolean
  fee: number; op_fee: number | null; member_fee: number | null; nonmember_fee: number | null
}
export type WinterEntryRow = EventRow & {
  entry_id: string; competition_id: string; notes?:string|null; competition_no: string; start_order: number; status: string
  rider_id: string; horse_id: string; organization_name: string; is_op: boolean | null
}
export type WinterTimetableRow = EventRow & { competition_id:string; inspection_time:string|null; start_time:string|null; phase:'provisional'|'final'; updated_at:string }

/** 各ページで大会IDを検証。通信失敗時にAutumnの原本へフォールバックしない。 */
async function rows<T extends EventRow>(table: string, select: string, order: string, signal?: AbortSignal): Promise<T[]> {
  const result: T[] = []
  const pageSize = 500
  for (let offset = 0; ; offset += pageSize) {
    const query = new URLSearchParams({ event_id: `eq.${WINTER_EVENT_ID}`, select, order, limit: String(pageSize), offset: String(offset) })
    const response = await fetch(`${URL}/rest/v1/${table}?${query}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` }, cache: "no-store", signal,
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

export async function loadWinterData(signal?: AbortSignal) {
  const [organizations, riders, horses, competitions, entries] = await Promise.all([
    rows<WinterOrganizationRow>("organizations", "event_id,id,name", "id.asc", signal),
    rows<WinterRiderRow>("riders", "event_id,id,name,organization_id,jef_member_no", "id.asc", signal),
    rows<WinterHorseRow>("horses", "event_id,id,name,organization_id,jef_registration_no", "id.asc", signal),
    rows<WinterCompetitionRow>("competitions", "event_id,id,competition_no,competition_date,name,official,fee,op_fee,member_fee,nonmember_fee,notes", "id.asc", signal),
    rows<WinterEntryRow>("reception_entries", "event_id,entry_id,competition_id,competition_no,start_order,status,rider_id,horse_id,organization_name,is_op", "entry_id.asc", signal),
  ])
  const orgIds = new Set(organizations.map(row => row.id))
  const riderIds = new Set(riders.map(row => row.id))
  const horseIds = new Set(horses.map(row => row.id))
  const competitionIds = new Set(competitions.map(row => row.id))
  if (riders.some(row => !orgIds.has(row.organization_id)) || horses.some(row => !orgIds.has(row.organization_id))) {
    throw new Error("Winter人馬の所属を確認できません")
  }
  if (competitions.some(row => !WINTER_DATES.some(date => date === row.competition_date))) throw new Error("Winter競技の日付を確認してください")
  if (entries.some(row => !competitionIds.has(row.competition_id) || !riderIds.has(row.rider_id) || !horseIds.has(row.horse_id))) {
    throw new Error("Winter出番表に所属大会を確認できない人馬があります")
  }
  const timetable=competitions.flatMap(row=>{
    let metadata:unknown
    try{metadata=JSON.parse(row.notes??'null')}catch{return []}
    if(!metadata||typeof metadata!=='object'||!('winterTimetable' in metadata))return []
    const t=metadata.winterTimetable as WinterTimetableRow
    if(!t||t.event_id!==WINTER_EVENT_ID||t.competition_id!==row.id||!['provisional','final'].includes(t.phase)||[t.inspection_time,t.start_time].some(value=>value!==null&&(typeof value!=='string'||!/^([01][0-9]|2[0-3]):[0-5][0-9]$/.test(value))))throw new Error('Winterの時間設定を確認できません')
    return [t]
  })
  return { eventId: WINTER_EVENT_ID, organizations, riders, horses, competitions, entries, timetable }
}
