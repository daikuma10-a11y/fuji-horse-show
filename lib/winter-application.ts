import {readInputXlsx,type InputBook,type InputSheet} from './master/xlsx-input'
import {IMPORT_HEADERS,reviewWinterImport,type ImportSource} from './winter-import-review'
import {WINTER_EVENT_ID} from './winter-event'
import {WINTER_HORSE_REGISTRATION_FEE} from './winter-horse-registration'
import type {SharedRoster} from './shared-roster'

import type {Origin,Application,ApplicationPerson} from './master/application'
export type {Origin,Application,ApplicationPerson,ApplicationEntry} from './master/application'
export const normalizeApplicationName=(s:string)=>s.normalize('NFKC').replace(/[\s　]/g,'').toLocaleLowerCase('ja')
const norm=normalizeApplicationName
const money=(s:string)=>/^\d+$/.test(s)&&Number.isSafeInteger(Number(s))?Number(s):null
function origin(s:InputSheet,cell:string):Origin{return {sheet:s.name,cell,value:s.cells[cell]?.value??'',...(s.cells[cell]?.formula?{formula:s.cells[cell].formula}:{})}}
function value(s:InputSheet,c:string){return s.cells[c]?.value.trim()??''}
function rows(s:InputSheet):number[]{return [...new Set(Object.keys(s.cells).map(c=>Number(c.replace(/[A-Z]/g,''))))].sort((a,b)=>a-b)}
/** The supplied 2026 Winter form, including collapsed blocks and copied entry sheets. */
export function extractWinterApplication(book:InputBook,fileName:string,digest:string):Application{
 const riders=book.sheets.filter(s=>value(s,'A2')==='選手名簿'),horses=book.sheets.filter(s=>value(s,'H1')==='馬匹名簿'),totals=book.sheets.filter(s=>/申込集計書/.test(value(s,'A2')))
 if(riders.length!==1||horses.length!==1||totals.length!==1)throw new Error('選手名簿・馬匹名簿・申込集計書を各1枚含む2026 Winter申込書を選んでください')
 const summary=totals[0]
 if(!/2026.*Winter.*Grand Prix/i.test(value(summary,'A1')))throw new Error('2026 Winter以外の申込書は取り込めません')
 const rs=riders[0],hs=horses[0],clubRow=rows(rs).find(r=>norm(value(rs,'C'+r))==='団体名')
 if(!clubRow)throw new Error('団体名の欄を確認できません')
 const app:Application={fileName,digest,eventId:WINTER_EVENT_ID,club:value(rs,'D'+clubRow),clubOrigin:origin(rs,'D'+clubRow),people:[],entries:[],amounts:{horse:value(summary,'F6'),jump:value(summary,'F7'),dressage:value(summary,'F8'),total:value(summary,'F10')},amountOrigins:{horse:origin(summary,'F6'),jump:origin(summary,'F7'),dressage:origin(summary,'F8'),total:origin(summary,'F10')},issues:[],sheets:[]}
 for(const [s,kind] of [[rs,'rider'],[hs,'horse']] as const){
  const rosterRows:number[]=rows(s).filter(row=>/^\d+$/.test(value(s,'A'+row))&&row<(s===rs?clubRow:68))
  for(const r of rosterRows){
   const cell='B'+(r+1),name=value(s,cell),reading=value(s,'B'+r),jef=value(s,(kind==='rider'?'D':'C')+r)
   if(!name){if(jef||reading&&!s.cells['B'+r]?.formula||s.cells[cell]?.formula)app.issues.push(`${s.name}!${cell}：名前のない入力欄があります。数式の場合は再計算して保存してください`);continue}
   app.people.push({key:kind[0]+value(s,'A'+r),kind,name,reading,jef,grade:kind==='rider'?value(s,'E'+r).normalize('NFKC').replace(/級/g,''):'',checked:false,sportsMember:'',instructorMember:'',qualified:false,origin:origin(s,cell)})
  }
 }
 if(app.people.filter(p=>p.kind==='rider').length>30||app.people.filter(p=>p.kind==='horse').length>20)app.issues.push('この様式の対応上限は選手30人・馬20頭です')
 function match(kind:ApplicationPerson['kind'],name:string){const found=app.people.filter(p=>p.kind===kind&&norm(p.name)===norm(name));return found.length===1?found[0].key:''}
 for(const s of book.sheets){
  const headers=rows(s).filter(r=>(norm(value(s,'E'+r))==='馬名'&&norm(value(s,'D'+r))==='種目')||norm(value(s,'D'+r))==='馬名')
  if(!headers.length)continue
  app.sheets.push(s.name)
  for(const [i,start] of headers.entries()){
   const jump=norm(value(s,'E'+start))==='馬名',cols=jump?['J','K','L','M','N']:['F','G','H','I','J'],end=headers[i+1]??Math.max(...rows(s))+1
   for(const r of rows(s).filter(r=>r>start&&r<end)){
    const competition=value(s,'C'+r)
    if(!/^(?:[①②③④]|[1-9]|[12]\d|3[0-6])$/.test(competition))continue
    for(const col of cols){
     const raw=value(s,col+r);if(!raw){if(s.cells[col+r]?.formula)app.issues.push(`${s.name}!${col+r}：数式の結果が空欄です。原本で確認してください`);continue}
     const rawHorse=value(s,col+start).replace(/\s*号\s*$/,'').trim()
     // Newlines separate riders. Spaces inside a Japanese name never split a person.
     for(const [line,part] of raw.split(/\r?\n/).filter(x=>x.trim()).entries()){
      const n=part.trim().normalize('NFKC'),op=/^\(.*\)$/.test(n),riderName=op?n.slice(1,-1).trim():part.trim()
      app.entries.push({key:`${s.name}!${col}${r}:${line}`,competition,rider:match('rider',riderName),horse:match('horse',rawHorse),op,rawRider:part.trim(),rawHorse,origin:origin(s,col+r)})
     }
    }
   }
  }
 }
 if(!app.sheets.length)throw new Error('障害・馬場のエントリー欄を確認できません')
 const duplicate=app.people.filter((p,i,all)=>all.findIndex(x=>x.key===p.key)!==i)
 if(duplicate.length)app.issues.push('名簿番号が重複しています。原本の番号を確認してください')
 for(const s of book.sheets)if(Object.values(s.cells).some(c=>c.error))app.issues.push(`${s.name}：Excelの数式エラーがあります。原本を修正・再保存してください`)
 return app
}
export async function readWinterApplication(bytes:Uint8Array,name:string){
 if(!/\.xlsx$/i.test(name))throw new Error('.xlsx形式の申込書を選んでください（.xls・PDF・マクロは対象外）')
 const digest=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes as BufferSource)),x=>x.toString(16).padStart(2,'0')).join('')
 return extractWinterApplication(readInputXlsx(bytes),name,digest)
}
const tsv=(rows:string[][])=>rows.map(r=>r.map(s=>/[\t\r\n"]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s).join('\t')).join('\n')
export function applicationSource(app:Application,paid:string,accountChecked:boolean):ImportSource{
 const roster:string[][]=[[...IMPORT_HEADERS.roster],['団体','ORG','',app.club,'','','','','','','']]
 for(const p of app.people)roster.push([p.kind==='rider'?'選手':'馬',p.key,'ORG',p.name,p.reading,p.jef,p.checked?'はい':'いいえ',p.grade,p.sportsMember,p.instructorMember,p.kind==='horse'?'':p.qualified?'はい':'いいえ'])
 const orders:Record<string,number>={},entries:string[][]=[[...IMPORT_HEADERS.entries]]
 for(const e of app.entries)entries.push([e.competition,String(orders[e.competition]=(orders[e.competition]??0)+1),e.rider,e.horse,e.op?'はい':'いいえ'])
 return {roster:tsv(roster),entries:tsv(entries),accounts:tsv([[...IMPORT_HEADERS.accounts],['ORG',app.amounts.total,paid,accountChecked?'はい':'いいえ']])}
}
export function applicationReview(app:Application,paid:string,checked:boolean){
 const report=reviewWinterImport(applicationSource(app,paid,checked)),jump=report.entries.filter(e=>!['15','16','17','18','32','33','34','35','36'].includes(e.competition)),dressage=report.entries.filter(e=>!jump.includes(e))
 const sum=(items:typeof jump)=>items.some(e=>e.price===null)?null:items.reduce((n,e)=>n+e.price!,0)
 const calculated={horse:app.people.filter(p=>p.kind==='horse').length*WINTER_HORSE_REGISTRATION_FEE,jump:sum(jump),dressage:sum(dressage),total:0 as number|null}
 calculated.total=calculated.jump===null||calculated.dressage===null?null:calculated.horse+calculated.jump+calculated.dressage
 const labels={horse:'馬匹登録料',jump:'障害エントリー料',dressage:'馬場エントリー料',total:'合計'}
 const amounts=(Object.keys(labels) as (keyof typeof labels)[]).map(key=>({key,label:labels[key],original:money(app.amounts[key]),calculated:calculated[key],reason:calculated[key]===null?'人馬・会員区分・資格・OPを確認してください':money(app.amounts[key])===null?'原本に保存された計算結果がありません。Excelで再計算・保存するか原本確認後に入力してください':money(app.amounts[key])!==calculated[key]?(key==='horse'?'名簿の馬数×既存の馬匹登録料と一致しません':'追加シート、人数、OP・会員区分、原本の数式を確認してください'):''}))
 return {report,amounts,ready:!app.issues.length&&report.entriesReady&&report.accountsReady&&amounts.every(a=>!a.reason)}
}
export function rosterCandidates(person:ApplicationPerson,data:SharedRoster,club:string){
 return data.entities.filter(e=>e.kind===person.kind&&!e.archived_at&&(person.jef&&person.jef===e.jef_number||norm(person.name)===norm(e.name)||person.reading&&norm(person.reading)===norm(e.reading))).map(entity=>({entity,reason:person.jef&&person.jef===entity.jef_number?'日馬連番号一致':norm(person.name)===norm(entity.name)?'氏名・馬名一致（空白・全半角を除く）':'読み一致',clubs:data.affiliations.filter(a=>a.entity_id===entity.id&&!a.ended_at).map(a=>data.clubs.find(c=>c.id===a.club_id)?.name??''),sameClub:data.affiliations.some(a=>a.entity_id===entity.id&&!a.ended_at&&data.clubs.some(c=>c.id===a.club_id&&c.name===club))})).sort((a,b)=>Number(b.sameClub)-Number(a.sameClub))
}
export function applicationDifferences(before:Application,after:Application){
 const differences:{location:string;before:string;after:string;kind:string}[]=[]
 function compare(label:string,a:unknown,b:unknown){if(JSON.stringify(a)!==JSON.stringify(b))differences.push({location:label,before:a===undefined?'（なし）':JSON.stringify(a),after:b===undefined?'（なし）':JSON.stringify(b),kind:a===undefined?'追加候補':b===undefined?'取消候補':'変更候補'})}
 compare('団体名',before.club,after.club)
 for(const section of ['people','entries'] as const){
  const a=new Map(before[section].map(p=>[p.key,p])),b=new Map(after[section].map(p=>[p.key,p]))
  for(const key of new Set([...a.keys(),...b.keys()])){
   const clean=(v:unknown)=>v?Object.fromEntries(Object.entries(v as Record<string,unknown>).filter(([k])=>k!=='origin')):undefined
   compare(section+': '+key,clean(a.get(key)),clean(b.get(key)))
  }
 }
 for(const key of ['horse','jump','dressage','total'] as const)compare(before.amountOrigins[key]?.sheet+'!'+before.amountOrigins[key]?.cell,before.amounts[key],after.amounts[key])
 return differences
}
