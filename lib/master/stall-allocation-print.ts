import { barnIds, stalls, horseTotal, groupAllocation, zoneComponents, stallPlanIssues, type StallPlan } from './stall-allocation'
const esc=(v:string)=>v.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!))
const palette=['#dcecff','#ffe3d3','#e0f1d9','#efe0ff','#fff2bf','#d7f2ed','#f9dfe9','#e4e6f8','#f0e5d4','#d8ecdc','#f6dfc9','#e2f0fa']
const lines=(text:string,max:number)=>Array.from(text).reduce<string[]>((a,c)=>{if(!a.length||Array.from(a[a.length-1]).length>=max)a.push(c);else a[a.length-1]+=c;return a},[])
/** Original master topology: S at left; 1..10; two stall columns; facilities below. */
export function stallPlanSvg(p:StallPlan,eventName:string):string{
  const colors=new Map(p.groups.map((g,i)=>[g.id,palette[i%palette.length]])), names=new Map(p.groups.map(g=>[g.id,g.name])), horseNames=new Map(p.groups.flatMap(g=>g.horses.map(h=>[h.id,h.name] as const)))
  const text=(x:number,y:number,t:string,size=14)=>`<text x="${x}" y="${y}" text-anchor="middle" font-size="${size}">${esc(t)}</text>`
  const label=(x:number,y:number,t:string,width:number,size=14)=>lines(t,Math.max(3,Math.floor(width/size))).map((s,i)=>text(x,y+i*(size+2),s,size)).join('')
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1680 980" role="img" aria-label="厩舎割 全体図" style="width:100%;height:auto;font-family:Arial,'Yu Gothic',Meiryo,sans-serif;background:white;color:#111"><rect width="1680" height="980" fill="white"/>${text(840,28,'競 技 場 側',22)}${barnIds.map((barn,i)=>{
    const x=15+i*151, y=105,w=64,h=47
    const local=stalls.filter(s=>s.barn===barn), used=local.filter(s=>p.cells[s.id]?.kind==='horse').length
    const cells=local.map(s=>{
      const c=p.cells[s.id],owner=c?.groupId??'',color=owner?colors.get(owner):c?.kind==='blocked'?'#ddd':s.wire?'#fff4d2':'white'
      const cx=x+s.side*(w+8),cy=y+s.row*h
      const description=`${barn}厩舎 ${s.number??s.id.split(':')[1]} ${c?.kind==='horse'?horseNames.get(c.horseId)??'':c?.kind==='tr'?'TR':c?.kind==='blocked'?'使用不可':s.wire?'TR用・ワイヤーあり':'空き'} ${names.get(owner)??''}`
      return `<g data-slot="${esc(s.id)}" tabindex="0" role="button" aria-label="${esc(description)}" style="cursor:pointer"><title>${esc(description)}</title><rect x="${cx}" y="${cy}" width="${w}" height="${h}" fill="${color}" stroke="#555" stroke-width="1"${s.wire?' stroke-dasharray="4 2"':''}/>${text(cx+9,cy+13,String(s.number??'W'),10)}${c?.kind==='tr'?text(cx+w/2,cy+29,'TR',18):c?.kind==='blocked'?text(cx+w/2,cy+29,'×',22):s.wire&&!c?text(cx+w/2,cy+28,'TR用',13):''}</g>`
    }).join('')
    // Repeat the supplied club label rectangles over runs of adjacent horse stalls.
    let blocks=''
    if(!p.options.layout)for(const side of [0,1]){
      const column=local.filter(s=>s.side===side)
      for(let j=0;j<column.length;){
        const c=p.cells[column[j].id]
        if(c?.kind!=='horse'){j++;continue}
        let end=j+1;while(end<column.length&&p.cells[column[end].id]?.kind==='horse'&&p.cells[column[end].id].groupId===c.groupId)end++
        const count=end-j,name=names.get(c.groupId)??'', size=count>1?14:11, chunks=lines(name,Math.floor((w-6)/size))
        const blockHeight=Math.min(count*h-8,chunks.length*(size+2)+22),top=y+j*h+(count*h-blockHeight)/2
        blocks+=`<g pointer-events="none"><rect x="${x+side*(w+8)+3}" y="${top}" width="${w-6}" height="${blockHeight}" fill="${colors.get(c.groupId)}" stroke="#333"/><text x="${x+side*(w+8)+w/2}" y="${top+size+3}" text-anchor="middle" font-size="${size}"${chunks.length*(size+2)+22>blockHeight?` transform="translate(0 ${top}) scale(1 ${blockHeight/(chunks.length*(size+2)+22)}) translate(0 ${-top})"`:''}>${chunks.map((l,k)=>`<tspan x="${x+side*(w+8)+w/2}" dy="${k?size+2:0}">${esc(l)}</tspan>`).join('')}<tspan x="${x+side*(w+8)+w/2}" dy="${size+3}">${count}頭</tspan></text></g>`
        j=end
      }
    }
    if(p.options.layout)for(const group of p.groups)for(const zone of zoneComponents(p,group.id,barn)){
      const owned=new Set(zone.map(s=>`${s.side}:${s.row}`)),color=colors.get(group.id),minRow=Math.min(...zone.map(s=>s.row)),maxRow=Math.max(...zone.map(s=>s.row))
      // The boundary includes the aisle between facing bays; one label per connected zone.
      let edges=''
      for(const s of zone){const left=x+s.side*(w+8),right=left+w,top=y+s.row*h,bottom=top+h,opposite=owned.has(`${1-s.side}:${s.row}`)
        if(!owned.has(`${s.side}:${s.row-1}`))edges+=`M${left},${top}H${right}`
        if(!owned.has(`${s.side}:${s.row+1}`))edges+=`M${left},${bottom}H${right}`
        if(s.side===0||!opposite)edges+=`M${left},${top}V${bottom}`
        if(s.side===1||!opposite)edges+=`M${right},${top}V${bottom}`
        if(s.side===0&&opposite){if(!(owned.has(`0:${s.row-1}`)&&owned.has(`1:${s.row-1}`)))edges+=`M${right},${top}h8`;if(!(owned.has(`0:${s.row+1}`)&&owned.has(`1:${s.row+1}`)))edges+=`M${right},${bottom}h8`}
      }
      blocks+=`<path d="${edges}" fill="none" stroke="#222" stroke-width="3" pointer-events="none"/>`
      const both=zone.some(s=>owned.has(`${1-s.side}:${s.row}`)),width=both?w*2+4:w-6,cx=both?x+w+4:x+zone[0].side*(w+8)+w/2
      const size=both?13:10,chunks=lines(group.name,Math.floor(width/size)),count=zone.filter(s=>p.cells[s.id].kind==='horse').length
      const height=Math.min((maxRow-minRow+1)*h-18,chunks.length*(size+2)+20),cy=y+(minRow+maxRow+1)*h/2-height/2
      blocks+=`<g pointer-events="none" data-zone-label="${esc(group.id)}"><rect x="${cx-width/2}" y="${cy}" width="${width}" height="${height}" rx="2" fill="${color}" fill-opacity="1" stroke="#333"/>${chunks.map((t,i)=>text(cx,cy+size+2+i*(size+2),t,size)).join('')}${text(cx,cy+height-3,`${count}頭`,size)}</g>`
    }
    const tent=horseTotal(p.groups)>150&&barn!=='S'?`<rect x="${x}" y="${y+10*h+20}" width="${w*2+8}" height="64" fill="#eef4fb" stroke="#555"/>${text(x+w+4,y+10*h+39,'仮設テント（TR2枠）',13)}${label(x+w+4,y+10*h+56,[p.tents[`${barn}:tent1`],p.tents[`${barn}:tent2`]].filter(Boolean).map(id=>names.get(id)??'').join('／')||'空き',w*2,10)}`:''
    return text(x+w+4,66,`${barn}厩舎`,25)+text(x+w+4,91,`${used}頭`,16)+cells+blocks+tent
  }).join('')}<circle cx="260" cy="790" r="54" fill="none" stroke="#333"/>${text(260,797,'丸馬場',17)}<rect x="445" y="735" width="150" height="50" fill="none" stroke="#333"/>${text(520,765,'装蹄所',17)}<rect x="805" y="760" width="170" height="60" fill="none" stroke="#333"/>${text(890,795,'休憩室',17)}<rect x="1000" y="760" width="125" height="60" fill="none" stroke="#333"/>${text(1062,795,'HM室',17)}<rect x="1430" y="735" width="200" height="70" fill="none" stroke="#333"/>${text(1530,778,'オガコ倉庫',17)}${text(840,883,eventName+' 厩舎割表',26)}${text(840,915,`合計 ${horseTotal(p.groups)}頭 ／ 配置 ${Object.values(p.cells).filter(c=>c.kind==='horse').length}頭　TR＝タックルーム　W＝ワイヤー区画`,19)}${p.corridors.length?text(840,945,'S通路利用：'+p.corridors.map(id=>names.get(id)).join('、'),15):''}</svg>`
}
export function stallPlanPrintHtml(p:StallPlan,eventName:string){
  const issues=stallPlanIssues(p)
  if(issues.length)throw new Error('未配置・TR不足・未反映の要望を解消してから印刷してください。')
  const summary=p.groups.map(g=>{
    const a=groupAllocation(p,g)
    const slots=(kind:'horse'|'tr')=>barnIds.map(b=>{
      const owned=stalls.filter(s=>s.barn===b&&p.cells[s.id]?.kind===kind&&p.cells[s.id].groupId===g.id)
      return owned.length?`${b}厩舎：${owned.map(s=>s.number??s.id.split(':')[1]).join('・')}`:''
    }).filter(Boolean).map(esc).join('<br>')||'—'
    const tent=Object.entries(p.tents).filter(([,id])=>id===g.id).map(([id])=>`${id.split(':')[0]}厩舎 枠${id.endsWith('1')?'1':'2'}`).map(esc).join('<br>')||'—'
    return `<tr><td>${esc(g.name)}</td><td>${g.horses.length}頭</td><td>${slots('horse')}</td><td>${a.indoor}室<br>${slots('tr')}</td><td>${tent}</td><td>${a.corridor?'S通路':'—'}</td></tr>`
  }).join('')
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>${esc(eventName)} 厩舎割</title><style>*{box-sizing:border-box}body{font-family:Arial,'Yu Gothic',Meiryo,sans-serif;margin:0;color:#111}nav{padding:12px;background:#eef3f8}button{padding:12px;margin:4px;font-size:18px}.map{width:285mm;height:185mm;page-break-after:always}.map svg{max-height:185mm}.details{padding:5mm}table{border-collapse:collapse;width:100%;font-size:10pt}td,th{border:1px solid #888;padding:5px}h1{font-size:18pt}tr{break-inside:avoid}thead{display:table-header-group}@page{size:A4 landscape;margin:6mm}@media print{nav{display:none}body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body><nav><button id="stable-print">印刷する</button><button id="stable-close">閉じる</button>A4横向き。1ページ目は配置図、続きは団体別一覧です。</nav><div class="map">${stallPlanSvg(p,eventName)}</div><section class="details"><h1>団体別の割り当て</h1><table><thead><tr><th>団体</th><th>頭数</th><th>馬房番号</th><th>屋内TRの場所</th><th>テント枠</th><th>通路利用</th></tr></thead><tbody>${summary}</tbody></table>${p.wireHorseSlots.length?`<p>ワイヤー区画の手動配置：${p.wireHorseSlots.map(esc).join('、')}</p>`:''}</section></body></html>`
}
