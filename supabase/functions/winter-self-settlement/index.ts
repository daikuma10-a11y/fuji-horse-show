declare const Deno: {env:{get(name:string):string|undefined};serve(handler:(req:Request)=>Promise<Response>):void}
const EVENT='b571f05e-ed23-4e07-929e-be2b73e601a5'
// Dedicated Winter preview proxy authentication; no browser gets this credential.
const PROXY_HASH='5b1f1bf8bce78ab09711c1d819dcffaa6b9a0a90ef59284ac08538260f2e9486'
const sha=async(text:string)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text)))].map(n=>n.toString(16).padStart(2,'0')).join('')
Deno.serve(async(req:Request)=>{
 const json=(value:unknown,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store'}})
 try{
  if(req.method!=='POST')return json({error:'Method not allowed'},405)
  const body=await req.json()
  if(typeof body.proxySecret!=='string'||await sha(body.proxySecret)!==PROXY_HASH)return json({error:'Unauthorized'},401)
  const url=Deno.env.get('SUPABASE_URL')!,key=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const rest=async(path:string,options:RequestInit={})=>{const response=await fetch(`${url}/rest/v1/${path}`,{...options,signal:AbortSignal.timeout(15000),headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',...options.headers}});const data=await response.json().catch(()=>null);if(!response.ok){const error=new Error(data?.message||'精算内容を取得できません') as Error&{uncertain?:boolean};error.uncertain=response.status>=500;throw error;}return data}
  if(body.action==='public-setup'){
   const token=[...crypto.getRandomValues(new Uint8Array(32))].map(n=>n.toString(16).padStart(2,'0')).join('')
   await rest('fhs_winter_settlement_devices',{method:'POST',headers:{Prefer:'return=minimal'},body:JSON.stringify({token_hash:await sha(token),expires_at:new Date(Date.now()+12*3600000).toISOString()})})
   return json({token})
  }
  if(typeof body.token!=='string'||!/^[a-f0-9]{64}$/.test(body.token))return json({error:'精算画面を開き直してください'},401)
  const hash=await sha(body.token)
  const devices=await rest(`fhs_winter_settlement_devices?token_hash=eq.${hash}&revoked=eq.false&expires_at=gt.${encodeURIComponent(new Date().toISOString())}&select=token_hash`)
  if(devices.length!==1)return json({error:'有効期限が切れました。精算画面を開き直してください'},401)
  if(body.action==='reception-ready')return json({ready:true})
  if(body.action==='reception-offline')return json(await rest('rpc/receive_winter_offline_item',{method:'POST',body:JSON.stringify({p_receipt_id:body.receiptId,p_source:body.source,p_token_hash:hash})}))
  if(body.action==='reception-confirm')return json(await rest('rpc/submit_winter_public_reception_batch',{method:'POST',body:JSON.stringify({p_items:body.items,p_expected_total:body.total,p_visitor_name:body.name,p_token_hash:hash})}))
  if(body.action==='organizations'){
   const rows=[]
   for(let offset=0;;offset+=500){const page=await rest(`organizations?event_id=eq.${EVENT}&select=id,event_id,name&order=id.asc&limit=500&offset=${offset}`);rows.push(...page);if(page.length<500)return json({organizations:rows})}
  }
  if(typeof body.org!=='string'||!/^[0-9a-f-]{36}$/i.test(body.org))return json({error:'団体を選択してください'},400)
  if(body.action==='history'){
   const records=await rest(`fhs_winter_settlement_confirmations?event_id=eq.${EVENT}&organization_key=eq.${body.org}&select=id,event_id,organization_key,account_version,payment_method,confirmer_name,account,created_at&order=created_at.desc,id.desc&limit=100`)
   return json({records})
  }
  if(body.action==='account'){
   const current=await rest('rpc/get_winter_settlement_account',{method:'POST',body:JSON.stringify({p_org:body.org})})
   const history=await rest(`fhs_winter_settlement_confirmations?event_id=eq.${EVENT}&organization_key=eq.${body.org}&select=id,event_id,organization_key,account_version,payment_method,confirmer_name,account,created_at&order=created_at.desc,id.desc&limit=1`)
   return json({...current,saved:history[0]??null})
  }
  if(body.action==='confirm')return json({saved:await rest('rpc/confirm_winter_settlement',{method:'POST',body:JSON.stringify({p_id:body.id,p_org:body.org,p_version:body.version,p_method:body.method,p_name:body.name,p_token_hash:hash})})})
  return json({error:'Unknown action'},400)
 }catch(e){return json({error:e instanceof Error?e.message:'処理に失敗しました',uncertain:!!(e as {uncertain?:boolean})?.uncertain||(e instanceof Error&&['TimeoutError','AbortError','TypeError'].includes(e.name))},409)}
})

export {}
