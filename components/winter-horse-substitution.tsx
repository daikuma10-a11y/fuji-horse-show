"use client"
import {MasterHorseSubstitution} from './master/horse-substitution'
import type {loadWinterData} from '@/lib/winter-data'
import type {AdminSession} from '@/lib/supabase-rest'
import {loadHorseOptions,quoteHorseSwap} from '@/lib/winter-horse-substitution'
import {winterCompetition,WINTER_EVENT_ID} from '@/lib/winter-event'
type Props={horseId?:string;data:Awaited<ReturnType<typeof loadWinterData>>;session:AdminSession;onSession:(s:AdminSession)=>void;onSaved:()=>void}
export function WinterHorseSubstitution({data,session,onSession,onSaved,horseId}:Props){
  return <MasterHorseSubstitution data={data} fixedHorse={horseId} storageKey={WINTER_EVENT_ID+':horse-swap:'+session.email+(horseId?':'+horseId:'')}
    needsInstructor={id=>{const c=data.competitions.find(x=>x.id===id);return !!c&&winterCompetition(c.competition_no).instructorRequired===true}}
    feeNote="締切後の変更料は対象種目ごとに2,000円。フレンドシップ同士の変更は無料です。"
    loadOptions={async old=>{
      const options=await loadHorseOptions(session,onSession,old)
      const reading=new Map(data.horses.map(h=>[h.id,h.reading||h.name]))
      const key=(c:typeof options.choices[number])=>c.kind==='event'?reading.get(c.id)||c.name:c.name
      return {...options,choices:[...options.choices].sort((a,b)=>key(a).localeCompare(key(b),'ja')||a.name.localeCompare(b.name,'ja')||a.id.localeCompare(b.id))}
    }}
    calculate={(input,id,quote)=>quoteHorseSwap(session,onSession,input,id,quote)}
    onSaved={onSaved}/>
}
