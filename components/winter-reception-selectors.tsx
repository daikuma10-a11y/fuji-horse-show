"use client"
import {createContext,useContext,type ComponentProps,type ReactNode} from 'react'
import {MasterDateSelect} from '@/components/master/date-select'
import {MasterCompetitionList} from '@/components/master/competition-list'
import {MasterPlayerPicker,MasterHorsePicker} from '@/components/master/entity-picker'
import {MasterStartRows} from '@/components/master/start-list-rows'
import {winterMasterDates,winterMasterCompetition,winterMasterRoster,winterMasterEntryModel} from '@/lib/winter-master-reception'
import type {loadWinterData} from '@/lib/winter-data'
import type {MasterAddAdapter,MasterPickerProps} from '@/lib/master/reception-form'
import type {StartListProps} from '@/components/start-list'
type Data=Awaited<ReturnType<typeof loadWinterData>>
const Context=createContext<Data|null>(null)
function useData(){const data=useContext(Context);if(!data)throw new Error('Winterの大会データを確認できません');return data}
export function WinterReceptionData({data,children}:{data:Data;children:ReactNode}){return <Context.Provider value={data}>{children}</Context.Provider>}
export function WinterMasterDateSelect(props:ComponentProps<MasterAddAdapter['DateSelect']>){return <MasterDateSelect dates={winterMasterDates} {...props}/>}
export function WinterMasterCompetitionList({date,onSelect}:ComponentProps<MasterAddAdapter['CompetitionList']>){const data=useData();return <MasterCompetitionList list={data.competitions.filter(row=>row.competition_date===date).map(winterMasterCompetition)} onSelect={onSelect}/>}
export function WinterMasterPlayerPicker(props:MasterPickerProps){return <MasterPlayerPicker {...props} source={winterMasterRoster(useData())}/>}
export function WinterMasterHorsePicker(props:MasterPickerProps){return <MasterHorsePicker {...props} source={winterMasterRoster(useData())}/>}
export function WinterMasterStartList(props:StartListProps){const data=useData();return <MasterStartRows {...props} model={winterMasterEntryModel(data,props.competitionId)}/>}
