import {NextRequest,NextResponse} from 'next/server'
import {validateWinterCheckoutAccount,validateWinterSettlementRecord} from '@/lib/winter-checkout'
import {compareWinterOrganizations} from '@/lib/winter-display-order'
import {assertWinterEvent} from '@/lib/winter-event'
const cookie='fhs-winter-self-settlement-device'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
class DefinitiveCheckoutError extends Error {constructor(message:string,public status:number){super(message)}}
async function proxy(action:string,token:string,input:Record<string,unknown>={}){
 const secret=process.env.SELF_SETTLEMENT_PROXY_SECRET
 if(!secret)throw new Error('精算接続が未設定です。係員に確認してください。')
 const response=await fetch('https://mhgyhyxagkkwdiepifdp.supabase.co/functions/v1/winter-self-settlement',{method:'POST',headers:{apikey:'sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95','Content-Type':'application/json'},signal:AbortSignal.timeout(25000),cache:'no-store',body:JSON.stringify({proxySecret:secret,action,token,...input})})
 const value=await response.json().catch(()=>null)
 if(!response.ok||!value||value.error)throw (response.status>=500||value?.uncertain?new Error(value?.error??'精算の接続を確認できません'):new DefinitiveCheckoutError(value?.error??'精算の接続を確認できません',response.status))
 return value
}
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}})
export async function GET(req:NextRequest){
 try{
  let token=req.cookies.get(cookie)?.value??'',fresh=false
  if(!/^[a-f0-9]{64}$/.test(token)){token=(await proxy('public-setup','')).token;fresh=true}
  const request=async(action:string,input:Record<string,unknown>={})=>{try{return await proxy(action,token,input)}catch(e){if(!(e instanceof DefinitiveCheckoutError)||e.status!==401)throw e;token=(await proxy('public-setup','')).token;fresh=true;return proxy(action,token,input)}}
  const org=req.nextUrl.searchParams.get('org')
  let value
  if(org){if(!uuid.test(org))return json({error:'団体を選択してください'},400);value=await request('account',{org});value.account=validateWinterCheckoutAccount(value.account);if(value.account.organization.id!==org)throw new Error('団体が一致しません');if(value.saved)value.saved=validateWinterSettlementRecord(value.saved,org)}
  else{value=await request('organizations');if(!Array.isArray(value.organizations))throw new Error('団体を確認できません');for(const o of value.organizations)assertWinterEvent(o.event_id);value.organizations.sort(compareWinterOrganizations)}
  const response=json(value)
  if(fresh)response.cookies.set(cookie,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/winter-self-settlement',maxAge:12*3600})
  return response
 }catch(e){return json({error:e instanceof Error?e.message:'精算を読み込めません'},409)}
}
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return json({error:'受付画面から操作してください'},403)
 try{
  const token=req.cookies.get(cookie)?.value??''
  if(!/^[a-f0-9]{64}$/.test(token))return json({error:'精算画面を開き直してください'},401)
  const b=await req.json()
  if(!uuid.test(b.id??'')||!uuid.test(b.org??'')||!(/^[a-f0-9]{64}$/).test(b.version??'')||typeof b.name!=='string'||!b.name.trim()||b.name.trim().length>100||!['bank_transfer','cash_at_venue','no_payment_due'].includes(b.method))return json({error:'団体・確認者名・支払方法を確認してください'},400)
  const value=await proxy('confirm',token,{id:b.id,org:b.org,version:b.version,name:b.name.trim(),method:b.method})
  const saved=validateWinterSettlementRecord(value.saved,b.org)
  if(saved.account_version!==b.version||saved.payment_method!==b.method)throw new Error('保存内容が一致しません')
  return json({saved})
 }catch(e){return json({error:e instanceof Error?e.message:'精算保存の結果を確認できません。同じ登録番号で再確認してください。',uncertain:!(e instanceof DefinitiveCheckoutError)},409)}
}
