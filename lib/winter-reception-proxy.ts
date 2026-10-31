// Server route use only. The proxy credential never reaches the browser.
export class ReceptionError extends Error {constructor(message:string,public status:number,public uncertain:boolean){super(message)}}

export async function receptionProxy(action:string,token:string,input:Record<string,unknown>={}) {
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

