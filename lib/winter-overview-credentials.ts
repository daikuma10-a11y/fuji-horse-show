import type {loadWinterData} from './winter-data'
import type {RegistrationOverviewCredential} from './master/registration-overview'
import {assertWinterEvent} from './winter-event'

type Data=Awaited<ReturnType<typeof loadWinterData>>
export type OverviewCredentials=Record<string,RegistrationOverviewCredential>
const url='https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/'
const key='sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95'
const uuid=(s:unknown):s is string=>typeof s==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)
const number=(s:string|null)=>s?.normalize('NFKC').trim()??''
const text=(v:unknown)=>typeof v==='string'?v.normalize('NFKC').trim():''
const grade=(v:unknown)=>{const s=text(v);return !s||/^[-‐―ー—–]+$/.test(s)?'':s}
const riderGrade=(s:string)=>s.replace(/^([ABC])(?:級)?(\([A-Z]+\))?$/,(_all,level,suffix)=>`${level}級${suffix??''}`)
const missing=(source:string):RegistrationOverviewCredential=>({value:'未確認',source,needsReview:true})

/** GET only, bounded to registered identities; no complete JEF roster or raw master data. */
async function read(table:string,select:string,column:string,ids:string[],order:string,token:string,signal?:AbortSignal){
 const out:Record<string,unknown>[]=[]
 for(let at=0;at<ids.length;at+=80){
  const batch=ids.slice(at,at+80)
  for(let offset=0;;offset+=500){
   const query=new URLSearchParams({select,[column]:`in.(${batch.join(',')})`,order,limit:'500',offset:String(offset)})
   const response=await fetch(url+table+'?'+query,{method:'GET',cache:'no-store',signal:AbortSignal.any([...(signal?[signal]:[]),AbortSignal.timeout(15000)]),headers:{apikey:key,Authorization:`Bearer ${token}`}}).catch(()=>{throw new Error('資格級・グレード宣言を取得できません。接続を確認し、「最新の情報を確認」で再読込してください。')})
   if(!response.ok)throw new Error('資格級・グレード宣言を取得できません。「最新の情報を確認」で再読込してください。')
   const page:unknown=await response.json()
   if(!Array.isArray(page)||page.some(r=>!r||typeof r!=='object'||!batch.includes(r[column])))throw new Error('資格・グレードの対応を確認できません')
   out.push(...page);if(page.length<500)break
  }
 }
 return out
}

function latest(rows:Record<string,unknown>[],idColumn:string,gradeColumn:string){
 const grouped=new Map<string,Record<string,unknown>[]>()
 for(const row of rows){
  if(typeof row.import_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(row.import_date)||!(row[gradeColumn]===null||typeof row[gradeColumn]==='string'))throw new Error('資格・グレードの保存形式を確認できません')
  const id=String(row[idColumn]);grouped.set(id,[...(grouped.get(id)??[]),row])
 }
 return new Map([...grouped].map(([id,records])=>{
  const date=records.map(r=>String(r.import_date)).sort().at(-1)!
  const values=[...new Set(records.filter(r=>r.import_date===date).map(r=>grade(r[gradeColumn])))]
  return [id,values.length!==1?missing('同日のマスター記録が不一致'):values[0]?{value:gradeColumn==='rider_grade'?riderGrade(values[0]):values[0],source:`日馬連マスター（${date}取得）`,needsReview:false}:missing(`日馬連マスターの記載なし（${date}取得）`)]
 }))
}

export async function loadWinterOverviewCredentials(data:Data,token:string,signal?:AbortSignal):Promise<OverviewCredentials>{
 assertWinterEvent(data.eventId)
 if(!token)throw new Error('本部ログインが必要です')
 for(const row of [...data.riders,...data.horses]){assertWinterEvent(row.event_id);if(!uuid(row.id))throw new Error('人馬IDを確認できません')}
 const numbers=(values:(string|null)[])=>[...new Set(values.map(number).filter(n=>/^\d{1,100}$/.test(n)))]
 const [riderRows,horseRows]=await Promise.all([
  read('jef_rider_master','id,member_no,rider_grade,import_date','member_no',numbers(data.riders.map(r=>r.jef_member_no)),'member_no.asc,import_date.desc,id.asc',token,signal),
  read('jef_horse_master','id,registration_no,grade,import_date','registration_no',numbers(data.horses.map(h=>h.jef_registration_no)),'registration_no.asc,import_date.desc,id.asc',token,signal),
 ])
 const riders=latest(riderRows,'member_no','rider_grade'),horses=latest(horseRows,'registration_no','grade'),result:OverviewCredentials={}
 for(const row of [...data.riders,...data.horses]){
  const rider='jef_member_no' in row,n=number(rider?row.jef_member_no:row.jef_registration_no)
  result[row.id]=(rider?riders:horses).get(n)??missing(n?'保存済みマスターに記録なし':'日馬連番号なし')
 }
 // A historical rider grade is useful only with an explicit Winter identity bridge.
 // Never infer a current grade or a horse declaration from entry eligibility/name.
 const fallback=data.riders.filter(r=>!riders.has(number(r.jef_member_no)))
 const bindings=await read('fhs_winter_reception_roster','rider_id,entity_id','rider_id',fallback.map(r=>r.id),'rider_id.asc',token,signal)
 if(bindings.some(b=>!uuid(b.entity_id))||new Set(bindings.map(b=>b.rider_id)).size!==bindings.length)throw new Error('資格記録と選手の対応を確認できません')
 const sources=await read('fhs_roster_entities','id,kind,source_reference','id',[...new Set(bindings.map(b=>String(b.entity_id)))],'id.asc',token,signal)
 const byId=new Map(sources.map(row=>[row.id,row]))
 for(const binding of bindings){
  const source=byId.get(binding.entity_id)
  if(!source||source.kind!=='rider')throw new Error('資格記録の選手を確認できません')
  let refs:unknown;try{refs=JSON.parse(String(source.source_reference))}catch{continue}
  if(!Array.isArray(refs))continue
  const values=[...new Set(refs.filter(r=>r&&r.source==='autumn_player').map(r=>grade(r.grade)).filter(Boolean))]
  if(values.length===1)result[String(binding.rider_id)]={value:riderGrade(values[0]),source:'過去原本（Autumn・要確認）',needsReview:true}
  if(values.length>1)result[String(binding.rider_id)]=missing('過去原本の資格級が不一致')
 }
 return result
}
