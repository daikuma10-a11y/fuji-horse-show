"use client"
import {useRouter} from 'next/navigation'
import {MasterChangeForm} from '@/components/master/change-form'
import {AutumnDateSelect,AutumnCompetitionList,autumnCompetition} from '@/components/autumn-reception-selectors'
import {PlayerPicker,HorsePicker} from '@/components/entity-picker'
import {StartList} from '@/components/start-list'
import {canonicalOrgId} from '@/lib/organization-aliases'
import {calcChangeFee,calcWithdrawAddFee} from '@/lib/fees'
import {useStore} from '@/lib/store'
export default function ChangePage(){
 const router=useRouter(),{getCompetition,getPlayer,getHorse,getOrg,stageChange}=useStore()
 return <MasterChangeForm adapter={{homeHref:'/',onExit:()=>history.back(),DateSelect:AutumnDateSelect,CompetitionList:AutumnCompetitionList,PlayerPicker,HorsePicker,StartList,getCompetition,getPlayer,getHorse,getOrg,canonicalOrganizationId:canonicalOrgId,getFee:s=>s.fromCompetition&&s.toCompetition?(s.treatedAsWithdrawAdd?calcWithdrawAddFee(autumnCompetition(s.toCompetition),s.toIsOp):calcChangeFee(autumnCompetition(s.fromCompetition),autumnCompetition(s.toCompetition),!!s.entry.isOp,s.toIsOp)):null,stageChange,onStaged:()=>router.push('/reception-review')}}/>
}
