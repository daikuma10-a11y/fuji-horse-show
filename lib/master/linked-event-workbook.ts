import {strFromU8, strToU8, unzipSync, zipSync} from 'fflate'

type Value = string | number
type Cell = {value: Value; formula?: string}
export type FormCompetition = {
  number: string; name: string; venue: string; dressage: boolean; official: boolean; recognitionNumber: number | null
  entries: Value[][]
}

const main = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
const relationships = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
const packageRels = 'http://schemas.openxmlformats.org/package/2006/relationships'
const contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.'
const xml = (v: Value) => String(v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
const sheetRef = (name: string) => "'"+name.replace(/'/g,"''")+"'"
const literal = (value: Value): Cell => ({value})
function link(sheet: string, address: string, value: Value): Cell {
  const source = sheetRef(sheet)+'!'+address
  return {value, formula:'IF('+source+'="","",'+source+')'}
}

// Layouts are curated, value-free extracts of the organizer's two Excel forms.
function putCells(layout: string, cells: Record<string, Cell>) {
  return layout.replace(/<c r="([A-Z]+\d+)" s="(\d+)"\/>/g, (empty, address: string, style: string) => {
    const cell = cells[address]
    if (!cell || (!cell.formula && cell.value==='')) return empty
    const attrs = ' r="'+address+'" s="'+style+'"'
    if (cell.formula) return '<c'+attrs+(typeof cell.value==='number'?'':' t="str"')+'><f>'+xml(cell.formula)+'</f><v>'+xml(cell.value)+'</v></c>'
    if (typeof cell.value==='number') return '<c'+attrs+'><v>'+cell.value+'</v></c>'
    return '<c'+attrs+' t="inlineStr"><is><t xml:space="preserve">'+xml(cell.value)+'</t></is></c>'
  })
}

function scoreCells(row: number, last: number, dressage: boolean) {
  const cells: Record<string,Cell> = {}
  const set = (col: string, formula: string) => { cells[col+row] = {formula, value:''} }
  if (dressage) {
    const marks = ['H','J','L','N','P'].map(col=>col+row).join(',')
    for (const [rank, mark] of [['I','H'],['K','J'],['M','L'],['O','N'],['Q','P']]) {
      const at=mark+row
      set(rank,'IF('+at+'="","",RANK('+at+','+mark+'$13:'+mark+'$'+last+',0))')
    }
    set('R','IF(COUNT('+marks+')=0,"",AVERAGE('+marks+'))')
  } else {
    for (const [total, trigger, a, b] of [['J','H','H','I'],['M','L','K','L'],['P','N','N','O'],['S','R','Q','R']]) {
      set(total,'IF('+trigger+row+'="","",'+a+row+'+'+b+row+')')
    }
  }
  return cells
}

function firstEntryRow(isStart: boolean, dressage: boolean) {
  return isStart || dressage ? 13 : 14
}

function fillSheet(layout: string, header: Record<string, Cell>, comp: FormCompetition, isStart: boolean, printedRows: number, numberedThrough: number) {
  const firstResult = firstEntryRow(false, comp.dressage)
  const first = firstEntryRow(isStart, comp.dressage)
  const count = Math.max(comp.dressage ? 30 : 60, printedRows)
  const finalOrder = Number(comp.entries.at(-1)?.[1] ?? 0)
  const pattern = new RegExp('<row r="'+first+'"[^>]*>[\\s\\S]*?</row>(?=</sheetData>)')
  const prototype = layout.match(pattern)?.[0]
  if (!prototype) throw new Error('公式用紙の明細行を確認できません')
  const rows = Array.from({length: count}, (_, i) => {
    const row = first+i, cells = isStart ? {} as Record<string,Cell> : scoreCells(row,first+count-1,comp.dressage)
    Array.from('ABCDEFG').forEach((col, index) => {
      const nextNumber = finalOrder + i - comp.entries.length + 1
      const reserveOrder = col === 'B' && i >= comp.entries.length && i < printedRows && nextNumber <= numberedThrough
      const value = reserveOrder ? nextNumber : comp.entries[i]?.[index] ?? ''
      const sourceRow = firstResult+i
      if (isStart && (col === 'D' || col === 'F')) {
        const ref = sheetRef(comp.number)+'!'
        const id = ref+col+sourceRow, name = ref+(col==='D'?'C':'E')+sourceRow
        cells[col+row] = {value, formula:'IF('+id+'="",IF('+name+'="","","-"),IF(ISNUMBER('+id+'),TEXT('+id+',"00000"),'+id+'))'}
      } else {
        cells[col+row] = isStart ? link(comp.number,col+sourceRow,value) : literal(value)
      }
    })
    const template = prototype.replace(/\br="([A-Z]*)\d+"/g,(_, col:string) => 'r="'+col+row+'"')
    return putCells(template,cells)
  })
  const printableLayout = layout.replace('fitToHeight="0"', 'fitToHeight="1"')
  return putCells(printableLayout.replace(prototype,'<!--entries-->'),header).replace('<!--entries-->',()=>rows.join(''))
}

export function buildLinkedEventWorkbook(layouts: Uint8Array, title: string, date: string, competitions: FormCompetition[],
  {startsPerPage = 40, numberedThrough = Infinity}: {startsPerPage?: number; numberedThrough?: number} = {}) {
  const assets = unzipSync(layouts)
  const files: Record<string,Uint8Array> = {'xl/styles.xml':assets['styles.xml'],'xl/theme/theme1.xml':assets['theme.xml']}
  const sheets: string[] = [], rels: string[] = [], areas: string[] = [], types: string[] = []
  const serial = Date.parse(date+'T00:00:00Z')/86400000+25569
  for (const isStart of [true,false]) {
    for (const comp of competitions) {
      const name=isStart ? comp.number+'_出番表' : comp.number
      const headers: Record<string,Cell>={}
      const recognitionCell = comp.dressage ? 'C5' : 'D5'
      const fields: Record<string,Value>={F2:serial,C3:title,C4:comp.number,F4:comp.name,[recognitionCell]:comp.recognitionNumber ?? '-'}
      if (isStart) {
        const refs: Record<string,string>={C6:'C2',G6:'F2',C7:'C3',B8:'C4',D8:'F4',D9:recognitionCell,F9:comp.dressage?'F5':'K4'}
        if (!comp.dressage) { refs.D10='D6'; refs.F10='F5' }
        for (const [addr,target] of Object.entries(refs)) headers[addr]=link(comp.number,target,fields[target]??'')
        headers.G10=literal('競技場：'+comp.venue)
      } else {
        for (const [addr,value] of Object.entries(fields)) headers[addr]=literal(value)
      }
      const kind=comp.dressage?'dressage':comp.official&&!isStart?'official':'jump'
      const layout=assets[kind+(isStart?'-start-single-header.xml':'-result.xml')]
      const id=sheets.length+1, file='worksheets/sheet'+id+'.xml'
      const pages = Math.max(1, Math.ceil(comp.entries.length / startsPerPage))
      const printedRows = pages * startsPerPage
      files['xl/'+file]=strToU8(fillSheet(strFromU8(layout),headers,comp,isStart,printedRows,numberedThrough))
      sheets.push('<sheet name="'+xml(name)+'" sheetId="'+id+'" r:id="rId'+id+'"/>')
      rels.push('<Relationship Id="rId'+id+'" Type="'+relationships+'/worksheet" Target="'+file+'"/>')
      types.push('<Override PartName="/xl/'+file+'" ContentType="'+contentType+'worksheet+xml"/>')
      const first=isStart?6:2, headerEnd=firstEntryRow(isStart,comp.dressage)-1
      const column=isStart?'G':comp.dressage?'S':'T'
      const sheet=xml(sheetRef(name))+'!'
      // Each print area fits a single page; print titles repeat on later blocks.
      const printAreas = Array.from({length:pages}, (_, page) => {
        const top = page === 0 ? first : headerEnd + page * startsPerPage + 1
        return sheet+'$A$'+top+':$'+column+'$'+(headerEnd + (page+1)*startsPerPage)
      })
      areas.push('<definedName name="_xlnm.Print_Area" localSheetId="'+(id-1)+'">'+printAreas.join(',')+'</definedName>')
      areas.push('<definedName name="_xlnm.Print_Titles" localSheetId="'+(id-1)+'">'+sheet+'$'+first+':$'+headerEnd+'</definedName>')
    }
  }
  const write=(path:string,body:string)=>{files[path]=strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'+body)}
  write('xl/workbook.xml','<workbook xmlns="'+main+'" xmlns:r="'+relationships+'"><sheets>'+sheets.join('')+'</sheets><definedNames>'+areas.join('')+'</definedNames><calcPr calcMode="auto" fullCalcOnLoad="1"/></workbook>')
  write('xl/_rels/workbook.xml.rels','<Relationships xmlns="'+packageRels+'">'+rels.join('')+'<Relationship Id="styles" Type="'+relationships+'/styles" Target="styles.xml"/><Relationship Id="theme" Type="'+relationships+'/theme" Target="theme/theme1.xml"/></Relationships>')
  write('_rels/.rels','<Relationships xmlns="'+packageRels+'"><Relationship Id="book" Type="'+relationships+'/officeDocument" Target="xl/workbook.xml"/></Relationships>')
  write('[Content_Types].xml','<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="'+contentType+'sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="'+contentType+'styles+xml"/><Override PartName="/xl/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/>'+types.join('')+'</Types>')
  return zipSync(files)
}
