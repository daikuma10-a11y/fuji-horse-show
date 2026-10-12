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
