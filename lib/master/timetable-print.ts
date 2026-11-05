import type { MasterTimetableItem } from './timetable'

export type TimetablePrintItem = MasterTimetableItem & { number: string; name: string; section: string }
export type TimetablePrintData = {
  title: string; dates: readonly { value: string; label: string }[]
  sections: readonly { id: string; label: string; venue: string }[]
  items: TimetablePrintItem[]
}
const esc = (value: string | number) => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]!)

/** Saved event data only. No embedded scripts, credentials or writes. */
export function timetablePrintHtml(data: TimetablePrintData, generatedAt: string, selectedDates: readonly string[] = data.dates.map(d => d.value)) {
  if (!selectedDates.length || selectedDates.some(value => !data.dates.some(d => d.value === value))) throw new Error('印刷する日付を確認してください。')
  const dates = data.dates.filter(d => selectedDates.includes(d.value))
  if (data.items.some(item => !data.sections.some(section => section.id === item.section) || !data.dates.some(d => d.value === item.date))) throw new Error('競技の日付・区分を確認できません。')
  const columns = data.sections.map(section => `<section><h3>${esc(section.label)} <span class="venue">${esc(section.venue)}</span></h3><table><colgroup><col style="width:7%"><col style="width:39%"><col style="width:9%"><col style="width:19%"><col style="width:26%"></colgroup><thead><tr><th>番号</th><th>競技種目</th><th>出場数</th><th>下見開始</th><th>競技開始</th></tr></thead>${dates.map(d => {
    const rows = data.items.filter(item => item.date === d.value && item.section === section.id)
    return `<tbody data-timetable-date="${esc(d.value)}"><tr class="date"><th colspan="5" scope="rowgroup">${esc(d.label)}</th></tr>${rows.length ? rows.map(item => `<tr data-competition-id="${esc(item.id)}"><td class="center">${esc(item.number)}</td><td>${esc(item.name)}${item.official ? '<span class="official"> ★公認</span>' : ''}</td><td class="center">${item.count}</td><td>${esc(item.inspection || '未定')}</td><td>${esc(item.start || '未定')}${item.phase === 'final' ? '<small>（確定）</small>' : ''}</td></tr>`).join('') : '<tr><td colspan="5" class="empty">この日の競技登録はありません。</td></tr>'}</tbody>`
  }).join('')}</table></section>`).join('')
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(data.title)} タイムテーブル</title><style>
*{box-sizing:border-box}body{margin:0;background:#e5e7eb;color:#111;font-family:Arial,"Yu Gothic",Meiryo,sans-serif}.toolbar{display:flex;flex-wrap:wrap;gap:12px;padding:12px;align-items:center}.toolbar button{padding:12px 20px;font-size:16px}.timetable-sheet{background:#fff;width:281mm;height:190mm;margin:12px auto}.timetable-content{width:281mm;display:flow-root;margin:0 auto}header{text-align:center;border-bottom:2px solid #222;padding-bottom:1mm}h1{font-size:15pt;margin:0 0 1mm}h2{font-size:11pt;margin:0}p{font-size:8pt;margin:1mm 0}h3{font-size:11pt;margin:2mm 0 1mm;text-align:center}.venue{font-size:9pt;font-weight:normal}.columns{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:5mm}.columns>section{min-width:0}table{width:100%;border-collapse:collapse;table-layout:fixed;font-size:9pt}th,td{border:1px solid #555;padding:.45mm 1mm;vertical-align:middle;overflow-wrap:anywhere;line-height:1.2}th{background:#edf1f5;font-size:8pt}.date th{text-align:left;font-size:9pt;background:#dbe6f2;padding:.7mm 1mm}small{font-size:7.5pt;white-space:nowrap}.official{font-size:7.5pt;white-space:nowrap}.center{text-align:center}.empty{padding:1.5mm;text-align:center}footer{margin-top:2mm;border-top:1px solid #777;padding-top:1mm}thead{display:table-header-group}tr{break-inside:avoid}
@page{size:A4 landscape;margin:8mm}@media print{body{background:white}.toolbar{display:none}.timetable-sheet{margin:0;break-inside:avoid}}
</style></head><body><nav class="toolbar"><button id="stable-print" type="button">印刷・PDF保存</button><button id="stable-close" type="button">閉じる</button><span>選択した${dates.length}日分をA4横1ページにまとめます。印刷先で「PDFに保存」も選べます。</span></nav><main class="timetable-sheet" data-timetable-sheet><div class="timetable-content" data-timetable-content><header><h1>${esc(data.title)}</h1><h2>タイムテーブル　${dates.map(d => esc(d.label)).join(' ／ ')}</h2><p>${esc(generatedAt)} 作成 ／ 保存済みの時間・出場数</p></header><div class="columns">${columns}</div><footer><p>時間は「確定」の表示がないものは予定です。未設定は「未定」と表示します。</p><p>★公認：日本馬術連盟の公認種目。出場数は棄権を除き、OPを含む出番の件数です。</p><p>競技の進行により開始時間を変更する場合があります。最新のタイムテーブルをご確認ください。</p></footer></div></main></body></html>`
}

/** Fit the layout itself so print pagination uses the scaled size, without clipping. */
export function fitTimetablePrint(doc: Document) {
  const sheet = doc.querySelector<HTMLElement>('[data-timetable-sheet]')
  const content = doc.querySelector<HTMLElement>('[data-timetable-content]')
  if (!sheet || !content) throw new Error('印刷用タイムテーブルを確認できません。')
  // Reset before every measurement; a previous print must not compound the scale.
  sheet.style.height = '190mm'
  content.style.zoom = '1'
  const width = Math.max(content.scrollWidth, content.offsetWidth)
  const height = Math.max(content.scrollHeight, content.offsetHeight)
  const availableWidth = sheet.clientWidth - 2
  const availableHeight = sheet.clientHeight - 2
  if (!width || !height || availableWidth <= 0 || availableHeight <= 0) throw new Error('印刷サイズを確認できません。もう一度開いてください。')
  let scale = Math.min(1, availableWidth / width, availableHeight / height)
  // Zoom changes layout and may round font metrics. Recheck the rendered result.
  for (let attempt = 0; attempt < 8; attempt++) {
    content.style.zoom = String(scale)
    const bounds = content.getBoundingClientRect()
    if (bounds.width <= availableWidth && bounds.height <= availableHeight) {
      sheet.style.height = `${Math.ceil(bounds.height) + 1}px`
      sheet.dataset.printScale = String(scale)
      return
    }
    scale *= Math.min(availableWidth / bounds.width, availableHeight / bounds.height) * .995
  }
  throw new Error('1ページに収まる印刷サイズを確認できません。もう一度開いてください。')
}
