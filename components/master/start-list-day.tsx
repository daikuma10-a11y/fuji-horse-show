"use client"
import type {ReactNode} from 'react'
import {OfficialBadge} from '../official-badge'

const headingId=(competitionId:string)=>'day-start-heading-'+competitionId
export function jumpToStartCompetition(competitionId:string){
  const heading=document.getElementById(headingId(competitionId))
  heading?.focus({preventScroll:true})
  heading?.scrollIntoView({block:'start'})
}

export function MasterStartDaySection({id,title,official,wide,children}:{id:string;title:string;official:boolean;wide:boolean;children:ReactNode}){
  return <section aria-labelledby={headingId(id)} className="min-w-0 border-t-2 border-border pt-4">
    <h3 id={headingId(id)} tabIndex={-1} className={wide?'mb-1 flex scroll-mt-12 flex-wrap items-center gap-2 text-sm font-bold':'mb-2 flex scroll-mt-4 flex-wrap items-center gap-2 text-lg font-bold'}>{title}{official&&<OfficialBadge/>}</h3>
    {children}
  </section>
}
