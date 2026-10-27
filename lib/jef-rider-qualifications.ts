import type {JefRiderRecord} from './master/application-autofill'

const url='https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/jef_rider_master'
const key='sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95'
/** Read only the numbered riders on this application, using the verified administrator session. */
export async function loadJefRiderQualifications(numbers:string[],token:string):Promise<JefRiderRecord[]>{
 if(!token)throw new Error('本部ログインが必要です')
 const ids=[...new Set(numbers.map(n=>n.normalize('NFKC').trim()).filter(n=>/^\d{1,100}$/.test(n)))]
 if(ids.length>30)throw new Error('資格照合は申込書の選手30人以内です')
 if(!ids.length)return []
 const rows:JefRiderRecord[]=[]
 for(let offset=0;;offset+=500){
  const query=new URLSearchParams({select:'member_no,name,rider_grade,import_date',member_no:`in.(${ids.join(',')})`,order:'member_no.asc,import_date.desc,id.asc',limit:'500',offset:String(offset)})
  const response=await fetch(url+'?'+query,{method:'GET',cache:'no-store',signal:AbortSignal.timeout(15000),headers:{apikey:key,Authorization:`Bearer ${token}`}})
  if(!response.ok)throw new Error('日馬連の資格データを取得できません。「既存登録を再確認」で再読込するか、申込書の資格を確認してください。')
  const page:unknown=await response.json()
  if(!Array.isArray(page)||page.some(r=>!r||!ids.includes(r.member_no)||typeof r.name!=='string'||r.name.length>100||!(r.rider_grade===null||typeof r.rider_grade==='string'&&r.rider_grade.length<=100)||typeof r.import_date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(r.import_date)))throw new Error('日馬連資格データの形式を確認できません')
  rows.push(...page);if(page.length<500)break
 }
 return rows
}
