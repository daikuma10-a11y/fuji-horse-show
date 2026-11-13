import {loadWinterData} from './winter-data'
import {winterAffiliatedOrganizations,winterPickerOrder} from './winter-display-order'

async function loadPickerRanks(signal?:AbortSignal){
  const timeout=AbortSignal.timeout(5000)
  const requestSignal=signal && typeof AbortSignal.any==='function'?AbortSignal.any([signal,timeout]):timeout
  const response=await fetch('/api/winter-reception/picker-order',{cache:'no-store',signal:requestSignal})
  if(!response.ok)throw new Error('表示順を取得できません')
  const {ids}=await response.json()
  if(!Array.isArray(ids)||ids.some(id=>typeof id!=='string'))throw new Error('表示順が正しくありません')
  return new Map<string,number>(ids.map((id:string,index:number)=>[id,index]))
}

// Preserve the available reception roster during a partial outage. Cached preparations
// store only presentation ranks, never the private master roster or its readings.
export async function loadWinterPickerData(signal?:AbortSignal) {
  const [data,ranks]=await Promise.all([loadWinterData(signal),loadPickerRanks(signal).catch(()=>null)])
  if(!ranks)return data
  const order=winterPickerOrder(winterAffiliatedOrganizations(data))
  const ranked=<T extends {id:string;name:string;organization_id:string}>(rows:T[])=>
    rows.map(row=>({...row,pickerRank:ranks.get(row.id)})).sort(order)
  return {...data,riders:ranked(data.riders),horses:ranked(data.horses)}
}
