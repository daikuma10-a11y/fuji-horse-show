import type {Application,ApplicationEntry,ApplicationEntryCount,Origin} from './application'

export const entryCountKey=(row:ApplicationEntryCount,kind:string)=>`${row.key}:${kind}`
export const entryCountTarget=(key:string)=>`application-count-${encodeURIComponent(key)}`
const labels={regular:'通常参加',op:'OP参加',member:'会員',nonmember:'非会員'}
const count=(s:string)=>{const v=s.normalize('NFKC').trim();return v===''?0:/^\d+$/.test(v)&&Number.isSafeInteger(Number(v))&&Number(v)<=5000?Number(v):null}
export type ApplicationCountReview={key:string;competition:string;block:string;entryKeys:string[];names:string[];changed:boolean;buckets:{key:string;label:string;origin:Origin;value:string;actual:number|null;reason:string}[]}

/** Sort a view only: registration IDs and the fee indexes still use the source array. */
export function applicationEntriesByHorse(app:Application){
 const horses=new Map(app.people.filter(p=>p.kind==='horse').map((p,i)=>[p.key,i]))
 return app.entries.map((entry,sourceIndex)=>({entry,sourceIndex})).sort((a,b)=>(horses.get(a.entry.horse)??Infinity)-(horses.get(b.entry.horse)??Infinity)||a.sourceIndex-b.sourceIndex)
}

/** Explicit scope selection is needed when a manual row could belong to several pages. */
export function applicationEntryCountAssignments(app:Application){
 const rows=app.entryCounts??[],sourceBlocks=new Map(rows.flatMap(r=>r.entryKeys.map(key=>[key,r.block] as const)))
 const entries=new Map(app.entries.map(e=>[e.key,e]))
 const optionsByCompetition=new Map<string,{block:string;label:string;horseKeys:string[]}[]>()
 for(const row of rows){const options=optionsByCompetition.get(row.competition)??[];options.push({block:row.block,label:`${row.block} ／ ${row.horseKeys.map(key=>app.people.find(p=>p.key===key)?.name??'').join('・')||'馬名欄空欄'}`,horseKeys:row.horseKeys});optionsByCompetition.set(row.competition,options)}
 const assignments=new Map<string,{block?:string;options:{block:string;label:string}[];reason:string}>()
 function assign(entry:ApplicationEntry,seen=new Set<string>()):string|undefined{
  if(assignments.has(entry.key))return assignments.get(entry.key)!.block
  if(seen.has(entry.key))return undefined
  seen.add(entry.key)
  const options=optionsByCompetition.get(entry.competition)??[],source=entry.sourceKey?entries.get(entry.sourceKey):undefined
  const preferred=entry.countBlock||sourceBlocks.get(entry.key)||(source?assign(source,seen):undefined)
  const candidates=options.filter(o=>o.horseKeys.includes(entry.horse))
  const block=preferred?options.find(o=>o.block===preferred)?.block:candidates.length===1?candidates[0].block:options.length===1?options[0].block:undefined
  const reason=block||!rows.length?'':options.length?'この出番の「申込書の集計欄」を選んでください。同じ競技の欄が複数ある場合も、人数を別々に照合します。':'この競技に対応する原本の集計欄がありません。競技を確認してください。'
  assignments.set(entry.key,{block,options:options.map(({block,label})=>({block,label})),reason})
  return block
 }
 for(const entry of app.entries)assign(entry)
 return assignments
}

/** Compare each original sheet/block separately, so opposing count errors cannot cancel. */
export function reviewApplicationEntryCounts(app:Application):ApplicationCountReview[]{
 const rows=app.entryCounts??[],assignments=applicationEntryCountAssignments(app),people=new Map(app.people.map(p=>[p.key,p]))
 const grouped=new Map<string,ApplicationEntry[]>()
 for(const entry of app.entries){const b=assignments.get(entry.key)?.block;if(!b)continue;const key=JSON.stringify([b,entry.competition]),list=grouped.get(key)??[];list.push(entry);grouped.set(key,list)}
 return rows.map(row=>{
  const entries=grouped.get(JSON.stringify([row.block,row.competition]))??[]
  const buckets=row.buckets.map(bucket=>{
   const key=entryCountKey(row,bucket.kind),value=app.entryCountCorrections?.[key]??bucket.origin.value,declared=count(value)
   const unknown=row.membership&&entries.some(e=>!e.op&&!['会員','非会員'].includes(people.get(e.rider)?.[row.membership!]??''))
   const actual=(bucket.kind==='member'||bucket.kind==='nonmember')&&unknown?null:entries.filter(e=>bucket.kind==='op'?e.op:bucket.kind==='regular'?!e.op:!e.op&&people.get(e.rider)?.[row.membership!]===(bucket.kind==='member'?'会員':'非会員')).length
   const location=`${bucket.origin.sheet}!${bucket.origin.cell}・第${row.competition}競技 ${labels[bucket.kind]}`
   const reason=declared===null?`${location}：集計欄を0以上の整数で確認してください。`:actual===null?`${location}：選手の会員区分を確認してください。`:declared!==actual?`${location}：集計欄${declared}名に対して出場者${actual}名です。${actual===0?'人数だけが入力されています。':declared===0?'人数の入力漏れの可能性があります。':'出場者・OP区分・集計人数を確認してください。'}`:''
   return {key,label:labels[bucket.kind],origin:bucket.origin,value,actual,reason}
  })
  const changed=buckets.some(b=>app.entryCountCorrections?.[b.key]!==undefined)
  return {key:row.key,competition:row.competition,block:row.block,entryKeys:entries.map(e=>e.key),names:entries.map(e=>`${people.get(e.rider)?.name||e.rawRider||'選手未選択'} ／ ${people.get(e.horse)?.name||e.rawHorse||'馬未選択'}${e.op?'（OP）':''}`),changed,buckets}
 }).filter(row=>row.entryKeys.length||row.changed||row.buckets.some(b=>b.reason||count(b.value)!==0))
}
