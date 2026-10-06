declare const Deno: { env: { get(name: string): string | undefined }; serve(handler: (req: Request) => Promise<Response>): void }
// Server-to-server only. The browser never receives the proxy credential or a service key.
const PROXY_HASH = '0e0667de14a68bf9fa97e4fbca4821471a30ff47c8eca1821e39d830086e1ac6'
const EVENT = '2af66251-66a2-4c51-8180-a5badf0584d4'
const sha = async (text: string) => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('')
Deno.serve(async (req: Request) => {
 const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
 try {
  if(req.method!=='POST')return json({error:'Method not allowed'},405)
  const body=await req.json()
  if(typeof body.proxySecret!=='string'||await sha(body.proxySecret)!==PROXY_HASH)return json({error:'Unauthorized'},401)
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const headers={apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json'}
  const rest=async(path:string,options:RequestInit={})=>{
   const response=await fetch(`${url}/rest/v1/${path}`,{...options,headers:{...headers,...options.headers}})
   const data=await response.json().catch(()=>null)
   if(!response.ok)throw new Error(data?.message||'精算データを取得できません')
   return data
  }
  const rows=async(table:string,select='*')=>{
   const all=[]
   for(let offset=0;offset<10000;offset+=500){const page=await rest(`${table}?event_id=eq.${EVENT}&select=${select}&limit=500&offset=${offset}`);all.push(...page);if(page.length<500)return all}
   throw new Error('データ件数が多すぎるため係員にご確認ください')
  }
  if(body.action==='setup'){
   const auth=await fetch(`${url}/auth/v1/user`,{headers:{apikey:key,Authorization:req.headers.get('Authorization')||''}})
   const user=await auth.json()
   if(!auth.ok||user.app_metadata?.role!=='admin')return json({error:'係員の認証が必要です'},403)
   const token=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('')
   await rest('self_settlement_devices',{method:'POST',headers:{Prefer:'return=representation'},body:JSON.stringify({event_id:EVENT,token_hash:await sha(token),created_by:user.id,expires_at:new Date(Date.now()+12*3600*1000).toISOString()})})
   return json({token})
  }
  if(body.action==='public-setup'){
   const token=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('')
   await rest('self_settlement_devices',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({event_id:EVENT,token_hash:await sha(token),created_by:null,expires_at:new Date(Date.now()+12*3600*1000).toISOString()})})
   return json({token})
  }
  if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return json({error:'精算端末の設定が必要です'},401)
  const hash=await sha(body.token)
  const devices=await rest(`self_settlement_devices?token_hash=eq.${hash}&revoked=eq.false&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=id,event_id`)
  if(devices.length!==1||devices[0].event_id!==EVENT)return json({error:'有効期限が切れました。精算画面を開き直してください'},401)
  if(body.action==='data'){
   const version=await rest('rpc/self_settlement_financial_version',{method:'POST',body:JSON.stringify({p_event:EVENT})})
   const [feeOverrides,prepayments,manualRecords,paymentInstructions,receipts,requestRows]=await Promise.all(['settlement_fee_overrides','settlement_prepayments','settlement_manual_records','settlement_payment_instructions','settlement_receipts','reception_requests'].map(table=>rows(table)))
   const after=await rest('rpc/self_settlement_financial_version',{method:'POST',body:JSON.stringify({p_event:EVENT})})
   if(version!==after)return json({error:'精算データが更新中です。もう一度お試しください'},409)
   return json({feeOverrides,prepayments,manualRecords,paymentInstructions,receipts,requestRows,financialVersion:version})
  }
  if(body.action==='confirm'){
   const record=await rest('rpc/confirm_self_settlement',{method:'POST',body:JSON.stringify({...body.input,p_token_hash:hash})})
   return json(record)
  }
  if(body.action==='history')return json(await rest(`self_settlement_confirmations?event_id=eq.${EVENT}&organization_key=eq.${encodeURIComponent(body.org)}&order=created_at.desc&limit=10`))
  return json({error:'Unknown action'},400)
 }catch(error){return json({error:error instanceof Error?error.message:'処理に失敗しました'},409)}
})
