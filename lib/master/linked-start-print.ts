import {strFromU8, unzipSync} from 'fflate'

const xmlEscape = (value: string) => value.replace(/[&<>"']/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[ch]!))
const elements = (root: Element | Document, name: string) => Array.from(root.getElementsByTagName(name))
const first = (root: Element, name: string) => root.getElementsByTagName(name)[0]
const fontFamily = '"ＭＳ Ｐゴシック","Yu Gothic","Hiragino Kaku Gothic ProN",Meiryo,sans-serif'
type CellStyle = {size:number; bold:boolean; underline:boolean; align:string; vertical:string; fill:string; edges:string[]; isDate:boolean}
const edgeNames = ['top','right','bottom','left']
function cellStyles(xml: Document): CellStyle[] {
  const items = (group:string) => Array.from(xml.getElementsByTagName(group)[0].children)
  const fonts=items('fonts'), fills=items('fills'), borders=items('borders')
  const numberFormats = new Map(elements(xml,'numFmt').map(fmt=>[fmt.getAttribute('numFmtId'),fmt.getAttribute('formatCode')]))
  return items('cellXfs').map(xf=>{
    const font=fonts[Number(xf.getAttribute('fontId'))], border=borders[Number(xf.getAttribute('borderId'))]
    const fill=first(fills[Number(xf.getAttribute('fillId'))],'fgColor')?.getAttribute('rgb') || ''
    const alignment=first(xf,'alignment'), format=xf.getAttribute('numFmtId')
    return {size:Number(first(font,'sz')?.getAttribute('val') || 11)*4/3, bold:!!first(font,'b'), underline:!!first(font,'u'),
      align:alignment?.getAttribute('horizontal') || 'left', vertical:alignment?.getAttribute('vertical') || 'bottom',
      fill:/^[\da-f]{8}$/i.test(fill)?'#'+fill.slice(2):'',edges:edgeNames.map(edge=>first(border,edge)?.getAttribute('style') || ''),isDate:format==='14' || /^yyyy\/m\/d(?:;@)?$/i.test(numberFormats.get(format) ?? '')}
  })
}
type Box = {left:number; top:number; right:number; bottom:number}
function range(ref:string): Box {
  const match=/^([A-G])(\d+):([A-G])(\d+)$/.exec(ref.replace(/\$/g,''))
  if(!match) throw new Error('出番表の印刷範囲を確認できません')
  return {left:match[1].charCodeAt(0)-65,top:Number(match[2]),right:match[3].charCodeAt(0)-65,bottom:Number(match[4])}
}
function cellText(cell:Element, style:CellStyle) {
  const raw=first(cell,'v')?.textContent ?? Array.from(cell.getElementsByTagName('t'),e=>e.textContent).join('')
  if(style.isDate && raw && Number.isFinite(Number(raw))){
    const d=new Date((Number(raw)-25569)*86400000)
    return d.getUTCFullYear()+'/'+(d.getUTCMonth()+1)+'/'+d.getUTCDate()
  }
  return raw
}

// Render the cached values, geometry and styles of the generated Excel start sheets.
function worksheetPages(sheet:Document, areas:Box[], titles:number[], styles:CellStyle[], ctx:CanvasRenderingContext2D) {
  const cols=elements(sheet,'col'), rows=new Map(elements(sheet,'row').map(row=>[Number(row.getAttribute('r')),row]))
  const widths=Array.from({length:7},(_,i)=>Number(cols.find(c=>Number(c.getAttribute('min'))<=i+1 && Number(c.getAttribute('max'))>=i+1)?.getAttribute('width') || 9)*7)
  const xs=[0];for(const w of widths)xs.push(xs[xs.length-1]+w)
  const merges=elements(sheet,'mergeCell').map(m=>range(m.getAttribute('ref')!))
  const cells=new Map(elements(sheet,'c').map(c=>[c.getAttribute('r')!,c]))
  const addr=(col:number,row:number)=>String.fromCharCode(65+col)+row
  const values=new Map(Array.from(cells,([ref,c])=>[ref,cellText(c,styles[Number(c.getAttribute('s')) || 0])]))
  return areas.map(area=>{
    const numbers=Array.from({length:area.bottom-area.top+1},(_,i)=>area.top+i)
    if(area.top>titles[titles.length-1])numbers.unshift(...titles)
    const y=new Map<number,number>()
    let total=0
    for(const r of numbers){y.set(r,total);total+=Number(rows.get(r)?.getAttribute('ht') || 11)*4/3}
    const fills:string[]=[], borders:string[]=[], labels:string[]=[]
    for(const r of numbers){
      const top=y.get(r)!, height=Number(rows.get(r)?.getAttribute('ht') || 11)*4/3
      for(let col=area.left;col<=area.right;col++){
        const ref=addr(col,r),cell=cells.get(ref)
        if(!cell)continue
        const st=styles[Number(cell.getAttribute('s')) || 0],x=xs[col],w=widths[col]
        if(st.fill)fills.push(`<rect x="${x}" y="${top}" width="${w}" height="${height}" fill="${st.fill}"/>`)
        const points=[[x,top,x+w,top],[x+w,top,x+w,top+height],[x,top+height,x+w,top+height],[x,top,x,top+height]]
        st.edges.forEach((edge,i)=>{if(edge){const [a,b,c,d]=points[i];borders.push(`<path d="M${a} ${b} L${c} ${d}" stroke-width="${edge==='medium'||edge==='thick'?1.8:1}"/>`)}})
        const text=values.get(ref)
        if(!text)continue
        const merged=merges.find(m=>m.left===col && m.top===r)
        const right=merged?.right??col, bottom=merged?.bottom??r
        const cellHeight=(y.get(bottom)??top)+Number(rows.get(bottom)?.getAttribute('ht')||11)*4/3-top
        let leftX=x,rightX=xs[right+1]
        // Unmerged header labels on the Excel form can flow into adjacent blank cells.
        if(!merged && r<=titles[titles.length-1] && st.align==='left'){
          for(let next=col+1;next<=area.right && !values.get(addr(next,r));next++)rightX=xs[next+1]
        }else if(!merged && r<=titles[titles.length-1] && st.align==='right'){
          for(let prev=col-1;prev>=area.left && !values.get(addr(prev,r));prev--)leftX=xs[prev]
        }
        const lines=text.split('\n'), size=Math.min(st.size,(cellHeight-1)/lines.length)
        const anchor=st.align==='center'?'middle':st.align==='right'?'end':'start'
        const tx=anchor==='middle'?(x+xs[right+1])/2:anchor==='end'?xs[right+1]-2:x+2
        const space=Math.max(1,anchor==='middle'?xs[right+1]-x-3:anchor==='start'?rightX-tx-1:tx-leftX-1)
        const lineStart=st.vertical==='center'?(cellHeight-lines.length*size)/2:st.vertical==='top'?0:cellHeight-lines.length*size-1
        ctx.font=(st.bold?'bold ':'')+size+'px '+fontFamily
        for(const [index,line] of lines.entries()){
          const fit=ctx.measureText(line).width>space?` textLength="${space}" lengthAdjust="spacingAndGlyphs"`:''
          labels.push(`<text x="${tx}" y="${top+lineStart+(index+.84)*size}" text-anchor="${anchor}" font-size="${size}"${st.bold?' font-weight="bold"':''}${st.underline?' text-decoration="underline"':''}${fit}>${xmlEscape(line)}</text>`)
        }
      }
    }
    return `<section><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${xs[7]} ${total}" preserveAspectRatio="xMidYMin meet"><g>${fills.join('')}</g><g fill="none" stroke="black">${borders.join('')}</g><g style="font-family:${xmlEscape(fontFamily)}" xml:space="preserve">${labels.join('')}</g></svg></section>`
  })
}
export function linkedStartPrintHtml(bytes:Uint8Array, title:string):string {
  const files=unzipSync(bytes),parser=new DOMParser()
  const doc=(path:string)=>parser.parseFromString(strFromU8(files[path]),'application/xml')
  const book=doc('xl/workbook.xml'), defs=elements(book,'definedName'), rels=elements(doc('xl/_rels/workbook.xml.rels'),'Relationship')
  const styles=cellStyles(doc('xl/styles.xml')),ctx=document.createElement('canvas').getContext('2d')
  if(!ctx)throw new Error('印刷用の文字幅を確認できません')
  const pages:string[]=[]
  for(const [index,sheet] of elements(book,'sheet').entries()){
    if(!sheet.getAttribute('name')?.endsWith('_出番表'))continue
    const target=rels.find(rel=>rel.getAttribute('Id')===sheet.getAttribute('r:id'))?.getAttribute('Target')
    const defined=(name:string)=>defs.find(d=>d.getAttribute('name')===name && Number(d.getAttribute('localSheetId'))===index)?.textContent
    const area=defined('_xlnm.Print_Area'),repeat=defined('_xlnm.Print_Titles')?.match(/!\$(\d+):\$(\d+)$/)
    if(!target || !area || !repeat) throw new Error('出番表の印刷設定を確認できません')
    const titles=Array.from({length:Number(repeat[2])-Number(repeat[1])+1},(_,i)=>Number(repeat[1])+i)
    pages.push(...worksheetPages(doc('xl/'+target),area.split(',').map(a=>range(a.slice(a.lastIndexOf('!')+1))),titles,styles,ctx))
  }
  if(!pages.length)throw new Error('この日の出番表がありません')
  return `<!doctype html><html lang="ja"><meta charset="utf-8"><title>${xmlEscape(title)}</title><style>
  @page{size:A4 portrait;margin:10mm}*{box-sizing:border-box}body{margin:0;background:#eee}nav{padding:12px;text-align:center}button{font:inherit;padding:8px 16px}
  section{width:190mm;height:276mm;margin:0 auto 8px;background:#fff;break-inside:avoid}svg{width:100%;height:100%;display:block}
  @media print{nav{display:none}body{background:white}section{margin:0;break-after:page}section:last-child{break-after:auto}}
  </style><nav><button id="stable-print">印刷</button> <button id="stable-close">閉じる</button></nav>${pages.join('')}</html>`
}
