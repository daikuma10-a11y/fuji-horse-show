"use client"
import {useRouter} from 'next/navigation'
import {MasterAddForm} from '@/components/master/add-form'
import {AutumnDateSelect,AutumnCompetitionList,autumnCompetition} from '@/components/autumn-reception-selectors'
import {PlayerPicker,HorsePicker} from '@/components/entity-picker'
import {canonicalOrgId} from '@/lib/organization-aliases'
import {calcAddFee} from '@/lib/fees'
import {useStore} from '@/lib/store'
export default function AddPage(){
 const router=useRouter(),{getPlayer,getHorse,getOrg,stageAdd}=useStore()
 return <MasterAddForm adapter={{homeHref:'/',onExit:()=>history.back(),DateSelect:AutumnDateSelect,CompetitionList:AutumnCompetitionList,PlayerPicker,HorsePicker,getPlayer,getHorse,getOrg,canonicalOrganizationId:canonicalOrgId,getFee:(c,op)=>calcAddFee(autumnCompetition(c),op),stageAdd,onStaged:()=>router.push('/reception-review')}}/>
}
