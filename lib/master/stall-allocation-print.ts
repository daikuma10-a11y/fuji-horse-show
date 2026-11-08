import { barnIds, stalls, stallLocation, horseTotal, groupAllocation, zoneComponents, type StallPlan } from './stall-allocation'
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const palette=['#dcecff','#ffe3d3','#e0f1d9','#efe0ff','#fff2bf','#d7f2ed','#f9dfe9','#e4e6f8','#f0e5d4','#d8ecdc','#f6dfc9','#e2f0fa']
const lines=(text:string,max:number)=>Array.from(text).reduce<string[]>((a,c)=>{if(!a.length||Array.from(a[a.length-1]).length>=max)a.push(c);else a[a.length-1]+=c;return a},[])
// Letters identify the same club on the plot and in the key, including on monochrome copies.
function clubMark(index: number): string {
  let mark = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    mark = String.fromCharCode(65 + (n - 1) % 26) + mark
  }
  return mark
}

export function stallPlanLegendHtml(plan: StallPlan): string {
  const items = plan.groups.map((group, index) => {
    const allocation = groupAllocation(plan, group)
    const barns = barnIds.flatMap(barn => {
      const rooms = stalls.filter(s => s.barn === barn && plan.cells[s.id]?.groupId === group.id)
      if (!rooms.length) return []
      return [barn + '厩舎 ' + rooms.filter(s => plan.cells[s.id].kind === 'horse').length + '頭']
    })
    if (!barns.length && !allocation.tent) return ''
    return `<li><b style="background:${palette[index % palette.length]}">${clubMark(index)}</b><span><strong>${esc(group.name)}</strong><small>${barns.join(' ／ ')}${allocation.tent ? '　テント' + allocation.tent + '枠' : ''}</small></span></li>`
  }).join('')
  return `<section class="stall-legend" aria-label="団体記号一覧"><h5>団体記号一覧</h5><ul>${items}</ul></section>`
}

/** Original master topology: S at left; 1..10; two stall columns; facilities below. */
export function stallPlanSvg(p:StallPlan,eventName:string):string{
  const colors=new Map(p.groups.map((g,i)=>[g.id,palette[i%palette.length]])), names=new Map(p.groups.map(g=>[g.id,g.name])), marks=new Map(p.groups.map((g,i)=>[g.id,clubMark(i)])), horseNames=new Map(p.groups.flatMap(g=>g.horses.map(h=>[h.id,h.name] as const)))
  const text=(x:number,y:number,t:string,size=14)=>`<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}">${esc(t)}</text>`
  const label=(x:number,y:number,t:string,width:number,size=14)=>lines(t,Math.max(3,Math.floor(width/size))).map((s,i)=>text(x,y+i*(size+2),s,size)).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1680 980" role="img" aria-label="厩舎割 全体図" style="width:100%;height:auto;font-family:Arial,'Yu Gothic',Meiryo,sans-serif;background:white;color:#111"><rect width="1680" height="980" fill="white"/>${text(840,28,'競 技 場 側',22)}${barnIds.map((barn,i)=>{
    const x=15+i*151, y=105,w=64,h=47
    const local=stalls.filter(s=>s.barn===barn), used=local.filter(s=>p.cells[s.id]?.kind==='horse').length
    const cells=local.map(s=>{
      const c=p.cells[s.id],owner=c?.groupId??'',color=owner?colors.get(owner):c?.kind==='blocked'?'#ddd':'white'
      const cx=x+s.side*(w+8),cy=y+s.row*h
      const description=`${barn}厩舎 ${s.number} ${c?.kind==='horse'?horseNames.get(c.horseId)??'':c?.kind==='tr'?'TR':c?.kind==='blocked'?'使用不可':'空き'} ${names.get(owner)??''}`
      const mark = marks.get(owner)
      const badge = mark ? `<text x="${cx+w-4}" y="${cy+h-2}" text-anchor="end" font-size="11" font-weight="bold">${mark}</text>` : ''
      const use = c?.kind === 'tr' ? `<text x="${cx+w/2}" y="${cy+28}" text-anchor="middle" font-size="19" font-weight="bold">TR</text>` : c?.kind === 'blocked' ? text(cx+w/2,cy+29,'×',22) : ''
      return `<g data-slot="${esc(s.id)}"${c?.kind==='horse'||c?.kind==='tr'?' data-movable="true"':''} tabindex="0" role="button" aria-label="${esc(description)}"><title>${esc(description)}</title><rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${color}" stroke="#555" stroke-width="1"/>${text(cx+9,cy+12,String(s.number),11)}${use}${badge}</g>`
    }).join('')
    let blocks=''
    // Keep the zone boundary, including the aisle between facing bays.
    if(p.options.layout)for(const group of p.groups)for(const zone of zoneComponents(p,group.id,barn)){
      const owned=new Set(zone.map(s=>`${s.side}:${s.row}`))
      let edges=''
      for(const s of zone){const left=x+s.side*(w+8),right=left+w,top=y+s.row*h,bottom=top+h,opposite=owned.has(`${1-s.side}:${s.row}`)
        if(!owned.has(`${s.side}:${s.row-1}`))edges+=`M${left},${top}H${right}`
        if(!owned.has(`${s.side}:${s.row+1}`))edges+=`M${left},${bottom}H${right}`
        if(s.side===0||!opposite)edges+=`M${left},${top}V${bottom}`
        if(s.side===1||!opposite)edges+=`M${right},${top}V${bottom}`
        if(s.side===0&&opposite){if(!(owned.has(`0:${s.row-1}`)&&owned.has(`1:${s.row-1}`)))edges+=`M${right},${top}h8`;if(!(owned.has(`0:${s.row+1}`)&&owned.has(`1:${s.row+1}`)))edges+=`M${right},${bottom}h8`}
      }
      blocks+=`<path d="${edges}" fill="none" stroke="#222" stroke-width="3" pointer-events="none"/>`
    }
    const tent=horseTotal(p.groups)>150&&barn!=='S'?`<rect x="${x}" y="${y+10*h+20}" width="${w*2+8}" height="64" fill="#eef4fb" stroke="#555"/>${text(x+w+4,y+10*h+39,'仮設テント（TR2枠）',13)}${label(x+w+4,y+10*h+56,[p.tents[`${barn}:tent1`],p.tents[`${barn}:tent2`]].filter(Boolean).map(id=>names.get(id)??'').join('／')||'空き',w*2,10)}`:''
    return text(x+w+4,66,`${barn}厩舎`,25)+text(x+w+4,91,`${used}頭`,16)+cells+blocks+tent
  }).join('')}<circle cx="260" cy="790" r="54" fill="none" stroke="#333"/>${text(260,797,'丸馬場',17)}<rect x="445" y="735" width="150" height="50" fill="none" stroke="#333"/>${text(520,765,'装蹄所',17)}<rect x="805" y="760" width="170" height="60" fill="none" stroke="#333"/>${text(890,795,'休憩室',17)}<rect x="1000" y="760" width="125" height="60" fill="none" stroke="#333"/>${text(1062,795,'HM室',17)}<rect x="1430" y="735" width="200" height="70" fill="none" stroke="#333"/>${text(1530,778,'オガコ倉庫',17)}${text(840,883,eventName+' 厩舎割表',26)}${text(840,915,`合計 ${horseTotal(p.groups)}頭 ／ 配置 ${Object.values(p.cells).filter(c=>c.kind==='horse').length}頭　TR＝タックルーム`,19)}${p.corridors.length?text(840,945,'S通路利用：'+p.corridors.map(id=>names.get(id)).join('、'),15):''}</svg>`
}
export function stallPlanPrintHtml(p:StallPlan,eventName:string){
  const summary=p.groups.map((g,index)=>{
    const a=groupAllocation(p,g)
    const slots=(kind:'horse'|'tr')=>barnIds.map(b=>{
      const owned=stalls.filter(s=>s.barn===b&&p.cells[s.id]?.kind===kind&&p.cells[s.id].groupId===g.id)
      return owned.length?`${b}厩舎：${owned.map(s=>s.number).join('・')}`:''
    }).filter(Boolean).map(esc).join('<br>')||'—'
    const tent=Object.entries(p.tents).filter(([,id])=>id===g.id).map(([id])=>`${id.split(':')[0]}厩舎 枠${id.endsWith('1')?'1':'2'}`).map(esc).join('<br>')||'—'
    return `<tr><td><b>${clubMark(index)}</b>　${esc(g.name)}</td><td>${a.horses}／${g.horses.length}頭</td><td>${slots('horse')}</td><td>${a.indoor}室<br>${slots('tr')}</td><td>${tent}</td><td>${a.corridor?'S通路':'—'}</td></tr>`
  }).join('')
  // Larger lists can use the lettered club table on the following pages without shrinking the map.
  const inlineLegend = p.groups.length <= 12 && p.groups.every(g => Array.from(g.name).length <= 32)
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(eventName)} 厩舎割</title><style>*{box-sizing:border-box}body{font-family:Arial,'Yu Gothic',Meiryo,sans-serif;margin:0;color:#111}nav{padding:12px;background:#eef3f8}button{padding:12px;margin:4px;font-size:18px}.map{width:100%;break-after:page}.map svg{display:block;max-height:${inlineLegend ? (p.groups.length <= 8 ? 162 : 147) : 178}mm}.stall-legend{margin-top:2mm}.stall-legend h5{font-size:10pt;margin:0 0 1mm}.stall-legend ul{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:1mm 3mm;list-style:none;padding:0;margin:0}.stall-legend li{display:flex;align-items:flex-start;gap:1.5mm;font-size:9pt;line-height:1.15}.stall-legend li b{border:1px solid #444;text-align:center;min-width:5mm}.stall-legend strong,.stall-legend small{display:block;overflow-wrap:anywhere}.stall-legend small{font-size:8pt}.legend-reference{font-size:10pt}.details{padding:5mm}table{border-collapse:collapse;width:100%;font-size:10pt}td,th{border:1px solid #888;padding:5px}h1{font-size:18pt}tr{break-inside:avoid}thead{display:table-header-group}@page{size:A4 landscape;margin:6mm}@media print{nav{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><nav><button id="stable-print">印刷する</button><button id="stable-close">閉じる</button>A4横向き。1ページ目は配置図、続きは団体別一覧です。</nav><div class="map">${stallPlanSvg(p,eventName)}${inlineLegend?stallPlanLegendHtml(p):'<p class="legend-reference">団体記号と団体名は、次ページの「団体別の割り当て」をご覧ください。</p>'}</div><section class="details"><h1>団体別の割り当て</h1><table><thead><tr><th>団体</th><th>配置／頭数</th><th>馬房番号</th><th>屋内TRの場所</th><th>テント枠</th><th>通路利用</th></tr></thead><tbody>${summary}</tbody></table>${p.wireHorseSlots.length?`<p>馬を配置したワイヤー区画：${p.wireHorseSlots.map(id=>esc(stallLocation(id))).join('、')}</p>`:''}</section></body></html>`
}
