"use client"
import {useStore} from '@/lib/store'
import {canonicalOrgId} from '@/lib/organization-aliases'
import {compareOrganizations} from '@/lib/organization-order'
import {MasterPlayerPicker,MasterHorsePicker} from '@/components/master/entity-picker'
import type {MasterPickerProps} from '@/lib/master/reception-form'
export function PlayerPicker(props:MasterPickerProps){
 const {players,organizations}=useStore()
 // Preserve the two organizer-confirmed Autumn source exclusions, without deleting roster data.
 return <MasterPlayerPicker {...props} source={{players:players.filter(p=>p.id!=='p-119'&&p.id!=='p-122'),horses:[],organizations:[...organizations].sort(compareOrganizations),canonicalOrganizationId:canonicalOrgId}}/>
}
export function HorsePicker(props:MasterPickerProps){
 const {horses,organizations}=useStore()
 return <MasterHorsePicker {...props} source={{players:[],horses,organizations:[...organizations].sort(compareOrganizations),canonicalOrganizationId:canonicalOrgId}}/>
}
