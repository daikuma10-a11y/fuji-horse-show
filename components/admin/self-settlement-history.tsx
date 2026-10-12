'use client'
import { useEffect, useState } from 'react'
import {MasterSettlementHistory} from '@/components/master/settlement-history'
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, AUTUMN_EVENT_ID, verifyAdminSession, type AdminSession } from '@/lib/supabase-rest'
import type { selfSettlementAccount } from '@/lib/self-settlement-account'
type Row={id:string;organization_key:string;confirmed_by:string;payment_method:string;amount:number;created_at:string;document:ReturnType<typeof selfSettlementAccount>}
export function SelfSettlementHistory({session,orgId}:{session:AdminSession;orgId?:string}){
 const [rows,setRows]=useState<Row[]>([]),[selected,setSelected]=useState<Row|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false)
 async function load(){setBusy(true);setError('');try{const verified=await verifyAdminSession(session);const response=await fetch(`${SUPABASE_URL}/rest/v1/self_settlement_confirmations?event_id=eq.${AUTUMN_EVENT_ID}${orgId?`&organization_key=eq.${encodeURIComponent(orgId)}`:''}&select=*&order=created_at.desc&limit=100`,{headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:`Bearer ${verified.accessToken}`},cache:'no-store'});if(!response.ok)throw new Error('選手の精算確定履歴を取得できません');setRows(await response.json())}catch(e){setError(e instanceof Error?e.message:'取得できません')}finally{setBusy(false)}}
 useEffect(()=>{void load()},[orgId,session])
 useEffect(()=>{const finish=()=>{delete document.body.dataset.selfSettlementPrint};window.addEventListener('afterprint',finish);return()=>{window.removeEventListener('afterprint',finish);finish()}},[])
 function printSaved(){document.body.dataset.selfSettlementPrint='true';window.print()}
 return <MasterSettlementHistory rows={rows} selected={selected} error={error} busy={busy} onReload={()=>void load()} onSelect={row=>setSelected(rows.find(value=>value.id===row.id)??null)} onClose={()=>setSelected(null)} onPrint={printSaved}/>
}
