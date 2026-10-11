import { WINTER_EVENT_ID, winterCompetition, winterEntryPrice } from './winter-event'

export type ImportSource = { roster: string; entries: string; accounts: string }
export type ImportIssue = { section: string; row: number; severity: 'error' | 'warning'; message: string }
export type ImportPerson = { row: number; kind: string; id: string; org: string; name: string; reading: string; jef: string; checked: boolean; grade: string; sportsMember: string; instructorMember: string; qualified: boolean }
export type ImportEntry = { competition: string; order: number; rider: string; horse: string; op: boolean; price: number | null }
export type ImportAccount = { org: string; total: number; paid: number; confirmed: boolean; outstanding: number }
export const IMPORT_HEADERS = {
  roster: ['種別','識別番号','団体番号','名前','ふりがな','日馬連番号','日馬連確認','騎乗者資格','乗馬協会会員','指導者協会会員','指導者資格確認'],
  entries: ['競技番号','出番','選手番号','馬番号','OP'],
  accounts: ['団体番号','事前申込合計','入金額','原本確認'],
} as const
const YES = new Set(['はい','確認済','1','true'])
const NO = new Set(['いいえ','未確認','0','false'])

/** CSVの引用符・改行、Excelのタブ区切りを扱う。列不足や不正な引用符を黙って補正しない。 */
export function parseImportTable(text: string): string[][] {
  if (text.length > 2_000_000) throw new Error('資料は200万文字以内に分けてください')
  text = text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
  if (!text.trim()) return []
  const delimiter = text.slice(0, text.indexOf('\n') < 0 ? undefined : text.indexOf('\n')).includes('\t') ? '\t' : ','
  const rows: string[][] = [], row: string[] = []
  let cell = '', quoted = false, closed = false
  const pushRow = () => { row.push(cell.trim()); if (row.some(value => value !== '')) rows.push([...row]); row.length = 0; cell = ''; closed = false }
  for (let i = 0; i < text.length; i++) {
    const char = text[i]
    if (quoted) {
      if (char === '"') { if (text[i + 1] === '"') { cell += '"'; i++ } else { quoted = false; closed = true } }
      else cell += char
    } else if (char === delimiter) { row.push(cell.trim()); cell = ''; closed = false }
    else if (char === '\n') pushRow()
    else if (char === '"') { if (cell || closed) throw new Error('引用符の位置を確認してください'); quoted = true }
    else { if (closed && char.trim()) throw new Error('引用符の後には区切り文字が必要です'); if (!closed) cell += char }
  }
  if (quoted) throw new Error('閉じていない引用符があります')
  pushRow()
  if (rows.length > 5001) throw new Error('1つの資料は5,000行以内に分けてください')
  return rows
}

export function reviewWinterImport(source: ImportSource) {
  const issues: ImportIssue[] = [], people: ImportPerson[] = [], entries: ImportEntry[] = [], accounts: ImportAccount[] = []
  const issue = (section: string, row: number, message: string, severity: ImportIssue['severity'] = 'error') => issues.push({ section, row, message, severity })
  function table(kind: keyof ImportSource, title: string) {
    try {
      const rows = parseImportTable(source[kind]); if (!rows.length) return []
      const headers: readonly string[] = IMPORT_HEADERS[kind]
      if (rows[0].length !== headers.length || rows[0].some((value, index) => value !== headers[index])) { issue(title, 1, `見出しを雛形と同じ順番にしてください：${headers.join('／')}`); return [] }
      return rows.slice(1).flatMap((values, index) => {
        const row = index + 2
        if (values.length !== headers.length) { issue(title, row, `列数が違います（必要 ${headers.length}列／実際 ${values.length}列）`); return [] }
        return [{ values, row }]
      })
    } catch (error) { issue(title, 0, error instanceof Error ? error.message : '読み取れません'); return [] }
  }
  function flag(value: string, section: string, row: number, label: string, allowBlank = true) {
    if (YES.has(value)) return true
    if (NO.has(value) || (allowBlank && !value)) return false
    issue(section, row, `${label}は「はい／いいえ」で入力してください`); return false
  }
  function membership(value: string, row: number, label: string) {
    if (value && !['会員','非会員'].includes(value)) issue('名簿', row, `${label}は「会員／非会員／空欄」です`)
    return value
  }
  for (const { values: v, row } of table('roster', '名簿')) {
    const [kind,id,org,name,reading,jef,checked,grade,sportsMember,instructorMember,qualified] = v
    if (!['団体','選手','馬'].includes(kind)) issue('名簿', row, '種別は「団体／選手／馬」です')
    if (!id || !name) issue('名簿', row, '識別番号と名前が必要です')
    if ([id,org,name,reading,jef].some(value => value.length > 100)) issue('名簿', row, '番号・名前・ふりがなは100文字以内です')
    if (kind === '団体' && [org,jef,checked,grade,sportsMember,instructorMember,qualified].some(Boolean)) issue('名簿', row, '団体行は所属番号・資格・会員区分を空欄にしてください')
    if (kind !== '団体' && !org) issue('名簿', row, '選手と馬には所属団体番号が必要です')
    if (kind === '馬' && [grade,sportsMember,instructorMember,qualified].some(Boolean)) issue('名簿', row, '馬の行に選手の資格・会員区分は入力しません')
    if (grade && !['A','B','C','未登録'].includes(grade)) issue('名簿', row, '騎乗者資格は「A／B／C／未登録」です')
    const p = { row,kind,id,org,name,reading,jef,grade,checked:flag(checked,'名簿',row,'日馬連確認'),sportsMember:membership(sportsMember,row,'乗馬協会会員'),instructorMember:membership(instructorMember,row,'指導者協会会員'),qualified:flag(qualified,'名簿',row,'指導者資格確認') }
    if (p.checked && !jef) issue('名簿', row, '日馬連確認済みですが登録番号がありません')
    if (!reading && kind !== '団体') issue('名簿', row, '放送用のふりがなが未登録です。読みを推測して補いません', 'warning')
    people.push(p)
  }
  const keys = new Set<string>(), names = new Set<string>(), jefs = new Set<string>()
  people.forEach((p,index) => {
    for (const [key,set,label] of [[`${p.kind}:${p.id}`,keys,'識別番号'],[`${p.kind}:${p.org}:${p.name.normalize('NFKC').replace(/\s/g,'')}`,names,'同一所属の名前'],...(p.jef ? [[`${p.kind}:${p.jef}`,jefs,'日馬連番号']] : [])] as [string,Set<string>,string][]) {
      if (set.has(key)) issue('名簿', p.row, `${label}が重複しています：${p.name}。自動で同一人馬に統合しません`); set.add(key)
    }
  })
  const orgs = new Map(people.filter(p=>p.kind==='団体').map(p=>[p.id,p])), riders = new Map(people.filter(p=>p.kind==='選手').map(p=>[p.id,p])), horses = new Map(people.filter(p=>p.kind==='馬').map(p=>[p.id,p]))
  people.forEach(p=>{ if(p.kind!=='団体'&&!orgs.has(p.org))issue('名簿',p.row,`所属団体番号 ${p.org} が団体行にありません`) })
  const starts = new Set<string>(), combinations = new Set<string>()
  for (const { values: v, row } of table('entries', '出番表')) {
    const [competition,orderText,rider,horse,opText] = v
    const order = /^\d+$/.test(orderText) ? Number(orderText) : NaN
    if (!Number.isSafeInteger(order) || order < 1) issue('出番表',row,'出番は1以上の整数です')
    const op = flag(opText,'出番表',row,'OP',false), r = riders.get(rider), h = horses.get(horse)
    if (!r) issue('出番表',row,`選手番号 ${rider || '（空欄）'} が名簿にありません`)
    if (!h) issue('出番表',row,`馬番号 ${horse || '（空欄）'} が名簿にありません`)
    const start = `${competition}:${order}`
    if(starts.has(start))issue('出番表',row,'同じ競技で出番が重複しています'); starts.add(start)
    const combination = `${competition}:${rider}:${horse}`
    if(combinations.has(combination)&&!op)issue('出番表',row,'同じ競技の同一人馬が重複しています。2回目以降のOPを確認してください'); combinations.add(combination)
    let price: number | null = null
    try {
      const c = winterCompetition(competition)
      if(c.official && (!r?.jef || !r.checked || !['A','B'].includes(r.grade) || !h?.jef || !h.checked)) issue('出番表',row,'公認競技は選手・馬の日馬連確認と選手のB級以上の資格が必要です。馬のグレード申請は原本で別途確認してください')
      const member = ['5','25'].includes(competition) ? r?.sportsMember : ['8','32'].includes(competition) ? r?.instructorMember : ''
      price = winterEntryPrice(c,{ isOp:op,membership:member==='会員'?'member':member==='非会員'?'nonmember':undefined,instructorConfirmed:r?.qualified })
    } catch(error) { issue('出番表',row,error instanceof Error?error.message:'料金を確認してください') }
    entries.push({competition,order,rider,horse,op,price})
  }
  for(const competition of new Set(entries.map(e=>e.competition))) {
    const orders=entries.filter(e=>e.competition===competition).map(e=>e.order).sort((a,b)=>a-b)
    if(orders.some((order,index)=>order!==index+1))issue('出番表',0,`第${competition}競技の出番が1からの連番になっていません。原本を確認してください`)
  }
  const accountOrgs = new Set<string>()
  function money(value:string,row:number,label:string) { if(!/^\d+$/.test(value)||!Number.isSafeInteger(Number(value))) { issue('事前精算',row,`${label}は0以上の整数です（円記号・カンマなし）`); return 0 } return Number(value) }
  for(const {values:v,row} of table('accounts','事前精算')) {
    const [org,totalText,paidText,confirmedText]=v
    const total=money(totalText,row,'事前申込合計'),paid=money(paidText,row,'入金額'),confirmed=flag(confirmedText,'事前精算',row,'原本確認',false)
    if(!orgs.has(org))issue('事前精算',row,`団体番号 ${org} が名簿にありません`)
    if(accountOrgs.has(org))issue('事前精算',row,'同じ団体の事前精算が重複しています');accountOrgs.add(org)
    if(!confirmed)issue('事前精算',row,'事前申込合計・入金額の原本確認が必要です')
    if(paid>total)issue('事前精算',row,'入金額が事前申込合計を超えています。過入金の確認が必要です')
    accounts.push({org,total,paid,confirmed,outstanding:total-paid})
  }
  for(const org of orgs.keys())if(!accountOrgs.has(org))issue('事前精算',0,`${orgs.get(org)?.name} の事前申込合計・入金額は未登録です。精算準備は完了していません`,'warning')
  const errors=issues.filter(i=>i.severity==='error')
  return { eventId:WINTER_EVENT_ID,people,entries,accounts,issues,
    rosterReady:orgs.size>0&&riders.size>0&&horses.size>0&&!errors.some(i=>i.section==='名簿'),
    entriesReady:entries.length>0&&people.length>0&&!errors.some(i=>i.section==='名簿'||i.section==='出番表'),
    accountsReady:orgs.size>0&&accounts.length===orgs.size&&!errors.some(i=>i.section==='名簿'||i.section==='事前精算'),
    entryFeeTotal:entries.every(e=>e.price!==null)?entries.reduce((sum,e)=>sum+(e.price??0),0):null,
    initialTotal:accounts.reduce((sum,a)=>sum+a.total,0),paidTotal:accounts.reduce((sum,a)=>sum+a.paid,0),
  }
}

export function readImportDraft(value: unknown): ImportSource {
  if(!value||typeof value!=='object')throw new Error('準備ファイルの形式が違います')
  const draft=value as Record<string,unknown>
  if(draft.eventId!==WINTER_EVENT_ID||draft.version!==1||draft.kind!=='winter-import-review')throw new Error('Winterの取込準備ファイルだけを開けます')
  const source=draft.source as Record<string,unknown>|undefined
  if(!source||['roster','entries','accounts'].some(key=>typeof source[key]!=='string'||(source[key] as string).length>2_000_000))throw new Error('元資料を読み取れません')
  return {roster:source.roster as string,entries:source.entries as string,accounts:source.accounts as string}
}

export const IMPORT_SAMPLE:ImportSource={
  roster:IMPORT_HEADERS.roster.join('\t')+'\n団体\tO01\t\t確認用クラブ\tかくにんようくらぶ\t\t\t\t\t\t\n選手\tR01\tO01\t確認用選手一\tかくにんようせんしゅいち\t\tいいえ\t未登録\t会員\t非会員\tはい\n選手\tR02\tO01\t確認用選手二\tかくにんようせんしゅに\t\tいいえ\t未登録\t非会員\t\tいいえ\n馬\tH01\tO01\t確認用馬一\tかくにんよううまいち\t\tいいえ\t\t\t\t\n馬\tH02\tO01\t確認用馬二\tかくにんよううまに\t\tいいえ\t\t\t\t',
  entries:IMPORT_HEADERS.entries.join('\t')+'\n5\t1\tR01\tH01\tいいえ\n5\t2\tR02\tH02\tいいえ',
  accounts:IMPORT_HEADERS.accounts.join('\t')+'\nO01\t43000\t43000\tはい',
}
