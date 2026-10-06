import { NextRequest, NextResponse } from 'next/server'
import { checkoutProxy, CHECKOUT_COOKIE, accountVersion } from '@/lib/self-settlement-server'
import { checkoutData } from '@/lib/self-settlement-data'
import { selfSettlementAccount, selfSettlementOrganizations } from '@/lib/self-settlement-account'
import { signInAdmin } from '@/lib/supabase-rest'
import { currentSavedSettlement } from '@/lib/self-settlement-saved'
export const runtime='nodejs'
export const dynamic='force-dynamic'
const reply=(data:unknown,status=200)=>NextResponse.json(data,{status,headers:{'Cache-Control':'no-store'}})
export async function GET(req:NextRequest){
 try{
  const token=req.cookies.get(CHECKOUT_COOKIE)?.value??''
  if(!token)return reply({error:'係員による精算端末の設定が必要です'},401)
  const org=req.nextUrl.searchParams.get('org')
  if(org&&!/^org-\d+$/.test(org))return reply({error:'団体を選び直してください'},400)
  if(req.nextUrl.searchParams.get('history')==='1'&&org)return reply({records:await checkoutProxy('history',token,{org})})
  const data=await checkoutData(checkoutProxy('data',token))
  if(!org)return reply({organizations:selfSettlementOrganizations(data)})
  const account=selfSettlementAccount(data,org)
  const records=await checkoutProxy('history',token,{org})
  return reply({account,version:accountVersion(data.financialVersion,account),savedRecord:currentSavedSettlement(account,records)})
 }catch(e){return reply({error:e instanceof Error?e.message:'明細を取得できません'},Number((e as {status?:number}).status)||409)}
}
export async function POST(req:NextRequest){
 try{
  if(req.headers.get('origin')!==req.nextUrl.origin)return reply({error:'受付画面から操作してください'},403)
  const body=await req.json()
  if(body.action==='setup'){
   if(typeof body.email!=='string'||typeof body.password!=='string'||body.email.length>300||body.password.length>300)return reply({error:'係員のログイン情報を確認してください'},400)
   const session=await signInAdmin(body.email,body.password)
   const device=await checkoutProxy('setup','',{},`Bearer ${session.accessToken}`)
   const response=reply({ready:true});response.cookies.set(CHECKOUT_COOKIE,device.token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',maxAge:12*3600,path:'/api/self-settlement'});return response
  }
  const token=req.cookies.get(CHECKOUT_COOKIE)?.value??''
  if(!token)return reply({error:'精算端末の設定が必要です'},401)
  if(body.action!=='confirm'||typeof body.org!=='string'||!/^org-\d+$/.test(body.org)||typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100||typeof body.id!=='string'||!/^[a-f0-9-]{36}$/.test(body.id)||!['bank_transfer','cash_at_venue','no_payment_due'].includes(body.method))return reply({error:'団体・確認者名・支払い方法を確認してください'},400)
  // Lost responses may be retried using the same ID; a receipt remains an immutable snapshot.
  const prior=await checkoutProxy('history',token,{org:body.org})
  const existing=prior.find((record:{id:string})=>record.id===body.id)
  if(existing){if(existing.version!==body.version||existing.payment_method!==body.method)return reply({error:'確定内容が異なります'},409);return reply({record:existing})}
  const data=await checkoutData(checkoutProxy('data',token)),account=selfSettlementAccount(data,body.org)
  const version=accountVersion(data.financialVersion,account)
  if(version!==body.version)return reply({error:'明細が更新されました。内容を確認し直してください',refresh:true},409)
  if(account.warnings.length)return reply({error:account.warnings.join(' ')},409)
  if((account.document.due===0)!==(body.method==='no_payment_due'))return reply({error:'支払い方法を選び直してください'},400)
  const document={...account.document,method:body.method==='bank_transfer'?'後日振込':body.method==='cash_at_venue'?'当日現金':'お支払い不要',bankDetails:body.method==='bank_transfer'?account.document.bankDetails||'静岡銀行 御殿場支店 普通 0903214':''}
  const record=await checkoutProxy('confirm',token,{input:{p_id:body.id,p_org:body.org,p_name:body.name.trim(),p_method:body.method,p_version:version,p_financial_version:data.financialVersion,p_document:{...account,document}}})
  return reply({record})
 }catch(e){return reply({error:e instanceof Error?e.message:'確定できませんでした。もう一度お試しください'},Number((e as {status?:number}).status)||409)}
}
