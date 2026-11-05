import type { loadWinterData } from './winter-data'
import { WINTER_DATES, WINTER_EVENT_NAME, assertWinterEvent, winterTimetableSection, winterTimetableSections } from './winter-event'
import { compareWinterCompetitions, winterCompetitionLabel } from './winter-display-order'
import type { TimetablePrintData } from './master/timetable-print'

export function winterTimetablePrintData(data: Awaited<ReturnType<typeof loadWinterData>>): TimetablePrintData {
  assertWinterEvent(data.eventId)
  return {
    title: WINTER_EVENT_NAME,
    dates: WINTER_DATES.map(value => ({ value, label: new Intl.DateTimeFormat('ja-JP', {timeZone:'Asia/Tokyo',year:'numeric',month:'numeric',day:'numeric',weekday:'short'}).format(new Date(value+'T00:00:00+09:00')) })),
    sections: winterTimetableSections,
    items: [...data.competitions].sort(compareWinterCompetitions).map(c => {
      assertWinterEvent(c.event_id)
      const section = winterTimetableSection(c.competition_no)
      if (!section) throw new Error(`第${c.competition_no}競技の会場設定を確認してください。`)
      const t = data.timetable.find(item => item.competition_id === c.id)
      if (t) assertWinterEvent(t.event_id)
      const entries = data.entries.filter(e => e.competition_id === c.id)
      for (const e of entries) assertWinterEvent(e.event_id)
      return {id:c.id,date:c.competition_date,competition:winterCompetitionLabel(c),number:c.competition_no,name:c.name,section:section.id,official:c.official,count:entries.filter(e => !['wd','withdrawn'].includes(e.status.toLowerCase())).length,inspection:t?.inspection_time??null,start:t?.start_time??null,phase:t?.phase}
    }),
  }
}
