export type SettlementDocumentLine = {
  key?: string; competitionNumber?: number; riderId?: string; receiptRider?: string; period: string; action: string; competition: string; rider: string; horse: string
  entryFee: number; serviceFee: number; difference: number; amount: number; paid: number; note: string
}
export type SettlementDocument = {
  organization: string; organizationKey: string; issuedDate: string; normalTotal: number; advancePaid: number; advanceRecorded: boolean
  normalRemaining?: number; extraTotal: number; extraPaid: number; due: number; method: string; bankDetails: string; lines: SettlementDocumentLine[]
  selection?: { includeNormal: boolean }
}

// A dependency-free OOXML export keeps the download usable in Excel on the office PC.
// Text is always stored as inline strings, never interpreted as Excel formulas.
const xml = (value: string) => value.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const encoder = new TextEncoder()
function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff
  for (const byte of bytes) { crc ^= byte; for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0) }
  return (crc ^ 0xffffffff) >>> 0
}
function zip(files: Record<string, string>): Uint8Array {
  const chunks: Uint8Array[] = [], central: Uint8Array[] = []; let offset = 0
  for (const [path, content] of Object.entries(files)) {
    const name = encoder.encode(path), data = encoder.encode(content), crc = crc32(data)
    const header = new Uint8Array(30 + name.length), h = new DataView(header.buffer)
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x800, true); h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, name.length, true); header.set(name, 30)
    const directory = new Uint8Array(46 + name.length), d = new DataView(directory.buffer)
    d.setUint32(0, 0x02014b50, true); d.setUint16(4, 20, true); d.setUint16(6, 20, true); d.setUint16(8, 0x800, true); d.setUint32(16, crc, true); d.setUint32(20, data.length, true); d.setUint32(24, data.length, true); d.setUint16(28, name.length, true); d.setUint32(42, offset, true); directory.set(name, 46)
    chunks.push(header, data); central.push(directory); offset += header.length + data.length
  }
  const centralLength = central.reduce((sum, chunk) => sum + chunk.length, 0), end = new Uint8Array(22), e = new DataView(end.buffer)
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, central.length, true); e.setUint16(10, central.length, true); e.setUint32(12, centralLength, true); e.setUint32(16, offset, true)
  const result = new Uint8Array(offset + centralLength + end.length); let cursor = 0
  for (const chunk of [...chunks, ...central, end]) { result.set(chunk, cursor); cursor += chunk.length }
  return result
}
export function settlementWorkbook(document: SettlementDocument): Uint8Array {
  const rows: string[] = [], merges: string[] = []
  const textCell = (ref: string, value: string, style = 0) => `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xml(value)}</t></is></c>`
  const numberCell = (ref: string, value: number, formula?: string) => `<c r="${ref}" s="2">${formula ? `<f>${xml(formula)}</f>` : ''}<v>${value}</v></c>`
  const addRow = (number: number, cells: string, height = 25) => rows.push(`<row r="${number}" ht="${height}" customHeight="1">${cells}</row>`)
  const label = (row: number, title: string, value: string | number, formula?: string) => { merges.push(`A${row}:D${row}`, `E${row}:I${row}`); addRow(row, textCell(`A${row}`, title, 1) + (typeof value === 'number' ? numberCell(`E${row}`, value, formula) : textCell(`E${row}`, value))) }
  addRow(1, textCell('A1', 'Fuji Horse Show 精算書', 3), 32); merges.push('A1:I1')
  addRow(2, textCell('A2', `${document.organization} 御中`, 1)); merges.push('A2:G2'); addRow(3, textCell('A3', `発行日：${document.issuedDate}`)); merges.push('A3:I3')
  label(5, '事前エントリー合計', document.normalTotal)
  label(6, '事前エントリー入金済み', document.advancePaid)
  label(7, '事前入金の確認状況', document.advanceRecorded ? (document.advancePaid >= document.normalTotal ? '支払い済み' : '一部入金／不足あり') : '未登録・要確認')
  if (document.selection) label(8, '今回選択分の事前エントリー残額', document.selection.includeNormal ? Math.max(0, document.normalTotal - document.advancePaid) : 0, document.selection.includeNormal ? 'MAX(0,E5-E6)' : '0')
  const header = ['区分', '競技', '選手', '馬', '備考', '競技料金', '手数料', '差額', '合計']
  addRow(9, header.map((value, index) => textCell(`${String.fromCharCode(65 + index)}9`, value, 1)).join(''))
  document.lines.forEach((line, index) => {
    const row = 10 + index
    addRow(row, [line.action, line.competition, line.rider, line.horse, line.action.startsWith('棄権') ? '' : line.note].map((value, col) => textCell(`${String.fromCharCode(65 + col)}${row}`, value)).join('') + numberCell(`F${row}`, line.entryFee) + numberCell(`G${row}`, line.serviceFee) + numberCell(`H${row}`, line.difference) + numberCell(`I${row}`, line.amount, `SUM(F${row}:H${row})`) + (document.selection ? numberCell(`J${row}`, line.paid) : ''), 32)
  })
  let row = 10 + document.lines.length
  const totalRow = row, paidRow = row + 1, dueRow = row + 2
  label(totalRow, '締切後・大会期間中 合計', document.extraTotal, document.lines.length ? `SUM(I10:I${row - 1})` : '0')
  label(paidRow, '締切後・大会期間中 入金済み', document.extraPaid, document.selection ? document.lines.length ? `SUM(J10:J${row - 1})` : '0' : undefined)
  label(dueRow, document.selection ? '今回選択分のお支払額' : '差引不足額（マイナスは過入金）', document.due, document.selection ? ['E8', ...document.lines.map((_, index) => `MAX(0,I${10 + index}-J${10 + index})`)].join('+') : `E5-E6+E${totalRow}-E${paidRow}`)
  label(row + 4, '不足額の支払方法', document.method)
  label(row + 5, '振込先', document.bankDetails || '—')
  rows[rows.length - 1] = rows[rows.length - 1].replace('ht="25"', 'ht="65"')
  row += 7
  addRow(row + 1, textCell(`A${row + 1}`, 'Excelで編集した内容はアプリには自動反映されません。')); merges.push(`A${row + 1}:I${row + 1}`)
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr><sheetViews><sheetView workbookViewId="0" showGridLines="0"/></sheetViews><sheetFormatPr defaultRowHeight="25"/><cols><col min="1" max="1" width="10" customWidth="1"/><col min="2" max="2" width="35" customWidth="1"/><col min="3" max="4" width="24" customWidth="1"/><col min="5" max="5" width="32" customWidth="1"/><col min="6" max="9" width="12" customWidth="1"/>${document.selection ? '<col min="10" max="10" hidden="1" width="12" customWidth="1"/>' : ''}</cols><sheetData>${rows.join('')}</sheetData><mergeCells count="${merges.length}">${merges.map(ref => `<mergeCell ref="${ref}"/>`).join('')}</mergeCells><printOptions horizontalCentered="1"/><pageMargins left="0.3" right="0.3" top="0.4" bottom="0.4" header="0.2" footer="0.2"/><pageSetup paperSize="9" orientation="landscape" fitToWidth="1" fitToHeight="1"/></worksheet>`
  return zip({
    '[Content_Types].xml': '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>',
    '_rels/.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>',
    'xl/workbook.xml': '<?xml version="1.0"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="精算書" sheetId="1" r:id="rId1"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>',
    'xl/_rels/workbook.xml.rels': '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
    'xl/styles.xml': '<?xml version="1.0"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0&quot;円&quot;"/></numFmts><fonts count="2"><font><sz val="11"/><name val="Yu Gothic"/></font><font><b/><sz val="15"/><name val="Yu Gothic"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFDCEAF7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"/><right style="thin"/><top style="thin"/><bottom style="thin"/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="0" fontId="0" fillId="2" borderId="1" applyFill="1"><alignment vertical="center" wrapText="1"/></xf><xf numFmtId="164" fontId="0" fillId="0" borderId="1" applyNumberFormat="1"><alignment horizontal="right" vertical="center"/></xf><xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"><alignment vertical="center"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>',
    'xl/worksheets/sheet1.xml': sheet,
  })
}
export function downloadSettlementWorkbook(document: SettlementDocument) {
  const bytes = settlementWorkbook(document)
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
  const url = URL.createObjectURL(blob), link = window.document.createElement('a')
  link.href = url; link.download = `精算書_${document.organization.replace(/[\\/:*?"<>|]/g, '_')}_${document.issuedDate.replace(/\//g, '-')}.xlsx`; link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
