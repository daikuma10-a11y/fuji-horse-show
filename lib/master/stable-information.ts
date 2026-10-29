export type StableHorse = { id: string; name: string }
export type StableGroup = { id: string; name: string; horses: StableHorse[] }
export type StableCard = { groupId: string; club: string; total: number; part: number; parts: number; horses: StableHorse[] }

/** A card holds 16 horses, with eight down each side. Never truncate a club. */
export function stableChecklistPages(groups: StableGroup[]): StableCard[][] {
  const cards: StableCard[] = []
  for (const group of groups) {
    const parts = Math.ceil(group.horses.length / 16)
    for (let part = 0; part < parts; part++) cards.push({
      groupId: group.id, club: group.name, total: group.horses.length,
      part: part + 1, parts, horses: group.horses.slice(part * 16, (part + 1) * 16),
    })
  }
  return Array.from({ length: Math.ceil(cards.length / 2) }, (_, i) => cards.slice(i * 2, i * 2 + 2))
}

function escape(value: string) {
  return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)
}

export const stableChecklistCss = `
*{box-sizing:border-box}html,body{margin:0;padding:0;background:white;color:#111;font-family:Arial,"Hiragino Kaku Gothic ProN","Yu Gothic",Meiryo,sans-serif}
.stable-toolbar{padding:12px;display:flex;gap:12px;align-items:center;flex-wrap:wrap;background:#eef3f8;font-size:16px}
.stable-toolbar button{min-height:48px;padding:8px 20px;border:1px solid #777;border-radius:8px;background:white;font-size:18px;cursor:pointer}
.stable-sheet{width:297mm;height:209mm;display:grid;grid-template-columns:148.5mm 148.5mm;position:relative;break-after:page;page-break-after:always}
.stable-sheet:last-child{break-after:auto;page-break-after:auto}
.stable-sheet:after{content:"";position:absolute;left:148.5mm;top:6mm;bottom:5mm;border-left:.2mm dashed #555}
.stable-card{position:relative;width:148.5mm;height:209mm;padding:9mm;break-inside:avoid}
.stable-club{position:absolute;left:9mm;right:9mm;top:13mm;text-align:center;line-height:1.3;font-weight:600}
.stable-club span{font-size:20pt}
.stable-count{position:absolute;left:9mm;right:9mm;top:31mm;text-align:center;font-size:30pt;line-height:1.2}
.stable-continuation{position:absolute;left:9mm;right:9mm;top:46mm;text-align:center;font-size:9pt}
.stable-tables{position:absolute;left:9mm;right:9mm;top:54mm;display:grid;grid-template-columns:1fr 1fr}
.stable-table{border-collapse:collapse;table-layout:fixed;width:100%;font-size:11pt}
.stable-table:first-child{border-right:.2mm solid #555}
.stable-table th{height:6mm;padding:0 0 1mm;font-weight:400;border-bottom:.2mm solid #555}
.stable-table td{height:12mm;padding:0;vertical-align:middle;border-bottom:.18mm solid #555}
.stable-table .stable-name{padding:0 2mm 0 1mm}
.stable-table .stable-notes{border-left:.15mm dashed #777}
.stable-box{width:4mm;height:4mm;display:block;margin-left:2mm;border:.2mm solid #444}
.stable-fit{display:block;width:100%;white-space:nowrap;line-height:1.25}
.stable-fit span{display:inline-block;white-space:nowrap}
.stable-name span{font-size:11pt}
.stable-signatures{position:absolute;left:9mm;right:9mm;bottom:17mm;display:grid;grid-template-columns:1fr 1fr;gap:8mm;font-size:11pt}
.stable-signatures div{padding-bottom:16mm;border-bottom:.2mm solid #555}
@page{size:A4 landscape;margin:0}
@media print{.stable-toolbar{display:none}html,body{width:297mm}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
`

export function stableChecklistHtml(groups: StableGroup[], eventName: string): string {
  const pages = stableChecklistPages(groups)
  const card = (value: StableCard) => `<section class="stable-card" aria-label="${escape(value.club)}">
    <div class="stable-club"><div class="stable-fit" data-fit-size="20"><span>${escape(value.club)}</span></div></div>
    <div class="stable-count">${value.total}頭</div>
    ${value.parts > 1 ? `<div class="stable-continuation">${value.part} / ${value.parts} 枚目（この用紙は${value.horses.length}頭）</div>` : ''}
    <div class="stable-tables">${[0, 1].map(column => `<table class="stable-table"><colgroup><col style="width:8mm"><col style="width:35mm"><col></colgroup><thead><tr><th aria-label="確認"></th><th>馬名</th><th class="stable-notes">備考</th></tr></thead><tbody>${Array.from({ length: 8 }, (_, row) => {
      const horse = value.horses[column * 8 + row]
      return `<tr><td><span class="stable-box"></span></td><td class="stable-name"><div class="stable-fit" data-fit-size="11"><span>${horse ? escape(horse.name) : ''}</span></div></td><td class="stable-notes"></td></tr>`
    }).join('')}</tbody></table>`).join('')}</div>
    <div class="stable-signatures"><div>退厩時・引取人署名</div><div>獣医師署名</div></div>
  </section>`
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(eventName)} 入厩情報</title><style>${stableChecklistCss}</style></head><body><nav class="stable-toolbar" aria-label="印刷操作"><button id="stable-print" type="button">印刷する</button><button id="stable-close" type="button">閉じる</button><span>A4・横向き・片面で印刷してください。中央の点線で切り分けます。</span></nav><main>${pages.map(page => `<div class="stable-sheet">${page.map(card).join('')}</div>`).join('')}</main></body></html>`
}

/** Measure using the actual loaded Japanese font; preserve the complete name on one line. */
export function fitStableChecklistNames(doc: Document): void {
  doc.querySelectorAll<HTMLElement>('[data-fit-size]').forEach(box => {
    const span = box.querySelector<HTMLElement>('span')
    if (!span) return
    const size = Number(box.dataset.fitSize)
    span.style.fontSize = `${size}pt`
    const available = box.getBoundingClientRect().width
    const natural = span.getBoundingClientRect().width
    if (available > 0 && natural > available) span.style.fontSize = `${size * available / natural * 0.98}pt`
  })
}
