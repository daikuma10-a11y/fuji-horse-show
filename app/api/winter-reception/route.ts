import {NextRequest,NextResponse} from 'next/server'

const cookie='fhs-winter-reception-device'
const tokenPattern=/^[a-f0-9]{64}$/
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store'}})
class ReceptionError extends Error {constructor(message:string,public status:number,public uncertain:boolean){super(message)}}

async function proxy(action:string,token:string,input:Record<string,unknown>={}) {
  const secret=process.env.WINTER_SELF_SETTLEMENT_PROXY_SECRET
  if(!secret)throw new ReceptionError('受付接続が未設定です。係員に確認してください。',503,false)
  const response=await fetch('https://mhgyhyxagkkwdiepifdp.supabase.co/functions/v1/winter-self-settlement',{
    method:'POST',cache:'no-store',signal:AbortSignal.timeout(25000),
    headers:{apikey:'sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95','Content-Type':'application/json'},
    body:JSON.stringify({proxySecret:secret,action,token,...input}),
  })
  const value=await response.json().catch(()=>null)
  if(!response.ok||!value||value.error)throw new ReceptionError(value?.error??'受付結果を確認できません',response.ok?502:response.status,response.status>=500||value?.uncertain!==false)
  return value
}

export async function GET(req:NextRequest) {
  try {
    let token=req.cookies.get(cookie)?.value??'',fresh=false
    if(tokenPattern.test(token)) {
      try{await proxy('reception-ready',token)}catch(error){if(!(error instanceof ReceptionError)||error.status!==401)throw error;token=''}
    }
    if(!tokenPattern.test(token)){token=(await proxy('public-setup','')).token;fresh=true}
    if(!tokenPattern.test(token))throw new Error('受付接続を確認できません')
    const response=json({ready:true})
    if(fresh)response.cookies.set(cookie,token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict',path:'/api/winter-reception',maxAge:12*3600})
    return response
  }catch(error){return json({error:error instanceof Error?error.message:'受付に接続できません'},503)}
}

export async function POST(req:NextRequest) {
  if(req.headers.get('origin')!==req.nextUrl.origin)return json({error:'受付画面から操作してください',uncertain:false},403)
  try {
    const token=req.cookies.get(cookie)?.value??''
    if(!tokenPattern.test(token))return json({error:'受付画面を開き直してください',uncertain:false},401)
    const raw=await req.text()
    if(new TextEncoder().encode(raw).length>300000)return json({error:'受付内容が大きすぎます',uncertain:false},413)
    let body
    try{body=JSON.parse(raw)}catch{return json({error:'受付内容を確認してください',uncertain:false},400)}
    if(!body||!Array.isArray(body.p_items)||body.p_items.length<1||body.p_items.length>50||!Number.isSafeInteger(body.p_expected_total)||body.p_expected_total<0||body.p_expected_total>2147483647||
      !(body.visitorName===null||(typeof body.visitorName==='string'&&body.visitorName.trim().length>=1&&body.visitorName.trim().length<=100)))return json({error:'受付内容・お名前・合計を確認してください',uncertain:false},400)
    const seen=new Set<string>()
    for(const item of body.p_items){
      if(!item||!['add','change','withdraw'].includes(item.type)||!item.args||typeof item.args!=='object'||Array.isArray(item.args)||!uuid.test(item.args.p_id)||seen.has(item.args.p_id)||typeof item.args.p_visitor_name!=='string'||!item.args.p_visitor_name.trim()||item.args.p_visitor_name.trim().length>100||
        (body.visitorName!==null&&item.args.p_visitor_name!==body.visitorName.trim()))return json({error:'受付番号・お名前を確認してください',uncertain:false},400)
      seen.add(item.args.p_id)
    }
    const result=await proxy('reception-confirm',token,{items:body.p_items,total:body.p_expected_total,name:body.visitorName===null?null:body.visitorName.trim()})
    if(result.total!==body.p_expected_total||JSON.stringify(result.ids)!==JSON.stringify(body.p_items.map((item:{args:{p_id:string}})=>item.args.p_id)))throw new Error('確定結果を確認できません。同じ内容で再試行してください')
    return json(result)
  }catch(error){return json({error:error instanceof Error?error.message:'確定結果を確認できません。同じ内容で再試行してください',uncertain:!(error instanceof ReceptionError)||error.uncertain},error instanceof ReceptionError?error.status:503)}
}
