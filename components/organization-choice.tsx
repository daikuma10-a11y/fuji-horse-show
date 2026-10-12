"use client"
import type {ComponentProps} from 'react'
import {MasterOrganizationChoice} from '@/components/master/organization-choice'
import {canonicalOrgId} from '@/lib/organization-aliases'
export {canonicalOrgId} from '@/lib/organization-aliases'
export function OrganizationChoice(props:ComponentProps<typeof MasterOrganizationChoice>){return <MasterOrganizationChoice {...props} playerOrg={{...props.playerOrg,id:canonicalOrgId(props.playerOrg.id)}} horseOrg={{...props.horseOrg,id:canonicalOrgId(props.horseOrg.id)}}/>}
