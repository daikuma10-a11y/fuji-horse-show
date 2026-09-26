"use client"

import {useState} from "react"
import Link from "next/link"
import {useRouter} from "next/navigation"
import {AppHeader} from "@/components/app-header"
import {ActionButton} from "@/components/action-button"
import {SummaryCard,SummaryRow} from "@/components/summary"
import {formatYen} from "@/lib/fees"
import {useStore} from "@/lib/store"
import type {AppRequest} from "@/lib/types"

const actions=[
 {href:"/add",label:"続けて追加",className:"bg-[oklch(0.46_0.1_155)] text-white"},
 {href:"/change",label:"続けて変更",className:"bg-accent text-accent-foreground"},
 {href:"/withdraw",label:"続けて棄権",className:"bg-destructive text-white"},
]
export default function ReceptionReviewPage(){
 const router=useRouter()
 const {draftRequests,draftReady,draftSaving,submitDrafts,removeDraft,getCompetition,getPlayer,getHorse,getOrg}=useStore()
 const [error,setError]=useState("")
 const [completed,setCompleted]=useState<{count:number,total:number}|null>(null)
 const total=draftRequests.reduce((sum,request)=>sum+request.fee.total,0)
 const detail=(request:AppRequest)=>{
  if(request.add)return{competition:request.add.competitionId,player:request.add.playerId,horse:request.add.horseId,note:request.add.note}
  if(request.change)return{competition:request.change.toCompetitionId,player:request.change.toPlayerId,horse:request.change.toHorseId,from:request.change}
  return{competition:request.withdraw?.competitionId??"",player:request.withdraw?.playerId??"",horse:request.withdraw?.horseId??""}
 }
 async function confirmAll(){
  if(draftSaving||!draftRequests.length)return
  setError("")
  const summary={count:draftRequests.length,total}
  try{await submitDrafts();setCompleted(summary)}catch(cause){setError(cause instanceof Error?cause.message:"受付を保存できませんでした。内容を確認してもう一度お試しください")}
 }
 return <div className="min-h-dvh bg-background"><AppHeader subtitle="受付内容のご確認"/>
  <main className="mx-auto max-w-3xl px-4 py-8">
   {completed?<div className="rounded-2xl border-2 border-primary bg-card p-6 text-center">
    <h1 className="text-3xl font-bold">受付が完了しました</h1>
    <p className="mt-5 text-xl">全{completed.count}件を保存しました。申請料金合計：<strong>{formatYen(completed.total)}</strong></p>
    <p className="mt-3 text-lg">大会本部で確認後、正式出番表に反映します。料金は所属団体ごとに精算します。</p>
    <Link href="/" className="mt-8 inline-flex min-h-14 w-full items-center justify-center rounded-xl bg-primary px-4 text-xl font-bold text-primary-foreground">最初の画面へ</Link>
   </div>:<>
    <h1 className="text-center text-3xl font-bold">お客様と確認する受付一覧</h1>
    <p className="mt-3 text-center text-lg">内容を確認してから、最後にまとめて受付を確定します。</p>
    <p className="mt-2 rounded-xl border border-accent bg-accent/10 p-3 text-center text-base font-semibold">現在は確定前です。出番表・精算にはまだ反映されていません。</p>
    {!draftReady?<p className="mt-8 text-center text-xl">受付内容を読み込んでいます…</p>:draftRequests.length===0?<p className="mt-8 rounded-xl border border-border bg-card p-6 text-center text-xl">受付一覧は空です。下から最初の申請を選んでください。</p>:<>
     <p className="mt-7 text-xl font-bold">{getOrg(draftRequests[0].orgId)?.name??"団体要確認"}　全{draftRequests.length}件</p>
     <div className="mt-4 flex flex-col gap-4">{draftRequests.map((request,index)=>{
      const info=detail(request),competition=getCompetition(info.competition),name=request.type==="add"?"追加":request.type==="change"?"変更":"棄権"
      return <div key={request.id} className="rounded-2xl border-2 border-border bg-card p-4 shadow-sm">
       <div className="flex items-center justify-between gap-2"><h2 className="text-2xl font-bold">{index+1}件目　{name}</h2><span className="rounded-lg bg-accent/15 px-2 py-1 text-sm font-bold">確定前</span></div>
       <div className="mt-3"><SummaryCard><SummaryRow label="競技" value={competition?String(competition.number)+". "+competition.name:"要確認"}/><SummaryRow label="選手" value={getPlayer(info.player)?.name??"要確認"}/><SummaryRow label="馬" value={getHorse(info.horse)?.name??"要確認"}/><SummaryRow label="団体" value={getOrg(request.orgId)?.name??"要確認"}/>
       {request.change&&<SummaryRow label="変更前" value={String(getCompetition(request.change.fromCompetitionId)?.number??"")+" / "+(getPlayer(request.change.fromPlayerId)?.name??"要確認")+" / "+(getHorse(request.change.fromHorseId)?.name??"要確認")}/>}
       {request.change?.treatedAsWithdrawAdd&&<SummaryRow label="扱い" value="棄権＋追加"/>}
       {request.add?.note&&<SummaryRow label="要望" value={request.add.note}/>}
       <SummaryRow label="申請料金" value={formatYen(request.fee.total)}/></SummaryCard></div>
       <button type="button" disabled={draftSaving} onClick={()=>removeDraft(request.id)} className="mt-3 min-h-12 w-full rounded-xl border-2 border-border text-lg font-bold disabled:opacity-50">この申請を一覧から外す</button>
      </div>
     })}</div>
     <div className="mt-6 rounded-2xl border-2 border-primary bg-primary/5 p-5"><SummaryRow label="申請料金 合計" value={formatYen(total)}/><p className="mt-2 text-base">棄権の申請料金は0円です。元のエントリー料金は返金されません。</p></div>
    </>}
    <h2 className="mt-8 text-xl font-bold">確定前に申請を続ける</h2>
    <div className="mt-3 grid gap-3">{actions.map(action=><Link key={action.href} href={action.href} className={"flex min-h-14 items-center justify-center rounded-xl px-4 text-xl font-bold "+action.className}>{action.label}</Link>)}</div>
    {error&&<p role="alert" className="mt-5 rounded-xl bg-destructive/10 p-4 text-lg font-bold text-destructive">{error}</p>}
    {draftRequests.length>0&&<div className="mt-8"><p className="mb-3 text-center text-lg font-bold">お客様と全件の内容を確認後に押してください</p><ActionButton disabled={draftSaving||!draftReady} onClick={()=>void confirmAll()}>{draftSaving?"全件を保存して確認中…":"まとめて受付を確定する"}</ActionButton></div>}
    <button type="button" onClick={()=>router.push("/")} className="mt-6 min-h-12 w-full text-lg font-semibold underline">最初の画面へ戻る</button>
   </>}
  </main>
 </div>
}
