import type {StartEntry,Player,Horse,Organization} from '../types'
/** A tournament provides records and authorized operations, never its own row UI. */
export interface MasterStartListSource{
 entriesByCompetition:(id:string)=>StartEntry[]
 getPlayer:(id:string)=>Player|undefined
 getHorse:(id:string)=>Horse|undefined
 getOrg:(id:string)=>Organization|undefined
 canonicalOrganizationId?:(id:string)=>string
 moveEntry?:(id:string,direction:'up'|'down')=>void|Promise<void>
}
export type MasterCompetitionOption={id:string;number:string|number;name:string;official:boolean}
export type MasterDateOption={value:string;label:string}
export const masterStartViewClass=(wide:boolean)=>wide?'fixed inset-0 z-50 flex flex-col gap-1 overflow-y-auto bg-background px-3 py-2 lg:px-5':'flex flex-col gap-3'
