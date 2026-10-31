import type { StableGroup } from './stable-information'
import type { InputSheet } from './xlsx-input'
import type { Origin } from './application'

export const stableBarns = ['S', ...Array.from({length:10},(_,i)=>String(i+1))]
export type StallRequest = {
  imports: {digest:string;text:string;source:string}[]
  manual:string; barn:string; neighborId:string; relation:''|'near'|'adjacent'|'same'|'avoid'
  reason:string; corridor:boolean; confirmed:boolean
}
export const emptyStallRequest = ():StallRequest => ({imports:[],manual:'',barn:'',neighborId:'',relation:'',reason:'',corridor:false,confirmed:false})
export function readStallRequest(input:unknown):StallRequest {
  const v=input as StallRequest
  const fail=()=>{throw new Error('厩舎割要望の保存形式を確認してください。')}
  if(!v||Object.keys(v).length!==8||!Array.isArray(v.imports)||v.imports.length>50||typeof v.manual!=='string'||v.manual.length>4000||typeof v.reason!=='string'||v.reason.length>1000||typeof v.barn!=='string'||v.barn&&!stableBarns.includes(v.barn)||typeof v.neighborId!=='string'||v.neighborId.length>100||!['','near','adjacent','same','avoid'].includes(v.relation)||typeof v.corridor!=='boolean'||typeof v.confirmed!=='boolean')return fail()
  for(const i of v.imports)if(!i||Object.keys(i).length!==3||typeof i.digest!=='string'||! /^[0-9a-f]{64}$/.test(i.digest)||typeof i.text!=='string'||!i.text.trim()||i.text.length>4000||typeof i.source!=='string'||i.source.length>1000)return fail()
  if(new Set(v.imports.map(i=>i.digest)).size!==v.imports.length)return fail()
  return {imports:v.imports.map(i=>({digest:i.digest,text:i.text,source:i.source})),manual:v.manual,barn:v.barn,neighborId:v.neighborId,relation:v.relation,reason:v.reason,corridor:v.corridor,confirmed:v.confirmed}
}
export const stallRequestText=(v:StallRequest)=>[...v.imports.map(i=>i.text),v.manual].filter(Boolean).join('\n')
/** Append a new original, never replace a manual correction or erase it on blank import. */
export function mergeStallImport(saved:StallRequest, incoming:{digest:string;text:string;source:string}):StallRequest {
  const next=readStallRequest(saved)
  if(!incoming.text.trim())return next
  const prior=next.imports.find(i=>i.digest===incoming.digest)
  if(prior){if(prior.text!==incoming.text)throw new Error('同じExcel原本の要望が保存済みの内容と異なります。');return next}
  next.imports.push(incoming);next.confirmed=false
  return readStallRequest(next)
}
const norm=(s:string)=>s.normalize('NFKC').replace(/\s/g,'')
/** Conservative suggestions only. Negation, multiple barns, unresolved names remain review items. */
export function suggestStallRequest(v:StallRequest,groups:Pick<StableGroup,'id'|'name'>[],selfId:string) {
  const raw=stallRequestText(v),text=norm(raw),issues:string[]=[]
  const barns=[...new Set([...text.matchAll(/(?:第)?(10|[1-9]|S)(?:番)?厩舎/gi)].map(m=>m[1].toUpperCase()))]
  let barn='',neighborId='',relation:StallRequest['relation']=''
  if(barns.length===1&&!/(?:厩舎.{0,8}(?:以外|避け|嫌|不可|ない))/.test(text))barn=barns[0]
  else if(barns.length)issues.push('厩舎の指定が複数、または否定を含みます。希望厩舎を選んでください。')
  const neighbor=/(?:横|隣|近く|近接|同じ厩舎|離し|離れ|避け)/.test(text)
  if(neighbor){
    const matches=groups.filter(g=>g.id!==selfId&&norm(g.name)&&text.includes(norm(g.name)))
    if(matches.length===1){neighborId=matches[0].id;relation=/(?:離し|離れ|避け)/.test(text)?'avoid':/同じ厩舎/.test(text)?'same':/(?:横|隣)/.test(text)?'adjacent':'near'}
    else issues.push('近接・離す相手を一意に照合できません。略称を推測せず団体を選んでください。')
  }
  if(raw&&!barn&&!neighborId&&!issues.length)issues.push('文章だけでは配置条件を確定できません。条件または運営上の判断を入力してください。')
  return {barn,neighborId,relation,issues}
}
export function stallRequestConditions(v:StallRequest,groups:Pick<StableGroup,'id'|'name'>[],selfId:string){
  const guessed=suggestStallRequest(v,groups,selfId)
  const result={barn:v.confirmed?v.barn:v.barn||guessed.barn,neighborId:v.confirmed?v.neighborId:v.neighborId||guessed.neighborId,relation:v.confirmed?v.relation:v.relation||guessed.relation,issues:v.confirmed?[]:[...guessed.issues]}
  if(stallRequestText(v)&&v.confirmed&&!v.barn&&!v.neighborId&&!v.reason.trim())result.issues.push('配置条件を指定しない場合は、運営上の判断を理由に記載してください。')
  if(stallRequestText(v)&&!v.confirmed)result.issues.push('要望の原文と配置条件が未確認です。')
  if(!!result.neighborId!==!!result.relation||result.neighborId&&(result.neighborId===selfId||!groups.some(g=>g.id===result.neighborId)))result.issues.push('相手団体と位置関係を確認してください。')
  return result
}
/** Read labeled request blocks, including merged cells (only the anchor has text).
 * Never execute workbook formulas or infer a request from unrelated notes. */
export function extractStallRequest(sheets:InputSheet[]):{stallRequest:string;stallRequestOrigins:Origin[]} {
  const origins:Origin[]=[],seen=new Set<string>()
  for(const sheet of sheets){
    const entries=Object.entries(sheet.cells)
    for(const [address,cell] of entries){
      const label=norm(cell.value).replace(/[：:]/g,'')
      if(!/^(?:ご)?(?:要望|要望欄|ご要望欄|厩舎割要望|厩舎割の要望|厩舎に関する要望|厩舎希望|希望厩舎|その他の要望)$/.test(label))continue
      const row=Number(address.match(/\d+$/)![0]),col=address.replace(/\d/g,'')
      const colNumber=(s:string)=>[...s].reduce((n,c)=>n*26+c.charCodeAt(0)-64,0)
      const candidates=entries.filter(([a,c])=>c.value.trim()&&Number(a.match(/\d+$/)![0])===row&&colNumber(a.replace(/\d/g,''))>colNumber(col))
      // A block below the label is accepted only until the next labeled/nonblank row;
      // following rows are not swept into a request by guessing a whole sheet region.
      const below=entries.filter(([a,c])=>c.value.trim()&&Number(a.match(/\d+$/)![0])===row+1&&colNumber(a.replace(/\d/g,''))>=colNumber(col))
      for(const [a,c] of candidates.length?candidates:below){
        if(/^(?:入厩予定日|退厩予定日|団体名|申込日|合計|振込先|担当者|電話番号|住所|メールアドレス)[：:：]?$/.test(norm(c.value)))continue
        const key=sheet.name+'!'+a;if(seen.has(key))continue;seen.add(key)
        origins.push({sheet:sheet.name,cell:a,value:c.value,...(c.formula?{formula:c.formula}:{})})
      }
    }
  }
  const text=origins.map(o=>o.value).join('\n')
  if(text.length>4000)throw new Error('厩舎割要望が4,000文字を超えています。原本を確認してください。')
  return {stallRequest:text,stallRequestOrigins:origins}
}
