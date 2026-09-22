"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { competitions as seedCompetitions, horses as seedHorses, organizations as seedOrgs, players as seedPlayers, startEntries as seedStartEntries } from "./mock-data"
import type { AddPayload, AppRequest, ChangePayload, Competition, CompetitionDate, Horse, Organization, Payment, Player, StartEntry, WithdrawPayload } from "./types"
import { calcAddFee, calcChangeFee, calcWithdrawAddFee, calcWithdrawFee } from "./fees"

interface StoreValue {
  organizations: Organization[]; players: Player[]; horses: Horse[]; competitions: Competition[]; startEntries: StartEntry[]; requests: AppRequest[]; payments: Payment[]
  getCompetition: (id: string) => Competition | undefined; getPlayer: (id: string) => Player | undefined; getHorse: (id: string) => Horse | undefined; getOrg: (id: string) => Organization | undefined
  competitionsByDate: (date: CompetitionDate) => Competition[]; entriesByCompetition: (competitionId: string) => StartEntry[]
  submitAdd: (payload: AddPayload) => void; submitChange: (payload: ChangePayload) => void; submitWithdraw: (payload: WithdrawPayload) => void
  reflectRequest: (requestId: string) => void; setPayment: (orgId: string, paid: number) => void
}
const StoreContext = createContext<StoreValue | null>(null)
let idCounter = 1000
function nextId(prefix: string) { idCounter += 1; return `${prefix}-${idCounter}` }

export function StoreProvider({ children }: { children: ReactNode }) {
  const [organizations] = useState<Organization[]>(seedOrgs); const [players] = useState<Player[]>(seedPlayers); const [horses] = useState<Horse[]>(seedHorses); const [competitions] = useState<Competition[]>(seedCompetitions)
  const [startEntries, setStartEntries] = useState<StartEntry[]>(seedStartEntries); const [requests, setRequests] = useState<AppRequest[]>([]); const [payments, setPayments] = useState<Payment[]>([])
  const getCompetition = useCallback((id: string) => competitions.find(c => c.id === id), [competitions]); const getPlayer = useCallback((id: string) => players.find(p => p.id === id), [players]); const getHorse = useCallback((id: string) => horses.find(h => h.id === id), [horses]); const getOrg = useCallback((id: string) => organizations.find(o => o.id === id), [organizations])
  const competitionsByDate = useCallback((date: CompetitionDate) => competitions.filter(c => c.date === date).sort((a,b)=>a.number-b.number), [competitions])
  const entriesByCompetition = useCallback((competitionId: string) => startEntries.filter(e => e.competitionId === competitionId).sort((a,b)=>a.order-b.order), [startEntries])

  const submitAdd = useCallback((payload: AddPayload) => { const target=competitions.find(c=>c.id===payload.competitionId); const horse=horses.find(h=>h.id===payload.horseId); if(!target||!horse)return; setRequests(prev=>[{id:nextId("req"),type:"add",status:"pending",createdAt:new Date().toISOString(),orgId:horse.orgId,fee:calcAddFee(target),add:payload},...prev]) }, [competitions,horses])
  const submitChange = useCallback((payload: ChangePayload) => { const from=competitions.find(c=>c.id===payload.fromCompetitionId); const to=competitions.find(c=>c.id===payload.toCompetitionId); const horse=horses.find(h=>h.id===payload.toHorseId); if(!from||!to||!horse)return; setRequests(prev=>[{id:nextId("req"),type:"change",status:"pending",createdAt:new Date().toISOString(),orgId:horse.orgId,fee:payload.treatedAsWithdrawAdd?calcWithdrawAddFee(to):calcChangeFee(from,to),change:payload},...prev]) }, [competitions,horses])
  const submitWithdraw = useCallback((payload: WithdrawPayload) => { const horse=horses.find(h=>h.id===payload.horseId); if(!horse)return; setRequests(prev=>[{id:nextId("req"),type:"withdraw",status:"pending",createdAt:new Date().toISOString(),orgId:horse.orgId,fee:calcWithdrawFee(),withdraw:payload},...prev]) }, [horses])

  function renumberStartEntries(entries: StartEntry[]) { const maps=new Map<string,Map<string,number>>(); for(const cid of Array.from(new Set(entries.map(e=>e.competitionId)))) { const ordered=entries.filter(e=>e.competitionId===cid).sort((a,b)=>a.order-b.order); maps.set(cid,new Map(ordered.map((e,i)=>[e.id,i+1]))) } return entries.map(e=>({...e,order:maps.get(e.competitionId)?.get(e.id)??e.order})) }
  function seedCompetitionOfficial(id:string){ return competitions.find(c=>c.id===id)?.official??false }
  function applyAdd(entries:StartEntry[], add:AddPayload, official:boolean, mark:"added"|"changed"="added") { const target=entries.filter(e=>e.competitionId===add.competitionId).sort((a,b)=>a.order-b.order); const newEntry:StartEntry={id:nextId("e"),competitionId:add.competitionId,order:0,playerId:add.playerId,horseId:add.horseId,adminChangeMark:mark}; if(official){const shifted=entries.map(e=>e.competitionId===add.competitionId?{...e,order:e.order+1}:e);newEntry.order=1;return[...shifted,newEntry]} const active=target.filter(e=>!e.withdrawn), withdrawn=target.filter(e=>e.withdrawn); const next=[...active,newEntry,...withdrawn].map((e,i)=>({...e,order:i+1})); return [...entries.filter(e=>e.competitionId!==add.competitionId),...next] }

  const reflectRequest = useCallback((requestId:string)=>{ setRequests(prevReqs=>{ const req=prevReqs.find(r=>r.id===requestId); if(!req||req.status==="reflected")return prevReqs; setStartEntries(prev=>{let entries=[...prev]; if(req.type==="withdraw"&&req.withdraw){const target=entries.find(e=>e.id===req.withdraw!.entryId);if(target){const others=entries.filter(e=>e.id!==target.id);const max=Math.max(0,...others.filter(e=>e.competitionId===target.competitionId).map(e=>e.order));entries=[...others,{...target,order:max+1,withdrawn:true}]}} if(req.type==="add"&&req.add)entries=applyAdd(entries,req.add,seedCompetitionOfficial(req.add.competitionId),"added"); if(req.type==="change"&&req.change){const ch=req.change;if(ch.treatedAsWithdrawAdd){entries=entries.filter(e=>e.id!==ch.entryId);entries=applyAdd(entries,{competitionId:ch.toCompetitionId,playerId:ch.toPlayerId,horseId:ch.toHorseId,note:""},seedCompetitionOfficial(ch.toCompetitionId),"changed")}else{entries=entries.map(e=>e.id===ch.entryId?{...e,competitionId:ch.toCompetitionId,playerId:ch.toPlayerId,horseId:ch.toHorseId,adminChangeMark:"changed"}:e)}} return renumberStartEntries(entries)}); return prevReqs.map(r=>r.id===requestId?{...r,status:"reflected"}:r) }) }, [competitions])
  const setPayment=useCallback((orgId:string,paid:number)=>setPayments(prev=>prev.some(p=>p.orgId===orgId)?prev.map(p=>p.orgId===orgId?{...p,paid}:p):[...prev,{orgId,paid}]),[])
  const value=useMemo<StoreValue>(()=>({organizations,players,horses,competitions,startEntries,requests,payments,getCompetition,getPlayer,getHorse,getOrg,competitionsByDate,entriesByCompetition,submitAdd,submitChange,submitWithdraw,reflectRequest,setPayment}),[organizations,players,horses,competitions,startEntries,requests,payments,getCompetition,getPlayer,getHorse,getOrg,competitionsByDate,entriesByCompetition,submitAdd,submitChange,submitWithdraw,reflectRequest,setPayment])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
export function useStore(){const ctx=useContext(StoreContext);if(!ctx)throw new Error("useStore は StoreProvider の内側で使用してください");return ctx}
