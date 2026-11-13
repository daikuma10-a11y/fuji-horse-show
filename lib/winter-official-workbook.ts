import type {loadWinterData} from './winter-data'
import {WINTER_DATES, WINTER_EVENT_NAME, WINTER_STARTS_PER_PAGE, assertWinterEvent, winterRecognitionNumber, winterTimetableSection} from './winter-event'
import {buildLinkedEventWorkbook} from './master/linked-event-workbook'
import {isConfirmedWithdrawal,winterOfficialStarts} from './winter-confirmed-withdrawals'
import {entryValues, isWithdrawn} from './official-excel'

export const WINTER_LAYOUT_URL = '/winter-forms/official-layouts.zip?v=start-headers-2'
export const winterWorkbookName=(date:string)=>'2026Winter_'+date.slice(5).replace('-','')+'_出番表・成績表.xlsx'

// Excel identifiers are text. Older rosters can contain only the significant digits.
function workbookJefNumber(number: string | null) {
  const value = String(number ?? '').normalize('NFKC').trim()
  if (!value || /^(?:[-ー－―—]+|なし|無し|未登録|未確認)$/.test(value)) return '-'
  if (!/^\d+$/.test(value)) return value
  const digits = value.replace(/^0+(?=\d)/, '')
  if (digits.length > 5) throw new Error('日馬連番号が5桁を超えています。登録内容を確認してください：'+value)
  return digits.padStart(5, '0')
}

export function exportWinterWorkbook(layouts: Uint8Array, data: Awaited<ReturnType<typeof loadWinterData>>, date: string, competitionId?: string) {
  assertWinterEvent(data.eventId)
  for (const rows of [data.competitions,data.entries,data.riders,data.horses]) for (const row of rows) assertWinterEvent(row.event_id)
  if (!WINTER_DATES.some(d=>d===date)) throw new Error('Winterの開催日を選択してください')
  const historicalHorses = data.historicalHorses ?? []
  for (const horse of historicalHorses) assertWinterEvent(horse.event_id)
  const riders = new Map(data.riders.map(r => [r.id, r]))
  const horses = new Map(data.horses.map(h => [h.id, h]))
  const pastHorses = new Map(historicalHorses.map(h => [h.id, h]))
  const selected=data.competitions.filter(c=>c.competition_date===date && (competitionId===undefined || c.id===competitionId))
  if (competitionId!==undefined && selected.length!==1) throw new Error('選択した日の競技を確認できません')
  const competitions=selected.map(c=>{
    const section=winterTimetableSection(c.competition_no)
    if (!section) throw new Error('競技番号と会場を確認してください：'+c.competition_no)
    const recorded = data.entries
      .filter(e => e.competition_id === c.id && !isConfirmedWithdrawal(e) && !(isWithdrawn(e.status) && e.start_order == null))
      .sort((a, b) => a.start_order - b.start_order || a.entry_id.localeCompare(b.entry_id))
    const last=recorded.reduce((max,e)=>Math.max(max,e.start_order),0)
    const withdrawn=winterOfficialStarts(data.entries,c.id).filter(isConfirmedWithdrawal)
    const entries=[...recorded,...withdrawn.map((e,i)=>({...e,start_order:last+i+1}))].map(e => {
        const rider = riders.get(e.rider_id)
        const horse = horses.get(e.horse_id) ?? (isWithdrawn(e.status) ? pastHorses.get(e.horse_id) : undefined)
        if (!rider || !horse || !e.organization_name || !Number.isSafeInteger(e.start_order) || e.start_order < 1) {
          throw new Error(`第${c.competition_no}競技の出番番号・人馬・所属を確認してください`)
        }
        return entryValues({...e,rider_name:rider.name,jef_member_no:workbookJefNumber(rider.jef_member_no),horse_name:horse.name,jef_registration_no:workbookJefNumber(horse.jef_registration_no)})
      })
    return {name:c.name, number:c.competition_no, venue:section.startListVenue ?? section.venue, official:c.official, recognitionNumber:winterRecognitionNumber(c.competition_no,c.official), dressage:section.id==='dressage', entries}
  })
  if (!competitions.length || new Set(competitions.map(c=>c.number)).size!==competitions.length) throw new Error('開催日の競技一覧を確認してください')
  return buildLinkedEventWorkbook(layouts,WINTER_EVENT_NAME,date,competitions, {startsPerPage:WINTER_STARTS_PER_PAGE, numberedThrough:WINTER_STARTS_PER_PAGE})
}
