import {NextRequest,NextResponse} from 'next/server'
import {SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY} from '@/lib/supabase-rest'
import {PhotoReadError,validatePhotoPages,recognizeApplicationPhotos} from '@/lib/winter-photo-recognition'
import {PHOTO_MAX_REQUEST} from '@/lib/master/application-photo'
export const runtime='nodejs'
export const maxDuration=180
const json=(value:unknown,status=200)=>NextResponse.json(value,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}})
const running=new Set<string>(),recent=new Map<string,number[]>()
/** Review only: no service-role key and no write/RPC/registration operation. */
export async function POST(req:NextRequest){
 if(process.env.VERCEL_ENV==='production')return json({error:'Winter検証環境から操作してください'},403)
 if(req.headers.get('origin')!==req.nextUrl.origin)return json({error:'Winter管理画面から操作してください'},403)
 if(!req.headers.get('content-type')?.startsWith('application/json'))return json({error:'写真の送信形式を確認してください'},415)
 const bearer=req.headers.get('authorization')??''
 if(!/^Bearer [A-Za-z0-9._-]+$/.test(bearer)||bearer.length>8000)return json({error:'本部ログインが必要です'},401)
 let actor=''
 try{
  const auth=await fetch(`${SUPABASE_URL}/auth/v1/user`,{headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:bearer},cache:'no-store',signal:AbortSignal.timeout(10000)})
  if(!auth.ok)return json({error:'本部ログインを確認してください'},401)
  const user=await auth.json();if(!user?.id||user.app_metadata?.role!=='admin')return json({error:'管理者だけが写真を読み取れます'},403)
  actor=user.id
  const now=Date.now();for(const [key,times] of recent)if(!times.some(t=>t>now-3600000))recent.delete(key)
  const times=(recent.get(actor)??[]).filter(t=>t>now-3600000)
  if(running.has(actor)||times.length>=30)return json({error:'読み取り中の処理を待つか、しばらく時間を置いてください'},429)
  // This local throttle reduces accidental repeats; it is not a team-wide billing cap.
  if(Number(req.headers.get('content-length'))>PHOTO_MAX_REQUEST)return json({error:'写真の合計サイズが大きすぎます'},413)
  const reader=req.body?.getReader();if(!reader)return json({error:'写真を選んでください'},400)
  let length=0;const chunks:Uint8Array[]=[]
  for(;;){const r=await reader.read();if(r.done)break;length+=r.value.length;if(length>PHOTO_MAX_REQUEST){await reader.cancel();return json({error:'写真の合計サイズが大きすぎます'},413)}chunks.push(r.value)}
  let input;try{input=JSON.parse(Buffer.concat(chunks).toString('utf8'))}catch{return json({error:'写真の送信内容を確認してください'},400)}
  const pages=validatePhotoPages(input)
  if(running.has(actor))return json({error:'読み取り中の処理が終わるまでお待ちください'},429)
  running.add(actor);recent.set(actor,[...times,now])
  try{const result=await recognizeApplicationPhotos(pages);return json({application:result.application})}finally{running.delete(actor)}
 }catch(e){return json({error:e instanceof PhotoReadError?e.message:'本部ログインまたは通信を確認してください',code:e instanceof PhotoReadError?e.code:'connection'},e instanceof PhotoReadError?e.status:503)}
}
