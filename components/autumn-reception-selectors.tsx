"use client"
import {DateSelect} from '@/components/date-select'
import {CompetitionList} from '@/components/competition-list'
import type {Competition,CompetitionDate} from '@/lib/types'
import type {ComponentProps} from 'react'
import type {MasterAddAdapter} from '@/lib/master/reception-form'
export function AutumnDateSelect({onSelect}:ComponentProps<MasterAddAdapter['DateSelect']>){return <DateSelect onSelect={onSelect}/>}
export function AutumnCompetitionList({date,onSelect}:ComponentProps<MasterAddAdapter['CompetitionList']>){return <CompetitionList date={date as CompetitionDate} onSelect={onSelect}/>}
export const autumnCompetition=(competition:import('@/lib/master/reception-form').MasterFormCompetition)=>competition as Competition
