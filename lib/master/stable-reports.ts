import type { StableGroup } from './stable-information'

export type BookletRow = { id: string; name: string; count: number; received: string; arrival: string; departure: string; returned: string; notes: string }
export type UnsettledRow = { id: string; name: string; amount: number | null; notes: string; review: boolean }
export const bookletHeaders = ['No.', '団体名', '手帳受取日', '頭数', '入厩日時', '退厩日時', '手帳返却日', '備考']
export const unsettledHeaders = ['✓', '乗馬クラブ名', '金額', '備考']
export const bookletExplanation = '団体名・頭数は参加登録から自動反映します。手帳受取日・返却日、入退厩日時、備考は印刷後に記入してください。'
export const unsettledExplanation = '精算画面と同じ請求・入金記録から作成します。残額がある団体と、入金・料金・返金の確認が必要な団体を表示します。後日振込の選択だけでは入金済みになりません。'
export const yen = (value: number) => `${value.toLocaleString('ja-JP')}円`
export function bookletRows(groups: StableGroup[]): BookletRow[] {
  return groups.map(group => ({ id: group.id, name: group.name, count: group.horses.length, received: '', arrival: '', departure: '', returned: '', notes: '' }))
}
function escape(value: string | number) { return String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!) }
const style = `
*{box-sizing:border-box}body{margin:0;background:#eee;color:#111;font-family:Arial,"Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif}
.report{width:210mm;padding:10mm;margin:auto;background:white}h1{font-size:20pt;margin:0 0 4mm}p{font-size:9pt;margin:2mm 0;line-height:1.5}
.report-toolbar{padding:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#eef3f8}.report-toolbar button{min-height:48px;padding:8px 20px;background:white;border:1px solid #777;border-radius:8px;font-size:18px}
table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:10pt;margin-top:4mm}th,td{border:.2mm solid #555;padding:2mm;vertical-align:middle;overflow-wrap:anywhere;line-height:1.5}th{background:#eee;font-size:9pt}td{height:10mm}thead{display:table-header-group}tr{break-inside:avoid;page-break-inside:avoid}.number{text-align:center}.money{text-align:right;white-space:nowrap}.review{font-weight:bold}.total{font-weight:bold}.report-box{display:inline-block;width:4mm;height:4mm;border:.2mm solid #444}.small{font-size:8pt}
@page{size:A4 portrait;margin:10mm}@media print{body{background:white}.report{width:100%;padding:0;margin:0}.report-toolbar{display:none}h1{break-after:avoid}table{margin-top:3mm}}
`
function document(title: string, eventName: string, generatedAt: string, body: string) {
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)}</title><style>${style}</style></head><body><nav class="report-toolbar"><button id="stable-print" type="button">印刷する</button><button id="stable-close" type="button">閉じる</button><span>A4・縦向き・片面で印刷してください。</span></nav><main class="report"><h1>${escape(title)}</h1><p>${escape(eventName)} ／ ${escape(generatedAt)} 時点</p>${body}</main></body></html>`
}
function head(labels: string[], widths: number[]) { return `<colgroup>${widths.map(width => `<col style="width:${width}%">`).join('')}</colgroup><thead><tr>${labels.map(label => `<th scope="col">${escape(label)}</th>`).join('')}</tr></thead>` }
export function bookletPrintHtml(rows: BookletRow[], eventName: string, generatedAt: string) {
  const body = `<p>${escape(bookletExplanation)}</p><table>${head(bookletHeaders, [6,25,11,6,13,13,11,15])}<tbody>${rows.map((row, i) => `<tr><td class="number">${i+1}</td><td>${escape(row.name)}</td><td>${escape(row.received)}</td><td class="number">${row.count}</td><td>${escape(row.arrival)}</td><td>${escape(row.departure)}</td><td>${escape(row.returned)}</td><td>${escape(row.notes)}</td></tr>`).join('')}</tbody></table><p class="total">${rows.length}団体 ／ 合計 ${rows.reduce((sum, row) => sum + row.count, 0)}頭</p><p>※色付きボールペンで手帳受取日・返却日の記入をお願いします。</p>`
  return document('手帳チェック', eventName, generatedAt, body)
}
export function unsettledPrintHtml(rows: UnsettledRow[], eventName: string, generatedAt: string) {
  const body = `<p>${escape(unsettledExplanation)}</p>${rows.length ? `<table>${head(unsettledHeaders, [6,32,19,43])}<tbody>${rows.map(row => `<tr><td class="number"><span class="report-box"></span></td><td>${escape(row.name)}</td><td class="money">${row.amount === null ? '要確認' : yen(row.amount)}${row.review ? '<br><span class="small review">要確認</span>' : ''}</td><td>${escape(row.notes)}</td></tr>`).join('')}</tbody></table><p>${rows.length}団体（要確認 ${rows.filter(row => row.review).length}団体）</p>` : '<p>未精算・要確認の団体はありません。</p>'}`
  return document('未精算リスト', eventName, generatedAt, body)
}
