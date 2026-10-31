import {NextRequest,NextResponse} from 'next/server'
import {ReceptionError,receptionProxy} from '@/lib/winter-reception-proxy'
import {itemPayload,stableJson} from '@/lib/winter-offline'
import {winterDraftSummary} from '@/lib/winter-batch'
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}})
export async function POST(req:NextRequest){
 if(req.headers.get('origin')!==req.nextUrl.origin)return json({error:'受付画面から操作してください'},403)
 try{
  const token=req.cookies.get('fhs-winter-reception-device')?.value??''
  if(!/^[a-f0-9]{64}$/.test(token))return json({error:'受付接続を更新してください'},401)
  const raw=await req.text()
  if(new TextEncoder().encode(raw).length>300000)return json({error:'受付内容が大きすぎます'},413)
  let body
  try{
   body=JSON.parse(raw)
   if(!uuid.test(body.receiptId)||!body.source?.draft||!body.source.context||typeof body.source.context!=='object'||Array.isArray(body.source.context))throw Error()
   const payload=itemPayload({draft:body.source.draft} as Parameters<typeof itemPayload>[0]),summary=winterDraftSummary(body.source.draft)
   if(!uuid.test(summary.id)||!summary.visitorName.trim()||payload.p_expected_total!==body.source.total||stableJson(payload.p_items[0])!==stableJson(body.source.item))throw Error()
  }catch{return json({error:'受付内容と番号を確認してください'},400)}
  const result=await receptionProxy('reception-offline',token,{receiptId:body.receiptId,source:body.source})
  if(result.receiptId!==body.receiptId||result.requestId!==body.source.item.args.p_id||result.total!==body.source.total||!['registered','review','cancelled'].includes(result.status)||!Number.isFinite(Date.parse(result.receivedAt)))throw Error('本部の受信結果を確認できません。同じ番号で自動再確認します')
  return json(result)
 }catch(e){return json({error:e instanceof Error?e.message:'受信結果を確認できません'},e instanceof ReceptionError?e.status:503)}
}
