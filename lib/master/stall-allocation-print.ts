import { barnIds, stalls, stallLocation, horseTotal, groupAllocation, type StallPlan } from './stall-allocation'
import {aisleWidth, bayWidth, layoutClubSigns, rowHeight, rowTop, signBox} from './stall-club-signs'
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const palette=['#dcecff','#ffe3d3','#e0f1d9','#efe0ff','#fff2bf','#d7f2ed','#f9dfe9','#e4e6f8','#f0e5d4','#d8ecdc','#f6dfc9','#e2f0fa']
const lines=(text:string,max:number)=>Array.from(text).reduce<string[]>((a,c)=>{if(!a.length||Array.from(a[a.length-1]).length>=max)a.push(c);else a[a.length-1]+=c;return a},[])
// Letters identify the same club in the map and the detailed stall assignments.
function clubMark(index: number): string {
  let mark = ''
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    mark = String.fromCharCode(65 + (n - 1) % 26) + mark
  }
  return mark
}

/** Original master topology: S at left; 1..10; two stall columns; facilities below. */
export function stallPlanSvg(p:StallPlan,eventName:string):string{
  const barns = layoutClubSigns(p)
  const gridBottom = rowTop(12)
  const svgHeight = gridBottom + 311
  const colors=new Map(p.groups.map((g,i)=>[g.id,palette[i%palette.length]])), names=new Map(p.groups.map(g=>[g.id,g.name])), marks=new Map(p.groups.map((g,i)=>[g.id,clubMark(i)])), horseNames=new Map(p.groups.flatMap(g=>g.horses.map(h=>[h.id,h.name] as const)))
  const text=(x:number,y:number,t:string,size=14)=>`<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}">${esc(t)}</text>`
  const label=(x:number,y:number,t:string,width:number,size=14)=>lines(t,Math.max(3,Math.floor(width/size))).map((s,i)=>text(x,y+i*(size+2),s,size)).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1680 ${svgHeight}" role="img" aria-label="厩舎割 全体図" style="width:100%;height:auto;font-family:Arial,'Yu Gothic',Meiryo,sans-serif;background:white;color:#111"><rect width="1680" height="${svgHeight}" fill="white"/>${text(840,28,'競 技 場 側',22)}${barnIds.map((barn,i)=>{
    const x=15+i*151, w=bayWidth
    const local=stalls.filter(s=>s.barn===barn), used=local.filter(s=>p.cells[s.id]?.kind==='horse').length
    const zones = barns.get(barn)!
    const signedSlots = new Set(zones.flatMap(({sign,slots}) => slots
      .filter(s => s.row === sign.row && s.side >= sign.side && s.side < sign.side + sign.span)
      .map(s => s.id)))
    const cells=local.map(s=>{
      const c=p.cells[s.id],owner=c?.groupId??'',color=owner?colors.get(owner):c?.kind==='blocked'?'#ddd':'white'
      const cx=x+s.side*(w+aisleWidth),cy=rowTop(s.row), signed=signedSlots.has(s.id)
      const description=`${barn}厩舎 ${s.number} ${c?.kind==='horse'?horseNames.get(c.horseId)??'':c?.kind==='tr'?'TR':c?.kind==='blocked'?'使用不可':'空き'} ${names.get(owner)??''}`
      const mark = marks.get(owner)
      const badge = mark ? `<text x="${cx+w-3}" y="${cy+(signed?12:rowHeight-2)}" text-anchor="end" font-size="${signed?10:11}" font-weight="bold">${mark}</text>` : ''
      const use = c?.kind === 'tr' ? `<text x="${cx+w/2}" y="${cy+(signed?17:36)}" text-anchor="middle" font-size="${signed?16:19}" font-weight="bold">TR</text>` : c?.kind === 'blocked' ? text(cx+w/2,cy+29,'×',22) : ''
      return `<g data-slot="${esc(s.id)}"${c?.kind==='horse'||c?.kind==='tr'?' data-movable="true"':''} tabindex="0" role="button" aria-label="${esc(description)}"><title>${esc(description)}</title><rect x="${cx}" y="${cy}" width="${w}" height="${rowHeight}" fill="${color}" stroke="#555" stroke-width="1"/>${text(cx+9,cy+12,String(s.number),11)}${use}${badge}</g>`
    }).join('')
    let blocks=''
    // Keep the zone boundary, including the aisle between facing bays.
    for(const zone of zones){
      const owned=new Set(zone.slots.map(s=>`${s.side}:${s.row}`))
      let edges=''
      for(const s of zone.slots){const left=x+s.side*(w+aisleWidth),right=left+w,top=rowTop(s.row),bottom=top+rowHeight,opposite=owned.has(`${1-s.side}:${s.row}`)
        if(!owned.has(`${s.side}:${s.row-1}`))edges+=`M${left},${top}H${right}`
        if(!owned.has(`${s.side}:${s.row+1}`))edges+=`M${left},${bottom}H${right}`
        if(s.side===0||!opposite)edges+=`M${left},${top}V${bottom}`
        if(s.side===1||!opposite)edges+=`M${right},${top}V${bottom}`
        if(s.side===0&&opposite){if(!(owned.has(`0:${s.row-1}`)&&owned.has(`1:${s.row-1}`)))edges+=`M${right},${top}h8`;if(!(owned.has(`0:${s.row+1}`)&&owned.has(`1:${s.row+1}`)))edges+=`M${right},${bottom}h8`}
      }
      blocks+=`<path d="${edges}" fill="none" stroke="#222" stroke-width="3" pointer-events="none"/>`
      const sign=zone.sign, box=signBox(sign,x)
      const ink=sign.lines.map((l,n)=>`<text x="${box.x+sign.width/2}" y="${box.y+sign.fontSize+1+n*sign.lineHeight}" text-anchor="middle" font-size="${sign.fontSize}" textLength="${l.width}" lengthAdjust="spacingAndGlyphs">${esc(l.text)}</text>`).join('')
      blocks+=`<g data-zone-label="${esc(zone.groupId)}" pointer-events="none"><title>${esc(zone.name)}</title><rect x="${box.x}" y="${box.y}" width="${sign.width}" height="${sign.height}" fill="white" stroke="#333" stroke-width="1.3"/>${ink}</g>`
    }
    const tent=horseTotal(p.groups)>150&&barn!=='S'?`<rect x="${x}" y="${rowTop(10)+20}" width="${w*2+8}" height="64" fill="#eef4fb" stroke="#555"/>${text(x+w+4,rowTop(10)+39,'仮設テント（TR2枠）',13)}${label(x+w+4,rowTop(10)+56,[p.tents[`${barn}:tent1`],p.tents[`${barn}:tent2`]].filter(Boolean).map(id=>names.get(id)??'').join('／')||'空き',w*2,10)}`:''
    return text(x+w+4,66,`${barn}厩舎`,25)+text(x+w+4,91,`${used}頭`,16)+cells+blocks+tent
  }).join('')}<g transform="translate(0 ${gridBottom})"><circle cx="260" cy="121" r="54" fill="none" stroke="#333"/>${text(260,128,'丸馬場',17)}<rect x="445" y="66" width="150" height="50" fill="none" stroke="#333"/>${text(520,96,'装蹄所',17)}<rect x="805" y="91" width="170" height="60" fill="none" stroke="#333"/>${text(890,126,'休憩室',17)}<rect x="1000" y="91" width="125" height="60" fill="none" stroke="#333"/>${text(1062,126,'HM室',17)}<rect x="1430" y="66" width="200" height="70" fill="none" stroke="#333"/>${text(1530,109,'オガコ倉庫',17)}${text(840,214,eventName+' 厩舎割表',26)}${text(840,246,`合計 ${horseTotal(p.groups)}頭 ／ 配置 ${Object.values(p.cells).filter(c=>c.kind==='horse').length}頭　TR＝タックルーム`,19)}${p.corridors.length?text(840,276,'S通路利用：'+p.corridors.map(id=>names.get(id)).join('、'),15):''}</g></svg>`
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
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(eventName)} 厩舎割</title><style>*{box-sizing:border-box}body{font-family:Arial,'Yu Gothic',Meiryo,sans-serif;margin:0;color:#111}nav{padding:12px;background:#eef3f8}button{padding:12px;margin:4px;font-size:18px}.map{width:100%;break-after:page}.map svg{display:block;max-height:190mm}.details{padding:5mm}table{border-collapse:collapse;width:100%;font-size:10pt}td,th{border:1px solid #888;padding:5px}h1{font-size:18pt}tr{break-inside:avoid}thead{display:table-header-group}@page{size:A4 landscape;margin:6mm}@media print{nav{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><nav><button id="stable-print">印刷する</button><button id="stable-close">閉じる</button>A4横向き。1ページ目は配置図、続きは団体別一覧です。</nav><div class="map">${stallPlanSvg(p,eventName)}</div><section class="details"><h1>団体別の割り当て</h1><table><thead><tr><th>団体</th><th>配置／頭数</th><th>馬房番号</th><th>屋内TRの場所</th><th>テント枠</th><th>通路利用</th></tr></thead><tbody>${summary}</tbody></table>${p.wireHorseSlots.length?`<p>馬を配置したワイヤー区画：${p.wireHorseSlots.map(id=>esc(stallLocation(id))).join('、')}</p>`:''}</section></body></html>`
}
