"use client"
import {compareRosterMembers} from '@/lib/master/roster-order'
import {loadHorseChoiceReadings} from '@/lib/shared-roster'
import {MasterHorseSubstitution} from './master/horse-substitution'
import type {loadWinterData} from '@/lib/winter-data'
import type {AdminSession} from '@/lib/supabase-rest'
import {loadHorseOptions,quoteHorseSwap} from '@/lib/winter-horse-substitution'
import {winterAllowsOp,winterCompetition,WINTER_EVENT_ID} from '@/lib/winter-event'
type Props={horseId?:string;data:Awaited<ReturnType<typeof loadWinterData>>;session:AdminSession;onSession:(s:AdminSession)=>void;onSaved:()=>void}
export function WinterHorseSubstitution({data,session,onSession,onSaved,horseId}:Props){
  return <MasterHorseSubstitution data={data} fixedHorse={horseId} storageKey={WINTER_EVENT_ID+':horse-swap:'+session.email+(horseId?':'+horseId:'')}
    allowsOp={c=>winterAllowsOp(c.competition_no,c.official,c.op_fee)}
    needsInstructor={id=>{const c=data.competitions.find(x=>x.id===id);return !!c&&winterCompetition(c.competition_no).instructorRequired===true}}
    feeNote="締切後の変更料は対象種目ごとに2,000円。フレンドシップ同士の変更は無料です。"
    loadOptions={async old=>{
      let verified=session
      const options=await loadHorseOptions(session,s=>{verified=s;onSession(s)},old)
      const rosterIds=options.choices.filter(c=>c.kind==='roster').map(c=>c.id)
      const readings=await loadHorseChoiceReadings(rosterIds,verified.accessToken).catch(()=>new Map<string,string>())
      for(const horse of data.horses)if(horse.reading)readings.set(horse.id,horse.reading)
      const choices=options.choices.map(c=>({...c,reading:readings.get(c.id)})).sort(compareRosterMembers)
      return {...options,choices}
    }}
    calculate={(input,id,quote)=>quoteHorseSwap(session,onSession,input,id,quote)}
    onSaved={onSaved}/>
}
