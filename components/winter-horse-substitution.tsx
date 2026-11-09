"use client"
import {MasterHorseSubstitution} from './master/horse-substitution'
import type {loadWinterData} from '@/lib/winter-data'
import type {AdminSession} from '@/lib/supabase-rest'
import {loadHorseOptions,quoteHorseSwap} from '@/lib/winter-horse-substitution'
import {winterCompetition,WINTER_EVENT_ID} from '@/lib/winter-event'
type Props={data:Awaited<ReturnType<typeof loadWinterData>>;session:AdminSession;onSession:(s:AdminSession)=>void;onSaved:()=>void}
export function WinterHorseSubstitution({data,session,onSession,onSaved}:Props){
  return <MasterHorseSubstitution data={data} storageKey={WINTER_EVENT_ID+':horse-swap:'+session.email}
    needsInstructor={id=>{const c=data.competitions.find(x=>x.id===id);return !!c&&winterCompetition(c.competition_no).instructorRequired===true}}
    feeNote="締切後の変更料は対象種目ごとに2,000円。フレンドシップ同士の変更は無料です。"
    loadOptions={old=>loadHorseOptions(session,onSession,old)}
    calculate={(input,id,quote)=>quoteHorseSwap(session,onSession,input,id,quote)}
    onSaved={onSaved}/>
}
