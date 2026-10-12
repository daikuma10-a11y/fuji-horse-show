"use client"
import { COMPETITION_DATES } from '@/lib/mock-data'
import type { CompetitionDate } from '@/lib/types'
import { MasterDateSelect } from '@/components/master/date-select'
export function DateSelect({onSelect}:{onSelect:(date:CompetitionDate)=>void}) {
 return <MasterDateSelect dates={COMPETITION_DATES} onSelect={date=>onSelect(date as CompetitionDate)}/>
}
