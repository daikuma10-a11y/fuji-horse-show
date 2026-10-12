"use client"
import { useRouter } from 'next/navigation'
import { MasterWithdrawForm } from '@/components/master/withdraw-form'
import { DateSelect } from '@/components/date-select'
import { CompetitionList } from '@/components/competition-list'
import { StartList } from '@/components/start-list'
import { useStore } from '@/lib/store'
import type { CompetitionDate } from '@/lib/types'
export default function WithdrawPage() {
 const router=useRouter(),{getPlayer,getHorse,getOrg,stageWithdraw}=useStore()
 return <MasterWithdrawForm adapter={{homeHref:'/',onExit:()=>history.back(),getPlayer,getHorse,getOrg,stageWithdraw,onStaged:()=>router.push('/reception-review'),DateSelect,CompetitionList:({date,onSelect})=><CompetitionList date={date as CompetitionDate} onSelect={onSelect}/>,StartList}}/>
}
