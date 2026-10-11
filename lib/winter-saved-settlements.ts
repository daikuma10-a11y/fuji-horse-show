import {verifyAdminSession,type AdminSession} from './supabase-rest'
import {WINTER_EVENT_ID} from './winter-event'
import {validateWinterSettlementRecord,type WinterSettlementRecord} from './winter-checkout'
export async function loadWinterSavedSettlements(session:AdminSession,orgId:string,signal?:AbortSignal){
 if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(orgId))throw new Error('団体を選択してください')
 const verified=await verifyAdminSession(session)
 const query=new URLSearchParams({event_id:`eq.${WINTER_EVENT_ID}`,organization_key:`eq.${orgId}`,select:'id,event_id,organization_key,account_version,payment_method,confirmer_name,account,created_at',order:'created_at.desc,id.desc',limit:'20'})
 const response=await fetch(`https://mhgyhyxagkkwdiepifdp.supabase.co/rest/v1/fhs_winter_settlement_confirmations?${query}`,{headers:{apikey:'sb_publishable_kjIzIQnO0mztPHLCt9t9CQ_0vhqSF95',Authorization:`Bearer ${verified.accessToken}`},cache:'no-store',signal:signal?AbortSignal.any([signal,AbortSignal.timeout(15000)]):AbortSignal.timeout(15000)})
 if(!response.ok)throw new Error('保存済み精算書を読み込めません。本部ログインを確認してください。')
 const value:unknown=await response.json()
 if(!Array.isArray(value))throw new Error('保存済み精算書の形式を確認できません')
 return {session:verified,records:value.map(x=>validateWinterSettlementRecord(x,orgId)) as WinterSettlementRecord[]}
}
