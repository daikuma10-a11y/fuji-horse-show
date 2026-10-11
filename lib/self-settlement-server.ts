import { createHash } from 'node:crypto'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './supabase-rest'
export const CHECKOUT_COOKIE='fhs-self-settlement-device'
export async function checkoutProxy(action:string,token:string,input:Record<string,unknown>={},authorization?:string){
 const secret=process.env.SELF_SETTLEMENT_PROXY_SECRET
 if(!secret)throw new Error('精算端末の設定を準備中です')
 const response=await fetch(`${SUPABASE_URL}/functions/v1/self-settlement`,{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,'Content-Type':'application/json',...(authorization?{Authorization:authorization}:{})},body:JSON.stringify({proxySecret:secret,action,token,...input}),cache:'no-store'})
 const data=await response.json()
 if(!response.ok)throw Object.assign(new Error(data.error||'精算処理に失敗しました'),{status:response.status})
 return data
}
export const accountVersion=(financialVersion:string,account:unknown)=>createHash('sha256').update(financialVersion+JSON.stringify(account)).digest('hex')
