"use client"

import {MasterEntryCancellation,type CancellationQuote} from './master/entry-cancellation'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import type {loadWinterData} from '@/lib/winter-data'
import {winterCompetitionLabel} from '@/lib/winter-display-order'
import {winterRpc} from '@/lib/winter-reception'

type Props={data:Awaited<ReturnType<typeof loadWinterData>>;session:AdminSession;onSession:(s:AdminSession)=>void;onSaved:()=>void}
export function WinterEntryCancellation({data,session,onSession,onSaved}:Props){
  const entries=data.entries.filter(e=>e.source==='winter-initial'&&!['wd','withdrawn'].includes(e.status.toLowerCase())).map(e=>({
    id:e.entry_id,competition:e.competition_id,rider:e.rider_id,horse:e.horse_id,position:e.start_order,op:!!e.is_op,
    label:`${e.start_order}番　${data.riders.find(r=>r.id===e.rider_id)?.name} ／ ${data.horses.find(h=>h.id===e.horse_id)?.name}（${e.organization_name}）${e.is_op?' OP':''}`
  }))
  async function calculate(entry:string,operation:string|null,expected:CancellationQuote|null){
    const verified=await verifyAdminSession(session)
    onSession(verified)
    const value=await winterRpc('winter_cancel_initial_entry',{p_entry:entry,p_operation:operation,p_expected:expected},verified.accessToken,AbortSignal.timeout(25000)) as CancellationQuote|null
    if(!value||value.entryId!==entry||![value.fee,value.beforeTotal,value.afterTotal,value.afterRemaining].every(Number.isSafeInteger)){
      throw new Error('結果を確認できません。同じ内容で再確認してください。')
    }
    return value
  }
  return <MasterEntryCancellation entries={entries} competitions={data.competitions.map(c=>({id:c.id,label:c.competition_date+'　'+winterCompetitionLabel(c)}))}
    organizationName={id=>data.organizations.find(o=>o.id===id)?.name??'請求先団体'} calculate={calculate} onSaved={onSaved}/>
}
