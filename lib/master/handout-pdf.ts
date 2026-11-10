import pdfMake from 'pdfmake/build/pdfmake'
import type {StallPlan} from './stall-allocation'
import {stallPlanSvg} from './stall-allocation-print'
import type {Content,CustomTableLayout,Size,TableCell,TDocumentDefinitions} from 'pdfmake/interfaces'

// Webpack emits the same-origin font files alongside the lazy JS chunk.
// The existing Winter offline asset manifest includes these files as well.
const regular=new URL('@expo-google-fonts/biz-udpgothic/400Regular/BIZUDPGothic_400Regular.ttf',import.meta.url).href
const bold=new URL('@expo-google-fonts/biz-udpgothic/700Bold/BIZUDPGothic_700Bold.ttf',import.meta.url).href
const font='TournamentJP'
function registerFonts(){
  const normal=new URL(regular,document.baseURI).href,heavy=new URL(bold,document.baseURI).href
  pdfMake.addFonts({[font]:{normal,bold:heavy,italics:normal,bolditalics:heavy}})
}

function page(title:string,content:Content):TDocumentDefinitions{
  registerFonts()
  return {pageSize:'A4',pageOrientation:'landscape',pageMargins:[17,17,17,17],info:{title},defaultStyle:{font,fontSize:9,color:'#17202a'},content}
}

function tableLayout(scale:number):CustomTableLayout{
  return {hLineWidth:()=>.45*scale,vLineWidth:()=>.45*scale,hLineColor:()=>'#737e85',vLineColor:()=>'#737e85',
    paddingLeft:()=>2.7*scale,paddingRight:()=>2.7*scale,paddingTop:()=>1.35*scale,paddingBottom:()=>1.35*scale}
}

// Use the print document's actual rows, spans, labels, explicit line breaks and notes.
function convertTable(table:HTMLTableElement,widths:Size[],scale:number,columnWidth?:number,measure?:CanvasRenderingContext2D):Content{
  const body:TableCell[][]=Array.from(table.rows,row=>{
    const values:TableCell[]=[]
    for(const cell of Array.from(row.cells)){
      const copy=cell.cloneNode(true) as HTMLElement
      copy.querySelectorAll('br').forEach(br=>br.replaceWith('\n'))
      const heading=cell.tagName==='TH',date=row.classList.contains('date')
      const text=copy.textContent?.trim()??''
      let size=(heading?8:9)*scale
      if(cell.hasAttribute('data-competition-name')&&columnWidth&&measure){
        const share=parseFloat(String(widths[cell.cellIndex]))/100
        measure.font=size+'px HandoutMetrics'
        const room=(columnWidth-widths.length*(5.4*scale+1))*share-3
        size*=Math.min(1,room/Math.max(1,measure.measureText(text).width))
      }
      values.push({text,bold:heading,noWrap:cell.hasAttribute('data-competition-name'),fillColor:date?'#dbe6f2':heading?'#edf1f5':undefined,
        alignment:cell.classList.contains('center')?'center':'left',colSpan:cell.colSpan, fontSize:size})
      for(let col=1;col<cell.colSpan;col++)values.push({})
    }
    return values
  })
  return {table:{widths,headerRows:table.tHead?.rows.length??0,body},layout:tableLayout(scale)}
}

export async function timetablePdf(html:string,sectionId=''):Promise<Blob>{
  const doc=new DOMParser().parseFromString(html,'text/html')
  const sheet=doc.querySelector('[data-timetable-content]')
  const sections=Array.from(sheet?.querySelectorAll<HTMLElement>('.columns>section')??[])
    .filter(s=>!sectionId||s.dataset.section===sectionId)
  if(!sheet||!sections.length)throw new Error('PDFにする日程と競技区分を選んでください。')
  const title=doc.title
  if(!document.fonts.check('12px HandoutMetrics')||!Array.from(document.fonts).some(f=>f.family==='HandoutMetrics')){
    const face=await new FontFace('HandoutMetrics','url("'+regular+'")').load()
    document.fonts.add(face)
  }
  const measure=document.createElement('canvas').getContext('2d')
  if(!measure)throw new Error('競技名の印刷幅を確認できません。')
  const columnWidth=(841.89-34-(sections.length-1)*12)/sections.length
  // Measure the actual PDF pagination with the embedded font. Scale down only
  // if the selected days spill over, keeping the table and text as vectors.
  for(let scale=1;scale>=.25;scale*=.90){
    const columns:Content[]=sections.map(section=>{
      const table=section.querySelector('table')!
      const widths=Array.from(table.querySelectorAll('col'),col=>col.style.width as Size)
      return {stack:[{text:section.querySelector('h3')!.textContent!,bold:true,alignment:'center',fontSize:11*scale,margin:[0,1,0,3]},convertTable(table,widths,scale,columnWidth,measure)]}
    })
    const def=page(title,[
      {text:sheet.querySelector('h1')!.textContent!,bold:true,fontSize:15*scale,alignment:'center'},
      {text:sheet.querySelector('h2')!.textContent!,fontSize:11*scale,alignment:'center'},
      {text:sheet.querySelector('header p')?.textContent??'',fontSize:8*scale,alignment:'center',margin:[0,1,0,3]},
      {columns,columnGap:12},...Array.from(sheet.querySelectorAll('footer p'),p=>({text:p.textContent??'',fontSize:8*scale,marginTop:3*scale}))
    ])
    let pages=0
    def.footer=(_current,total)=>{pages=total;return {text:''}}
    const blob=await pdfMake.createPdf(def).getBlob()
    if(pages===1)return blob
  }
  throw new Error('選択した日程を1ページに収められません。日程を選び直してください。')
}

export async function stallAllocationPdf(plan:StallPlan,eventName:string):Promise<Blob>{
  const doc=new DOMParser().parseFromString(stallPlanSvg(plan,eventName),'image/svg+xml')
  const svg=doc.documentElement
  if(svg.localName!=='svg')throw new Error('厩舎割の配置図を確認できません。')
  svg.removeAttribute('style')
  const map:Content={svg:new XMLSerializer().serializeToString(svg),font,fit:[801,555],alignment:'center'}
  return pdfMake.createPdf(page(eventName+' 厩舎割',[map])).getBlob()
}
