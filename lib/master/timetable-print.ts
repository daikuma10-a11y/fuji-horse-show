import type { MasterTimetableItem } from './timetable'

export type TimetablePrintItem = MasterTimetableItem & { number: string; name: string; section: string }
export type TimetablePrintData = {
  title: string; dates: readonly { value: string; label: string }[]
  sections: readonly { id: string; label: string; venue: string }[]
  items: TimetablePrintItem[]
}
const esc = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!)

/** Saved event data only. No embedded scripts, credentials or writes. */
export function timetablePrintHtml(data: TimetablePrintData, generatedAt: string, date?: string) {
  const dates = data.dates.filter(d => !date || d.value === date)
  if (!dates.length) throw new Error('印刷する日付を確認してください。')
  if (data.items.some(item => !data.sections.some(section => section.id === item.section) || !data.dates.some(d => d.value === item.date))) throw new Error('競技の日付・区分を確認できません。')
  const pages = dates.map(d => `<section class="day"><header><h1>${esc(data.title)}</h1><h2>タイムテーブル　${esc(d.label)}</h2><p>${esc(generatedAt)} 作成 ／ 保存済みの時間・出場数</p></header><div class="columns">${data.sections.map(section => {
    const rows = data.items.filter(item => item.date === d.value && item.section === section.id)
    return `<section><h3>${esc(section.label)}</h3><p class="venue">${esc(section.venue)}</p><table><colgroup><col style="width:7%"><col style="width:39%"><col style="width:9%"><col style="width:19%"><col style="width:26%"></colgroup><thead><tr><th>番号</th><th>競技種目</th><th>出場数</th><th>下見開始</th><th>競技開始</th></tr></thead><tbody>${rows.length ? rows.map(item => `<tr data-competition-id="${esc(item.id)}"><td class="center">${esc(item.number)}</td><td>${esc(item.name)}${item.official ? '<span class="official"> ★公認</span>' : ''}</td><td class="center">${item.count}</td><td>${esc(item.inspection || '未定')}</td><td>${esc(item.start || '未定')}<small>${item.phase === 'final' ? '確定' : '予定'}</small></td></tr>`).join('') : '<tr><td colspan="5" class="empty">この日の競技登録はありません。</td></tr>'}</tbody></table></section>`
  }).join('')}</div><footer><p>★公認：日本馬術連盟の公認種目。出場数は棄権を除き、OPを含む出番の件数です。</p><p>競技の進行により開始時間を変更する場合があります。最新のタイムテーブルをご確認ください。</p></footer></section>`).join('')
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(data.title)} タイムテーブル</title><style>
*{box-sizing:border-box}body{margin:0;background:#e5e7eb;color:#111;font-family:Arial,"Yu Gothic",Meiryo,sans-serif}.toolbar{display:flex;flex-wrap:wrap;gap:12px;padding:12px;align-items:center}.toolbar button{padding:12px 20px;font-size:16px}.day{background:#fff;width:281mm;margin:12px auto;padding:6mm}header{text-align:center;border-bottom:2px solid #222;padding-bottom:2mm}h1{font-size:16pt;margin:0 0 1mm}h2{font-size:12pt;margin:0}p{font-size:8pt;margin:1mm 0}h3{font-size:12pt;margin:2mm 0 0;text-align:center}.venue{text-align:center}.columns{display:grid;grid-template-columns:1fr 1fr;gap:5mm}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt}th,td{border:1px solid #555;padding:.8mm 1mm;vertical-align:middle;overflow-wrap:anywhere;line-height:1.25}th{background:#edf1f5;font-size:9pt}small{display:block;font-size:8pt;color:#444}.official{font-size:8pt;white-space:nowrap}.center{text-align:center}.empty{padding:6mm;text-align:center}footer{margin-top:2mm;border-top:1px solid #777;padding-top:1mm}thead{display:table-header-group}tr{break-inside:avoid}header,h3{break-after:avoid}
@page{size:A4 landscape;margin:8mm}@media print{body{background:white}.toolbar{display:none}.day{width:auto;padding:0;margin:0;break-after:page}.day:last-child{break-after:auto}}
</style></head><body><nav class="toolbar"><button id="stable-print" type="button">印刷・PDF保存</button><button id="stable-close" type="button">閉じる</button><span>A4横・日付ごとに改ページ。印刷先で「PDFに保存」も選べます。</span></nav>${pages}</body></html>`
}
