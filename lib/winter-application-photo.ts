import type {Application,ApplicationPerson,Origin} from './master/application'
import {type ApplicationPhotoPage,PHOTO_MODEL,photoApplicationDigest} from './master/application-photo'
import {WINTER_EVENT_ID} from './winter-event'
import {stableScheduleKeys} from './master/stable-schedule'

const text={type:'string'}
const object=(properties:Record<string,unknown>)=>({type:'object',properties,required:Object.keys(properties),additionalProperties:false})
const position={page:{type:'integer',minimum:1,maximum:6},location:text}
const person=object({...position,name:text,reading:text,jef:text,grade:text,sportsMember:text,instructorMember:text,qualified:text})
export const PHOTO_EXTRACTION_SCHEMA=object({multipleOrganizations:{type:'boolean'},eventName:text,club:text,summaryPage:{type:'integer',minimum:1,maximum:6},
 riders:{type:'array',items:person,maxItems:30},horses:{type:'array',items:person,maxItems:20},
 entries:{type:'array',maxItems:600,items:object({...position,competition:text,rider:text,horse:text,op:{type:'string',enum:['あり','なし','不明']}})},
 amounts:object({horse:text,jump:text,dressage:text,total:text}),stable:object(Object.fromEntries(stableScheduleKeys.map(k=>[k,text]))),stallRequest:text,warnings:{type:'array',items:text,maxItems:100}})
const fail=()=>new Error('写真の読み取り結果が不完全です。写真を確認して読み直してください')
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw fail();return v as Record<string,unknown>}
const str=(v:unknown,max=100)=>{if(typeof v!=='string'||v.length>max)throw fail();return v.trim()}
const list=(v:unknown,max:number)=>{if(!Array.isArray(v)||v.length>max)throw fail();return v}
const cleanNumber=(v:string)=>v.normalize('NFKC').replace(/[,，円\s]/g,'')
const norm=(v:string)=>v.normalize('NFKC').replace(/\s/g,'')
/** Model output is evidence only. IDs, event and exact roster mappings are generated here. */
export async function applicationFromPhotos(input:unknown,pages:ApplicationPhotoPage[]):Promise<Application>{
 const v=obj(input)
 if(typeof v.multipleOrganizations!=='boolean')throw fail()
 if(v.multipleOrganizations)throw new Error('複数の団体の写真が混ざっています。1団体ずつ選び直してください')
 const eventName=str(v.eventName,300),warnings=list(v.warnings,100).map(w=>str(w,1000))
 if(/(?:20\d{2})/.test(eventName)&&!eventName.includes('2026')||/Autumn|Summer|Spring|秋大会|夏大会|春大会/i.test(eventName))throw new Error('写真に別の大会名があります。2026 Winterの申込書を選んでください')
 const page=(n:unknown)=>{if(!Number.isInteger(n)||Number(n)<1||Number(n)>pages.length)throw fail();return Number(n)}
 const origin=(p:number,location:string,value:string,row=1):Origin=>({sheet:`写真${p}`,cell:`A${row}`,value,location:`${p}枚目・${location}`})
 const summary=page(v.summaryPage),amounts=obj(v.amounts),stable=obj(v.stable),club=str(v.club)
 const app:Application={fileName:`写真申込書（${pages.length}枚）`,digest:await photoApplicationDigest(pages,WINTER_EVENT_ID),eventId:WINTER_EVENT_ID,club,clubOrigin:origin(summary,'団体名',club),people:[],entries:[],amounts:{horse:'',jump:'',dressage:'',total:''},amountOrigins:{},issues:[],sheets:pages.map((_,i)=>`写真${i+1}`),
  photo:{version:1,pages:pages.map(({name,digest})=>({name,digest})),eventName,warnings,model:PHOTO_MODEL},stable:{arrivalDate:'',arrivalTime:'',departureDate:'',departureTime:'',notes:''},stallRequest:str(v.stallRequest,4000)}
 for(const key of ['horse','jump','dressage','total'] as const){const raw=str(amounts[key]);app.amounts[key]=cleanNumber(raw);app.amountOrigins[key]=origin(summary,`金額（${{horse:'馬匹登録料',jump:'障害',dressage:'馬場',total:'合計'}[key]}）`,raw)}
 for(const key of stableScheduleKeys)app.stable![key]=str(stable[key],key==='notes'?1000:200)
 app.stableOrigins={arrival:[origin(summary,'入厩予定',`${app.stable!.arrivalDate} ${app.stable!.arrivalTime}`)],departure:[origin(summary,'退厩予定',`${app.stable!.departureDate} ${app.stable!.departureTime}`)],notes:[origin(summary,'入退厩時間要望',app.stable!.notes)]}
 app.stallRequestOrigins=[origin(summary,'馬房要望欄',app.stallRequest!)]
 for(const kind of ['rider','horse'] as const){
  const items=list(v[kind==='rider'?'riders':'horses'],kind==='rider'?30:20)
  for(const [i,item] of items.entries()){
   const p=obj(item),where=origin(page(p.page),str(p.location,200),str(p.name),i+1),name=str(p.name)
   const row:ApplicationPerson={key:`${kind[0]}${i+1}`,kind,name,reading:str(p.reading),jef:cleanNumber(str(p.jef)),grade:kind==='rider'?str(p.grade).normalize('NFKC').replace(/級/g,''):'',...(kind==='horse'?{horseGrade:str(p.grade)}:{}),sportsMember:kind==='rider'?str(p.sportsMember):'',instructorMember:kind==='rider'?str(p.instructorMember):'',qualified:false,checked:false,origin:where,credentialOrigin:{...where,value:str(p.grade)}}
   if(kind==='rider'&&str(p.qualified))warnings.push(`${where.location}：指導者資格の記載「${str(p.qualified)}」を確認してください。資格確認は自動で付けていません。`)
   app.people.push(row)
  }
 }
 const match=(kind:ApplicationPerson['kind'],name:string)=>{const found=app.people.filter(p=>p.kind===kind&&name&&norm(p.name)===norm(name));return found.length===1?found[0].key:''}
 for(const [i,item] of list(v.entries,600).entries()){
  const e=obj(item),op=str(e.op),rawRider=str(e.rider),rawHorse=str(e.horse),competition=str(e.competition,20).normalize('NFKC').replace(/^第|競技$/g,'')
  if(!['あり','なし','不明'].includes(op))throw fail()
  const where=origin(page(e.page),str(e.location,200),`${competition} / ${rawRider} / ${rawHorse} / OP:${op}`,i+1)
  if(op==='不明')warnings.push(`${where.location}：OPの有無を読み取れません。出番のOP欄を確認してください。`)
  app.entries.push({key:`photo-entry-${i+1}`,competition,rider:match('rider',rawRider),horse:match('horse',rawHorse),op:op==='あり',rawRider,rawHorse,origin:where})
 }
 if(!app.people.length&&!app.entries.length)throw new Error('申込書の人馬・出番を読み取れませんでした。文字が鮮明な写真を選んでください')
 if(!/2026.*Winter/i.test(eventName))warnings.push('大会名を十分に読み取れていません。2026 Winterの申込書であることを原本で確認してください。')
 app.photo!.warnings=[...new Set(warnings)].slice(0,100)
 return app
}
