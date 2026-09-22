"use client"

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react"
import { competitions as mockCompetitions, horses as mockHorses, organizations as mockOrgs, players as mockPlayers, startEntries as mockEntries } from "./mock-data"
import type { AddPayload, AppRequest, ChangePayload, Competition, CompetitionDate, Horse, Organization, Payment, Player, StartEntry, WithdrawPayload } from "./types"
import type { AutumnStoreSeed } from "./autumn-db-loader"
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
const nextId = (prefix: string) => `${prefix}-${++idCounter}`

export function StoreProvider({ children, seed }: { children: ReactNode; seed?: AutumnStoreSeed }) {
  const [organizations] = useState(seed?.organizations ?? mockOrgs)
  const [players] = useState(seed?.players ?? mockPlayers)
  const [horses] = useState(seed?.horses ?? mockHorses)
  const [competitions] = useState(seed?.competitions ?? mockCompetitions)
  const [startEntries, setStartEntries] = useState(seed?.startEntries ?? mockEntries)
  const [requests, setRequests] = useState<AppRequest[]>([])
  const [payments, setPayments] = useState<Payment[]>([])

  const getCompetition = useCallback((id: string) => competitions.find(c => c.id === id), [competitions])
  const getPlayer = useCallback((id: string) => players.find(p => p.id === id), [players])
  const getHorse = useCallback((id: string) => horses.find(h => h.id === id), [horses])
  const getOrg = useCallback((id: string) => organizations.find(o => o.id === id), [organizations])
  const competitionsByDate = useCallback((date: CompetitionDate) => competitions.filter(c => c.date === date).sort((a,b) => a.number-b.number), [competitions])
  const entriesByCompetition = useCallback((competitionId: string) => startEntries.filter(e => e.competitionId === competitionId).sort((a,b) => a.order-b.order), [startEntries])

  const submitAdd = useCallback((payload: AddPayload) => { const target=getCompetition(payload.competitionId), horse=getHorse(payload.horseId); if(!target||!horse)return; setRequests(p=>[{id:nextId("req"),type:"add",status:"pending",createdAt:new Date().toISOString(),orgId:horse.orgId,fee:calcAddFee(target),add:payload},...p]) }, [getCompetition,getHorse])
  const submitChange = useCallback((payload: ChangePayload) => { const from=getCompetition(payload.fromCompetitionId),to=getCompetition(payload.toCompetitionId),horse=getHorse(payload.toHorseId); if(!from||!to||!horse)return; setRequests(p=>[{id:nextId("req"),type:"change",status:"pending",createdAt:new Date().toISOString(),orgId:horse.orgId,fee:payload.treatedAsWithdrawAdd?calcWithdrawAddFee(to):calcChangeFee(from,to),change:payload},...p]) }, [getCompetition,getHorse])
  const submitWithdraw = useCallback((payload: WithdrawPayload) => { const horse=getHorse(payload.horseId); if(!horse)return; setRequests(p=>[{id:nextId("req"),type:"withdraw",status:"pending",createdAt:new Date().toISOString(),orgId:horse.orgId,fee:calcWithdrawFee(),withdraw:payload},...p]) }, [getHorse])

  function normalizeCompetition(entries: StartEntry[], competitionId: string) {
    const others=entries.filter(e=>e.competitionId!==competitionId)
    const target=entries.filter(e=>e.competitionId===competitionId).sort((a,b)=>a.order-b.order)
    const active=target.filter(e=>!e.withdrawn), withdrawn=target.filter(e=>e.withdrawn)
    return [...others,...active,...withdrawn].map(e=>e.competitionId===competitionId?{...e,order:[...active,...withdrawn].findIndex(x=>x.id===e.id)+1}:e)
  }
  function applyAdd(entries: StartEntry[], add: AddPayload) {
    const active=entries.filter(e=>e.competitionId===add.competitionId&&!e.withdrawn).sort((a,b)=>a.order-b.order)
    const withdrawn=entries.filter(e=>e.competitionId===add.competitionId&&e.withdrawn).sort((a,b)=>a.order-b.order)
    const others=entries.filter(e=>e.competitionId!==add.competitionId)
    const newEntry: StartEntry={id:nextId("e"),competitionId:add.competitionId,order:active.length+1,playerId:add.playerId,horseId:add.horseId}
    return [...others,...active,newEntry,...withdrawn].map(e=>e.competitionId===add.competitionId?{...e,order:[...active,newEntry,...withdrawn].findIndex(x=>x.id===e.id)+1}:e)
  }
  const reflectRequest = useCallback((requestId: string) => {
    setRequests(prev => { const req=prev.find(r=>r.id===requestId); if(!req||req.status==="reflected")return prev
      setStartEntries(old => { let entries=[...old]
        if(req.type==="withdraw"&&req.withdraw){ entries=entries.map(e=>e.id===req.withdraw!.entryId?{...e,withdrawn:true}:e); entries=normalizeCompetition(entries,req.withdraw.competitionId) }
        if(req.type==="add"&&req.add) entries=applyAdd(entries,req.add)
        if(req.type==="change"&&req.change){ const ch=req.change
          if(ch.treatedAsWithdrawAdd){ entries=entries.map(e=>e.id===ch.entryId?{...e,withdrawn:true}:e); entries=normalizeCompetition(entries,ch.fromCompetitionId); entries=applyAdd(entries,{competitionId:ch.toCompetitionId,playerId:ch.toPlayerId,horseId:ch.toHorseId,note:""}) }
          else { entries=entries.map(e=>e.id===ch.entryId?{...e,competitionId:ch.toCompetitionId,playerId:ch.toPlayerId,horseId:ch.toHorseId}:e); entries=normalizeCompetition(entries,ch.fromCompetitionId); entries=normalizeCompetition(entries,ch.toCompetitionId) }
        }
        return entries
      }); return prev.map(r=>r.id===requestId?{...r,status:"reflected"}:r)
    })
  },[])
  const setPayment=useCallback((orgId:string,paid:number)=>setPayments(prev=>prev.some(p=>p.orgId===orgId)?prev.map(p=>p.orgId===orgId?{...p,paid}:p):[...prev,{orgId,paid}]),[])
  const value=useMemo<StoreValue>(()=>({organizations,players,horses,competitions,startEntries,requests,payments,getCompetition,getPlayer,getHorse,getOrg,competitionsByDate,entriesByCompetition,submitAdd,submitChange,submitWithdraw,reflectRequest,setPayment}),[organizations,players,horses,competitions,startEntries,requests,payments,getCompetition,getPlayer,getHorse,getOrg,competitionsByDate,entriesByCompetition,submitAdd,submitChange,submitWithdraw,reflectRequest,setPayment])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}
export function useStore(){ const ctx=useContext(StoreContext); if(!ctx)throw new Error("useStore は StoreProvider の内側で使用してください"); return ctx }
