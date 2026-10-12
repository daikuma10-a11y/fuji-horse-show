import type { ComponentType, ReactNode } from 'react'
import type { Competition, StartEntry, WithdrawPayload } from '../types'
import type { MasterStartListSource } from './start-list'
import type { StartListProps } from '../../components/start-list'

export type MasterFormCompetition = Omit<Competition, 'date' | 'number'> & { date: string; number: number | string; entryFeeLabel?: string }
/** Display and gestures are shared; event adapters own validation, staging and persistence. */
export interface MasterWithdrawAdapter extends Pick<MasterStartListSource, 'getPlayer' | 'getHorse' | 'getOrg'> {
 homeHref: string
 notice?: ReactNode
 onExit: () => void
 DateSelect: ComponentType<{onSelect:(date:string)=>void}>
 CompetitionList: ComponentType<{date:string;onSelect:(competition:MasterFormCompetition)=>void}>
 StartList: ComponentType<StartListProps>
 entryFields?: (entry:StartEntry|null)=>ReactNode
 confirmFields?: (entry:StartEntry)=>ReactNode
 stageWithdraw: (payload:WithdrawPayload)=>void|Promise<void>
 onStaged: ()=>void
}

export type MasterPickerProps={selectedId?:string;registeredOnly?:boolean;onSelect:(id:string)=>void;onNavigate?:()=>void}
export type MasterAddState={competition:MasterFormCompetition;playerId:string;horseId:string;organizationId:string;isOp:boolean;note:string}
export interface MasterAddAdapter extends Pick<MasterWithdrawAdapter,'homeHref'|'notice'|'onExit'|'DateSelect'|'CompetitionList'|'getPlayer'|'getHorse'|'getOrg'|'onStaged'> {
 canonicalOrganizationId?:(id:string)=>string
 PlayerPicker:ComponentType<MasterPickerProps>
 HorsePicker:ComponentType<MasterPickerProps>
 canUseOp?:(competition:MasterFormCompetition)=>boolean
 getFee:(competition:MasterFormCompetition,isOp:boolean)=>import('../types').FeeBreakdown|null
 inputFields?:(state:MasterAddState)=>ReactNode
 confirmFields?:(state:MasterAddState)=>ReactNode
 canReview?:(state:MasterAddState)=>boolean
 onCompetitionSelected?:(competition:MasterFormCompetition)=>void
 stageAdd:(payload:import('../types').AddPayload)=>void|Promise<void>
}
export type MasterChangeState={entry:StartEntry;fromCompetition:MasterFormCompetition|undefined;toCompetition:MasterFormCompetition|undefined;toPlayerId:string;toHorseId:string;organizationId:string;toIsOp:boolean;changedFields:import('../types').ChangePayload['changedFields'];treatedAsWithdrawAdd:boolean}
export interface MasterChangeAdapter extends Omit<MasterAddAdapter,'getFee'|'inputFields'|'confirmFields'|'canReview'|'stageAdd'> {
 StartList:ComponentType<StartListProps>
 getCompetition:(id:string)=>MasterFormCompetition|undefined
 getFee:(state:MasterChangeState)=>import('../types').FeeBreakdown|null
 inputFields?:(state:MasterChangeState)=>ReactNode
 confirmFields?:(state:MasterChangeState)=>ReactNode
 canReview?:(state:MasterChangeState)=>boolean
 hasExtraChanges?:(state:MasterChangeState)=>boolean
 onEntrySelected?:(entry:StartEntry)=>void
 onRestore?:(entry:StartEntry)=>void
 stageChange:(payload:import('../types').ChangePayload)=>void|Promise<void>
}

export type MasterRosterSource={players:readonly import('../types').Player[];horses:readonly import('../types').Horse[];organizations:readonly import('../types').Organization[];canonicalOrganizationId?:(id:string)=>string}
