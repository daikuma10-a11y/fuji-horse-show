"use client"
import {useStore} from '@/lib/store'
import {canonicalOrgId} from '@/lib/organization-aliases'
import {MasterStartRows,type MasterStartRowsProps} from '@/components/master/start-list-rows'

export type StartListProps=Omit<MasterStartRowsProps,'model'|'reorderSaving'|'riderKeys'|'horseKeys'>
/** Legacy Autumn data adapter. All row rendering and gestures live in the shared master. */
export function StartList(props:StartListProps){
 const {entriesByCompetition,getPlayer,getHorse,getOrg,moveEntry,reorderSaving}=useStore()
 return <MasterStartRows {...props} reorderSaving={reorderSaving} model={{entriesByCompetition,getPlayer,getHorse,getOrg,moveEntry,canonicalOrganizationId:canonicalOrgId}}/>
}
