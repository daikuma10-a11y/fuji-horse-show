import type { InputBook, InputSheet } from './master/xlsx-input'
import type { Origin } from './master/application'
import { emptyStableSchedule, type StableSchedule } from './master/stable-schedule'

const clean = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').replace(/頃$/, '')
const pad = (n: number | string) => String(n).padStart(2, '0')
function dateText(year: number, month: string, day: string) { return `${year}-${pad(month)}-${pad(day)}` }
function timeText(raw: string): string {
  const s = clean(raw)
  if (!s || /^時(?:頃)?[（(]/.test(s)) return '' // Old form's instructions are not a selected time.
  if (/^\d*\.\d+$/.test(s) && Number(s) < 1) {
    const minutes = Math.round(Number(s) * 1440)
    return minutes < 1440 ? `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}` : raw.trim()
  }
  const m = s.match(/^(\d{1,2})(?:(?:[:時])(\d{1,2})(?:分)?)?(?:時)?$/)
  return m ? `${pad(m[1])}:${pad(m[2] ?? 0)}` : raw.trim()
}
/** Supports legacy Japanese text, ISO/Japanese dates, Excel date serials, and separate hour dropdowns. Unknown text remains editable. */
export function parseStableDate(raw: string, separateTime: string, date1904 = false): { date: string; time: string } {
  let s = clean(raw), tail = '', date = ''
  if (!s || /^(?:令和年)?月日$/.test(s)) return { date: '', time: timeText(separateTime) }
  const era = s.match(/^令和(元|\d+)年/)
  if (era) s = s.replace(era[0], `${2018 + (era[1] === '元' ? 1 : Number(era[1]))}年`)
  const full = s.match(/^(\d{4})(?:年|[-/])(\d{1,2})(?:月|[-/])(\d{1,2})(?:日)?(?:[(（][日月火水木金土](?:曜(?:日)?)?[)）])?(.*)$/)
  const short = s.match(/^(\d{1,2})(?:月|\/)(\d{1,2})(?:日)?(?:[(（][日月火水木金土](?:曜(?:日)?)?[)）])?(.*)$/)
  if (full) { date = dateText(Number(full[1]), full[2], full[3]); tail = full[4].replace(/^T/, '') }
  else if (short) { date = dateText(2026, short[1], short[2]); tail = short[3] }
  else if (/^\d{4,6}(?:\.\d+)?$/.test(s)) {
    const serial = Number(s), whole = Math.floor(serial)
    if (whole > 60 && whole < 100000) {
      const epoch = Date.UTC(date1904 ? 1904 : 1899, date1904 ? 0 : 11, date1904 ? 1 : 30)
      date = new Date(epoch + whole * 86400000).toISOString().slice(0, 10)
      if (serial !== whole) tail = String(serial - whole)
    }
  }
  return { date: date || raw.trim(), time: timeText(separateTime && !/^時(?:頃)?[（(]/.test(clean(separateTime)) ? separateTime : tail) }
}
export type StableOrigins = { arrival: Origin[]; departure: Origin[]; notes: Origin[] }
export function extractWinterStableSchedule(summary: InputSheet, book: InputBook): { stable: StableSchedule; stableOrigins: StableOrigins } {
  const stable = emptyStableSchedule(), stableOrigins: StableOrigins = { arrival: [], departure: [], notes: [] }
  const origin = (cell: string): Origin => ({ sheet: summary.name, cell, value: summary.cells[cell]?.value ?? '', ...(summary.cells[cell]?.formula ? { formula: summary.cells[cell].formula } : {}) })
  for (const [kind, label] of [['arrival', '入厩予定日'], ['departure', '退厩予定日']] as const) {
    const labels = Object.entries(summary.cells).filter(([cell, value]) => /^B\d+$/.test(cell) && clean(value.value) === label)
    if (labels.length > 1) { stable[`${kind}Date`] = '同じ予定日の欄が複数あります。原本を確認してください'; continue }
    if (!labels.length) continue
    const row = labels[0][0].slice(1), sources = ['C','D','E','F'].map(col=>origin(`${col}${row}`))
    stableOrigins[kind] = sources
    const year=clean(sources[0].value).replace(/年$/,''),month=clean(sources[1].value).replace(/月$/,''),day=clean(sources[2].value).replace(/日$/,'')
    // Earlier forms have separate year/month/day cells, with 2026 prefilled.
    const splitYear=/^(?:19|20)\d{2}$/.test(year)
    const rawDate=splitYear?(month||day?`${year}-${pad(month)}-${pad(day)}`:''):sources[0].value
    const parsed = parseStableDate(rawDate, sources[3].value, book.date1904)
    stable[`${kind}Date`] = parsed.date; stable[`${kind}Time`] = parsed.time
  }
  // Exception requests remain notes; they are never silently treated as approved dates.
  for (const [cell, value] of Object.entries(summary.cells)) if (/^B\d+$/.test(cell) && ['希望入厩日時', '希望退厩日時'].includes(clean(value.value))) {
    const row = Number(cell.slice(1)), sources = [origin(`C${row}`), origin(`C${row + 1}`)]
    stableOrigins.notes.push(...sources)
    if (sources.some(s => s.value.trim())) stable.notes += `${stable.notes ? '\n' : ''}${clean(value.value)}：${sources[0].value.trim() || '未記載'}${sources[1].value.trim() ? ` ／ 理由：${sources[1].value.trim()}` : ''}（要確認）`
  }
  return { stable, stableOrigins }
}
