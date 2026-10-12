"use client"
import Link from 'next/link'
import { useEffect, useMemo, useState, type ComponentProps } from 'react'
import { useRouter } from 'next/navigation'
import { MasterWithdrawForm } from '@/components/master/withdraw-form'
import { MasterDateSelect } from '@/components/master/date-select'
import { MasterCompetitionList } from '@/components/master/competition-list'
import { MasterStartRows } from '@/components/master/start-list-rows'
import { WinterQueueLink } from '@/components/winter-queue-link'
import { WinterExerciseNotice } from '@/components/winter-exercise-notice'
import { loadWinterData } from '@/lib/winter-data'
import { eventStartListModel } from '@/lib/master/event-start-list-model'
import { WINTER_DATES } from '@/lib/winter-event'
import { stageWinterDraft, type WinterQueueScope } from '@/lib/winter-batch'
import { winterWithdrawDraft } from '@/lib/winter-withdraw-form'
import type { MasterWithdrawAdapter } from '@/lib/master/reception-form'

type Data=Awaited<ReturnType<typeof loadWinterData>>
const dates=WINTER_DATES.map(value=>({value,label:new Date(value+'T00:00:00+09:00').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'})}))
export function WinterWithdrawForm() {
 const [data,setData]=useState<Data|null>(null),[error,setError]=useState(''),[reload,setReload]=useState(0),[scope,setScope]=useState<WinterQueueScope>('reception')
 useEffect(()=>{setScope(new URLSearchParams(window.location.search).get('meeting')==='1'?'meeting':'reception')},[])
 useEffect(()=>{const controller=new AbortController();setError('');loadWinterData(controller.signal).then(value=>{if(!controller.signal.aborted)setData(value)}).catch(reason=>{if(!controller.signal.aborted)setError(reason instanceof Error?reason.message:'Winterのデータを読み込めません')});return()=>controller.abort()},[reload])
 if(!data)return <main className="mx-auto max-w-5xl p-5"><p role={error?'alert':'status'}>{error||'Winterのデータを読み込んでいます…'}</p>{error&&<button type="button" onClick={()=>setReload(value=>value+1)}>再読み込み</button>}</main>
 return <LoadedWinterWithdraw data={data} scope={scope}/>
}
function LoadedWinterWithdraw({data,scope}:{data:Data;scope:WinterQueueScope}) {
 const router=useRouter(),[visitorName,setVisitorName]=useState('')
 // Stable selector component identities preserve selection state while typing the visitor name.
 const selectors=useMemo(()=>({
 DateSelect:({onSelect}:ComponentProps<MasterWithdrawAdapter['DateSelect']>)=><MasterDateSelect dates={dates} onSelect={onSelect}/>,
 CompetitionList:({date,onSelect}:ComponentProps<MasterWithdrawAdapter['CompetitionList']>)=><MasterCompetitionList list={data.competitions.filter(row=>row.competition_date===date).map(row=>({id:row.id,date:row.competition_date,number:row.competition_no,name:row.name,official:row.official,entryFee:row.fee,entryFeeLabel:row.member_fee!==null||row.nonmember_fee!==null?[row.member_fee!==null?`会員 ¥${row.member_fee.toLocaleString('ja-JP')}`:'',row.nonmember_fee!==null?`非会員 ¥${row.nonmember_fee.toLocaleString('ja-JP')}`:''].filter(Boolean).join(' ／ '):undefined}))} onSelect={onSelect}/>,
 StartList:(props:import('@/components/start-list').StartListProps)=><MasterStartRows {...props} model={eventStartListModel(data,data.eventId,props.competitionId,[])}/>
 }),[data])
 const people=eventStartListModel(data,data.eventId,'',[])
 const visitor=<label className="mt-4 block text-xl font-bold">受付担当者名<input value={visitorName} maxLength={100} onChange={event=>setVisitorName(event.target.value)} className="mt-2 min-h-16 w-full rounded-xl border-2 border-border bg-card p-3 text-xl"/></label>
 return <MasterWithdrawForm adapter={{...people,...selectors,homeHref:'/winter',onExit:()=>router.push(scope==='meeting'?'/winter/admin#winter-meeting':'/winter'),notice:<><WinterQueueLink scope={scope}/>{scope==='meeting'&&<p className="rounded-xl bg-orange-100 p-4 font-bold">打ち合わせ会の保留入力です。相談中はDB・出番表・精算には反映しません。<Link className="underline" href="/winter/admin#winter-meeting">打ち合わせ会へ戻る</Link></p>}</>,entryFields:entry=><><WinterExerciseNotice organizationId={entry?data.riders.find(row=>row.id===entry.playerId)?.organization_id??'':''}/>{visitor}</>,confirmFields:()=> <p className="mt-4 text-xl">受付担当者：{visitorName||'未入力'} ／ 棄権料金：¥0</p>,stageWithdraw:payload=>stageWinterDraft(winterWithdrawDraft(data,payload,visitorName,crypto.randomUUID()),scope),onStaged:()=>router.push(scope==='meeting'?'/winter/admin#winter-meeting':'/winter/confirm')}}/>
}
