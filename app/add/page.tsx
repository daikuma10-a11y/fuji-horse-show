"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { ChevronRight, Info, RotateCcw } from "lucide-react"
import { StepShell } from "@/components/step-shell"
import { DateSelect } from "@/components/date-select"
import { CompetitionList } from "@/components/competition-list"
import { PlayerPicker, HorsePicker } from "@/components/entity-picker"
import { OrganizationChoice, canonicalOrgId } from "@/components/organization-choice"
import { ActionButton } from "@/components/action-button"
import { SummaryCard, SummaryRow } from "@/components/summary"
import { OfficialBadge } from "@/components/official-badge"
import { useStore } from "@/lib/store"
import { calcAddFee, formatYen } from "@/lib/fees"
import type { Competition, CompetitionDate } from "@/lib/types"

type Step="date"|"competition"|"input"|"confirm"; type Picker=null|"player"|"horse"
export default function AddPage(){
 const [submitting,setSubmitting]=useState(false),[submitError,setSubmitError]=useState("");
 const router=useRouter(); const {getPlayer,getHorse,getOrg,stageAdd}=useStore(); const [step,setStep]=useState<Step>("date"),[date,setDate]=useState<CompetitionDate|null>(null),[competition,setCompetition]=useState<Competition|null>(null),[playerId,setPlayerId]=useState(""),[horseId,setHorseId]=useState(""),[note,setNote]=useState(""),[orgChoiceId,setOrgChoiceId]=useState(""),[picker,setPicker]=useState<Picker>(null); const subtitle="追加のお申し込み"; const player=getPlayer(playerId),horse=getHorse(horseId),playerOrg=player?getOrg(canonicalOrgId(player.orgId)):undefined,horseOrg=horse?getOrg(canonicalOrgId(horse.orgId)):undefined,crossClub=!!playerOrg&&!!horseOrg&&playerOrg.id!==horseOrg.id,selectedOrgId=crossClub?(orgChoiceId===playerOrg?.id||orgChoiceId===horseOrg?.id?orgChoiceId:""):horseOrg?.id??"",org=getOrg(selectedOrgId),fee=competition?calcAddFee(competition):null
 async function confirmAdd(){
  if(submitting||!competition)return
  setSubmitting(true);setSubmitError("")
  try {stageAdd({competitionId:competition.id,playerId,horseId,organizationId:crossClub?selectedOrgId:undefined,note});router.push("/reception-review")}
  catch(error){setSubmitError(error instanceof Error?error.message:"受付一覧に追加できませんでした")}
  finally{setSubmitting(false)}
 }
 if(step==="date")return <StepShell subtitle={subtitle} title="大会日を選んでください" onBack={()=>history.back()} backLabel="やめる"><DateSelect onSelect={d=>{setDate(d);setStep("competition")}}/></StepShell>
 if(step==="competition"&&date)return <StepShell subtitle={subtitle} title="競技を選んでください" description="追加でエントリーする競技を選びます" onBack={()=>setStep("date")}><CompetitionList date={date} onSelect={c=>{setCompetition(c);setPlayerId("");setHorseId("");setOrgChoiceId("");setStep("input")}}/></StepShell>
 if(step==="input"&&competition&&picker==="player")return <StepShell subtitle={subtitle} title="選手を選んでください" onBack={()=>setPicker(null)}><PlayerPicker selectedId={playerId} onSelect={id=>{setPlayerId(id);setOrgChoiceId("");setPicker(null)}}/></StepShell>
 if(step==="input"&&competition&&picker==="horse")return <StepShell subtitle={subtitle} title="馬を選んでください" description="選手と馬の所属が異なる場合は、エントリーの所属を選べます" onBack={()=>setPicker(null)}><HorsePicker selectedId={horseId} onSelect={id=>{setHorseId(id);setOrgChoiceId("");setPicker(null)}}/></StepShell>
 if(step==="input"&&competition)return <StepShell subtitle={subtitle} title="追加する内容を入力してください" description={`競技 ${competition.number}：${competition.name}`} onBack={()=>setStep("competition")} footer={<ActionButton disabled={!playerId||!horseId||!selectedOrgId} onClick={()=>setStep("confirm")}>確認画面へすすむ</ActionButton>}>
  <div className="flex flex-col gap-3"><PickRow label="選手" value={player?.name??"未選択"} filled={!!player} onClick={()=>setPicker("player")} onClear={()=>{setPlayerId("");setOrgChoiceId("")}}/><PickRow label="馬" value={horse?.name??"未選択"} hint={horseOrg?`馬の所属：${horseOrg.name}`:undefined} filled={!!horse} onClick={()=>setPicker("horse")} onClear={()=>{setHorseId("");setOrgChoiceId("")}}/></div>
  {(playerId||horseId)&&<button type="button" onClick={()=>{setPlayerId("");setHorseId("");setOrgChoiceId("")}} className="mt-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-4 text-xl font-bold text-foreground"><RotateCcw className="size-6"/>人馬の選択をすべて解除</button>}
  {crossClub&&playerOrg&&horseOrg&&<OrganizationChoice playerOrg={playerOrg} horseOrg={horseOrg} selectedId={selectedOrgId} onSelect={setOrgChoiceId}/>}
  <div className="mt-6"><label htmlFor="note" className="mb-2 block text-2xl font-bold">要望（任意）</label><p className="mb-3 text-lg text-muted-foreground">例：「○番の選手の前に入れてほしい」「別競技にも出場するため間隔を空けてほしい」</p><textarea id="note" value={note} onChange={e=>setNote(e.target.value)} rows={4} placeholder="ご要望があればご記入ください" className="w-full rounded-2xl border-2 border-border bg-card p-4 text-xl"/></div>
  <div className="mt-5 flex items-start gap-3 rounded-2xl border-2 border-primary/40 bg-primary/5 p-4 text-lg"><Info className="size-7 shrink-0 text-primary"/><span>{competition.official?<><strong>公認競技</strong>のため、原則として出番表の<strong>上側</strong>に追加します。</>:<><strong>非公認競技</strong>のため、原則として出番表の<strong>後ろ側</strong>に追加し、要望を考慮します。</>}</span></div>
 </StepShell>
 if(step==="confirm"&&competition&&player&&horse&&org&&fee)return <StepShell subtitle={subtitle} title="この内容で追加します" description="内容を確認して受付一覧に追加します。確定と保存は一覧画面で行います。" onBack={()=>setStep("input")} footer={<ActionButton disabled={submitting} onClick={()=>void confirmAdd()}>{submitting?"一覧に追加中…":"受付一覧に追加"}</ActionButton>}>
  {submitError&&<p role="alert" className="mb-4 rounded-xl bg-destructive/10 p-4 font-bold text-destructive">{submitError}</p>}
  <button type="button" onClick={()=>{setPlayerId("");setHorseId("");setOrgChoiceId("");setStep("input")}} className="mb-4 flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border-2 border-border bg-card px-4 text-xl font-bold"><RotateCcw className="size-6"/>人馬を選び直す</button>
  <SummaryCard tone="primary" title="追加する内容"><SummaryRow label="競技" value={<span className="inline-flex items-center gap-2">{`${competition.number}. ${competition.name}`}{competition.official&&<OfficialBadge/>}</span>}/><SummaryRow label="選手" value={player.name}/><SummaryRow label="馬" value={horse.name}/><SummaryRow label="所属団体" value={org?.name??"―"}/>{note.trim()&&<SummaryRow label="要望" value={<span className="text-xl">{note}</span>}/>}</SummaryCard><div className="mt-5"><SummaryCard title="料金"><SummaryRow label="追加基本料金" value={formatYen(fee.addBase)}/><SummaryRow label="エントリー料金" value={formatYen(fee.addEntry)}/><SummaryRow label="合計" value={<span className="text-primary">{formatYen(fee.total)}</span>}/></SummaryCard></div>
 </StepShell>; return null
}
function PickRow({label,value,hint,filled,onClick,onClear}:{label:string;value:string;hint?:string;filled:boolean;onClick:()=>void;onClear:()=>void}){return <div className={`flex min-h-20 items-center gap-2 rounded-2xl border-2 px-3 py-3 shadow-sm ${filled?"border-primary bg-primary/5":"border-border bg-card"}`}><button type="button" onClick={onClick} className="flex min-w-0 flex-1 items-center gap-4 text-left"><span className="w-20 shrink-0 text-lg font-semibold text-muted-foreground">{label}</span><span className="flex min-w-0 flex-1 flex-col"><span className={`text-2xl font-bold ${filled?"text-foreground":"text-muted-foreground"}`}>{value}</span>{hint&&<span className="text-base text-muted-foreground">{hint}</span>}</span><span className="rounded-lg bg-secondary px-3 py-2 text-lg font-bold">選ぶ</span><ChevronRight className="size-6 shrink-0"/></button>{filled&&<button type="button" onClick={onClear} className="rounded-lg border-2 border-border px-3 py-2 text-base font-bold">解除</button>}</div>}
