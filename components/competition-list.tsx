"use client"
import { useStore } from '@/lib/store'
import type { Competition, CompetitionDate } from '@/lib/types'
import { MasterCompetitionList } from '@/components/master/competition-list'
export function CompetitionList({date,onSelect}:{date:CompetitionDate;onSelect:(competition:Competition)=>void}) {
 const {competitionsByDate}=useStore()
 return <MasterCompetitionList list={competitionsByDate(date)} onSelect={competition=>onSelect(competition as Competition)}/>
}
