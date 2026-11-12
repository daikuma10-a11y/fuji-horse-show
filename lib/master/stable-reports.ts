import {stableDateLabel,type StableSchedule} from './stable-schedule'
import type { StableGroup } from './stable-information'
import type { UnsettledFollowup } from './unsettled-followup'

export type BookletRow = { id: string; name: string; count: number; received: string; arrival: string; departure: string; returned: string; notes: string }
export type UnsettledRow = { id: string; name: string; status: '未精算' | '未入金' | '過入金' | '入金不足'; amount: number | null; notes: string; review: boolean }
// Use the same high-contrast status colors on screen and on the printed list.
export const unsettledColors = {
  '入金不足': {backgroundColor:'#ffedd5', color:'#9a3412'},
  '未入金': {backgroundColor:'#ffe4e6', color:'#9f1239'},
  '過入金': {backgroundColor:'#dbeafe', color:'#1e40af'},
  '未精算': {backgroundColor:'#f1f5f9', color:'#334155'},
} as const
export const bookletHeaders = ['No.', '団体名', '手帳受取日', '頭数', '入厩日時', '退厩日時', '手帳返却日', '備考']
export const unsettledHeaders = ['✓', '乗馬クラブ名', '入金状況', '差額', '備考']
export const bookletExplanation = '団体名・頭数は参加登録、入退厩日時は保存済みの申込内容から自動反映します。日時の空欄は未登録です。手帳受取日・返却日は印刷後に記入してください。'
export const unsettledExplanation = '入金不足・未入金・過入金の団体を表示します。差額を確定できない団体は「未精算」と表示します。'
export const unsettledEmptyMessage = '未精算・過入金・入金不足の団体はありません。'
export const yen = (value: number) => `${value.toLocaleString('ja-JP')}円`
function compareKnownFirst(a = '', b = '') {
  if (!a) return b ? 1 : 0
  if (!b) return -1
  return a.localeCompare(b)
}
export function bookletRows(groups: StableGroup[], schedules: {id:string;value:StableSchedule}[] = []): BookletRow[] {
  const byGroup = new Map(schedules.map(({id, value}) => [id, value]))
  return groups.map(group => ({group, schedule: byGroup.get(group.id)}))
    .sort((a, b) => compareKnownFirst(a.schedule?.arrivalDate, b.schedule?.arrivalDate)
      || compareKnownFirst(a.schedule?.arrivalTime, b.schedule?.arrivalTime))
    .map(({group, schedule}) => ({
      id: group.id, name: group.name, count: group.horses.length, received: '', returned: '',
      arrival: schedule ? stableDateLabel(schedule.arrivalDate, schedule.arrivalTime) : '',
      departure: schedule ? stableDateLabel(schedule.departureDate, schedule.departureTime) : '',
      notes: schedule?.notes ?? '',
    }))
}
function escape(value: string | number) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!) }
const style = `
*{box-sizing:border-box}body{margin:0;background:#eee;color:#111;font-family:Arial,"Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif}
.report{width:210mm;padding:10mm;margin:auto;background:white}h1{font-size:20pt;margin:0 0 4mm}p{font-size:9pt;margin:2mm 0;line-height:1.5}
.report-toolbar{padding:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#eef3f8}.report-toolbar button{min-height:48px;padding:8px 20px;background:white;border:1px solid #777;border-radius:8px;font-size:18px}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10pt;margin-top:4mm}th,td{border:.2mm solid #555;padding:2mm;vertical-align:middle;overflow-wrap:anywhere;line-height:1.5}th{background:#eee;font-size:9pt}td{height:10mm}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.number{text-align:center}.money{text-align:right;white-space:nowrap}.review{font-weight:bold}.total{font-weight:bold}.report-box{display:inline-block;width:4mm;height:4mm;border:.2mm solid #444}.small{font-size:8pt}
.booklet th,.booklet td{padding:1.5mm 1mm}.booklet th{font-size:8.5pt}.booklet-name,.booklet-name span{white-space:nowrap}.booklet-name span{display:inline-block}
.payment-status{display:inline-block;white-space:nowrap;padding:.3mm 1mm;border:1px solid currentColor;border-radius:1mm;font-weight:bold;-webkit-print-color-adjust:exact;print-color-adjust:exact}.followup-note{margin:1mm 0;min-height:7mm;border-bottom:.2mm dotted #555;white-space:pre-wrap}
@page{size:A4 portrait;margin:10mm}@media print{body{background:white}.report{width:100%;padding:0;margin:0}.report-toolbar{display:none}h1{break-after:avoid}table{margin-top:3mm}}
`
function document(title: string, eventName: string, generatedAt: string, body: string) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${style}</style></head><body><nav class="report-toolbar"><button id="stable-print" type="button">印刷する</button><button id="stable-close" type="button">閉じる</button><span>A4・縦向き・片面で印刷してください。</span></nav><main class="report"><h1>${escape(title)}</h1><p>${escape(eventName)} ／ ${escape(generatedAt)} 時点</p>${body}</main></body></html>`
}
function head(labels: string[], widths: number[]) { return `<colgroup>${widths.map(width => `<col style="width:${width}%">`).join('')}</colgroup><thead><tr>${labels.map(label => `<th scope="col">${escape(label)}</th>`).join('')}</tr></thead>` }
export function bookletPrintHtml(rows: BookletRow[], eventName: string, generatedAt: string) {
  const body = `<table class="booklet">${head(bookletHeaders, [5,27,9,5,12,12,9,21])}<tbody>${rows.map((row, i) => `<tr><td class="number">${i+1}</td><td><div class="booklet-name" data-fit-size="10"><span>${escape(row.name)}</span></div></td><td>${escape(row.received)}</td><td class="number">${row.count}</td><td>${escape(row.arrival)}</td><td>${escape(row.departure)}</td><td>${escape(row.returned)}</td><td>${escape(row.notes)}</td></tr>`).join('')}</tbody></table><p class="total">${rows.length}団体 ／ 合計 ${rows.reduce((sum, row) => sum + row.count, 0)}頭</p><p>※色付きボールペンで手帳受取日・返却日の記入をお願いします。</p>`
  return document('手帳チェック', eventName, generatedAt, body)
}
export function unsettledPrintHtml(rows: UnsettledRow[], eventName: string, generatedAt: string, followups: ReadonlyMap<string, UnsettledFollowup> = new Map()) {
  const body = rows.length ? `<table>${head(unsettledHeaders, [4,23,14,16,43])}<tbody>${rows.map(row => {
    const {backgroundColor, color} = unsettledColors[row.status]
    const note = followups.get(row.id)
    return `<tr><td class="number"><span class="report-box"></span></td><td>${escape(row.name)}</td><td><span class="payment-status" style="background-color:${backgroundColor};color:${color}">${row.status}</span></td><td class="money">${row.amount === null ? '—' : yen(row.amount)}${row.review ? '<br><span class="small review">要確認</span>' : ''}</td><td><div class="small">${escape(row.notes)}</div><div class="followup-note">理由・備考　${escape(note?.reason ?? '')}</div><div>${note?.contact ? '連絡状況：'+escape(note.contact) : '□ 未連絡　□ 連絡済み'}</div></td></tr>`
  }).join('')}</tbody></table><p>${rows.length}団体（要確認 ${rows.filter(row => row.review).length}団体）</p>` : `<p>${unsettledEmptyMessage}</p>`
  return document('未精算リスト', eventName, generatedAt, body)
}
