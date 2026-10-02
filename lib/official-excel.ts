import { unzipSync, zipSync, strFromU8, strToU8 } from 'fflate'

export type OfficialExcelEntry = { entry_id: string; competition_no: string; start_order: number; status: string; rider_name: string; jef_member_no: string | null; horse_name: string; jef_registration_no: string | null; organization_name: string; is_op: boolean | null }
const startSheets = ['1-70', '2-80', '3-90', '4-100', '5_中D', '6_MD', '7_中Ｃ', '8_MC', '9_中B', '10_中A']
const columns = ['A', 'B', 'C', 'D', 'E', 'F', 'G']
const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;')
const unescapeXml = (value: string) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&')
export const entryValues = (entry: OfficialExcelEntry): (string | number)[] => [ /^(wd|withdrawn)$/i.test(entry.status) ? 'WD' : entry.is_op ? 'OP' : '', entry.start_order, entry.rider_name, entry.jef_member_no ?? '', entry.horse_name, entry.jef_registration_no ?? '', entry.organization_name ]

function patchCells(xml: string, values: Map<string, string | number>, formulaCache: boolean) {
  const seen = new Set<string>()
  const result = xml.replace(/<c\b([^>]*\br="([A-Z]+\d+)"[^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g, (whole, attributes: string, address: string, body = '') => {
    if (!values.has(address)) return whole
    seen.add(address)
    const value = values.get(address)!, formula = body.match(/<f\b[^>]*(?:\/>|>[\s\S]*?<\/f>)/)?.[0] ?? ''
    if (formulaCache && !formula) throw new Error(`出番表の連動数式を確認できません：${address}`)
    const attrs = attributes.replace(/\s+t="[^"]*"/g, '')
    if (formulaCache) return `<c${attrs}${typeof value === 'number' ? '' : ' t="str"'}>${formula}<v>${escapeXml(String(value))}</v></c>`
    if (value === '') return `<c${attrs}/>`
    return typeof value === 'number' ? `<c${attrs}><v>${value}</v></c>` : `<c${attrs} t="inlineStr"><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`
  })
  const missing = [...values.keys()].filter(key => !seen.has(key) && values.get(key) !== '')
  if (missing.length) throw new Error('Excelの入力行が不足しています：' + missing.slice(0,10).join(','))
  return result
}

export function exportOfficialExcel(template: Uint8Array, entries: OfficialExcelEntry[], generatedAt = new Date()): Uint8Array {
  const files = unzipSync(template), workbook = strFromU8(files['xl/workbook.xml']), rels = strFromU8(files['xl/_rels/workbook.xml.rels'])
  const targets = new Map([...rels.matchAll(/<Relationship\b[^>]*\bId="([^"]+)"[^>]*\bTarget="([^"]+)"[^>]*\/>/g)].map(match => [match[1], 'xl/' + match[2]]))
  const sheets = [...workbook.matchAll(/<sheet\b[^>]*\bname="([^"]+)"[^>]*\br:id="([^"]+)"[^>]*\/>/g)].map(match => ({ name: unescapeXml(match[1]), path: targets.get(match[2])! }))
  const stringsXml = strFromU8(files['xl/sharedStrings.xml'])
  const sharedStrings = [...stringsXml.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)].map(match => [...match[1].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(part => unescapeXml(part[1])).join(''))
  let outputWorkbook = workbook
  if (!entries.length) throw new Error('正式出番表が空です。出力を中止しました。')
  for (let number = 1; number <= 10; number++) {
    const result = sheets.find(sheet => sheet.name === String(number)), start = sheets.find(sheet => sheet.name === startSheets[number - 1])
    if (!result?.path || !start?.path) throw new Error(`競技${number}の出番表・成績表がありません。`)
    const source = strFromU8(files[result.path]), startXml = strFromU8(files[start.path])
    // Never move a rider/horse onto another rider's entered scores.
    for (const match of source.matchAll(/<c\b[^>]*\br="([A-Z]+)(\d+)"[^>]*?(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      if (!match[3]) continue
      if (Number(match[2]) < 14 || !['H','I','K','L','N','O','Q','R','T'].includes(match[1]) || /<f\b/.test(match[3])) continue
      const raw = match[3].match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? match[3].match(/<t\b[^>]*>([\s\S]*?)<\/t>/)?.[1] ?? ''
      const value = /\bt="s"/.test(match[0].split('>')[0]) ? sharedStrings[Number(raw)] : raw
      if (value?.trim()) throw new Error(`競技${number}の成績欄に入力があります。成績保護のため出力を中止しました。`)
    }
    const rows = entries.filter(entry => Number(entry.competition_no) === number).sort((a,b) => a.start_order - b.start_order)
    if (rows.some(row => !row.rider_name?.trim() || !row.horse_name?.trim() || !row.organization_name?.trim())) throw new Error(`競技${number}の人馬・所属に未確認の情報があります。`)
    if (rows.some((row, index) => row.start_order !== index + 1)) throw new Error(`競技${number}の出番番号が連続していません。正式出番表を確認してください。`)
    const lastRow = Math.max(...[...startXml.matchAll(/<c\b[^>]*\br="C(\d+)"[^>]*>([\s\S]*?)<\/c>/g)].filter(match => Number(match[1]) >= 14 && /<f\b/.test(match[2])).map(match => Number(match[1])))
    if (!Number.isFinite(lastRow) || rows.length > lastRow - 13) throw new Error(`競技${number}はひな形の行数を超えています。`)
    const values = new Map<string, string | number>()
    for (let row = 14; row <= lastRow; row++) {
      const line = rows[row - 14] ? entryValues(rows[row - 14]) : columns.map(() => '')
      columns.forEach((column, index) => values.set(`${column}${row}`, line[index]))
    }
    files[result.path] = strToU8(patchCells(source, values, false))
    const version = new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(generatedAt) + '版'
    files[start.path] = strToU8(patchCells(patchCells(startXml, values, true), new Map([['G7', version]]), false))
    const startIndex = sheets.indexOf(start)
    outputWorkbook = outputWorkbook.replace(new RegExp(`(<definedName name="_xlnm.Print_Area" localSheetId="${startIndex}">)([^<]+)(</definedName>)`), (_, open, area: string, close) => `${open}${area.replace(/\$G\$(\d+)$/, (_: string, end: string) => `$G$${Math.max(Number(end), 13 + rows.length)}`)}${close}`)
  }
  outputWorkbook = outputWorkbook.replace(/<calcPr\b([^>]*?)\/>/, (_, attrs: string) => `<calcPr${attrs.replace(/\s+(?:fullCalcOnLoad|forceFullCalc)="[^"]*"/g, '')} fullCalcOnLoad="1" forceFullCalc="1"/>`)
  files['xl/workbook.xml'] = strToU8(outputWorkbook)
  return zipSync(files)
}
