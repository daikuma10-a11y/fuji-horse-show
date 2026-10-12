import type {loadWinterData} from './winter-data'
import {WINTER_DATES,assertWinterEvent,winterCompetition,winterEntryPrice,type WinterFeeSelection} from './winter-event'
import type {MasterFormCompetition,MasterRosterSource,MasterAddState,MasterChangeState} from './master/reception-form'
import type {WinterAddInput} from './winter-reception'
import type {WinterChangeInput} from './winter-change'
import {eventStartListModel} from './master/event-start-list-model'
import type {FeeBreakdown} from './types'
type Data=Awaited<ReturnType<typeof loadWinterData>>
export function winterMasterCompetition(row:Data['competitions'][number]):MasterFormCompetition{
 assertWinterEvent(row.event_id)
 return {id:row.id,date:row.competition_date,number:row.competition_no,name:row.name,official:row.official,entryFee:row.fee,
 entryFeeLabel:row.member_fee!==null||row.nonmember_fee!==null?[row.member_fee!==null?`会員 ¥${row.member_fee.toLocaleString('ja-JP')}`:'',row.nonmember_fee!==null?`非会員 ¥${row.nonmember_fee.toLocaleString('ja-JP')}`:''].filter(Boolean).join(' ／ '):undefined}
}
export const winterMasterDates=WINTER_DATES.map(value=>({value,label:new Date(value+'T00:00:00+09:00').toLocaleDateString('ja-JP',{timeZone:'Asia/Tokyo',month:'numeric',day:'numeric',weekday:'short'})}))
export function winterMasterRoster(data:Data):MasterRosterSource {
 assertWinterEvent(data.eventId)
 for(const rows of [data.organizations,data.riders,data.horses,data.competitions,data.entries])for(const row of rows)assertWinterEvent(row.event_id)
 return {organizations:data.organizations.map(row=>({id:row.id,name:row.name})),players:data.riders.map(row=>({id:row.id,name:row.name,orgId:row.organization_id,jefRegistered:!!row.jef_member_no?.trim(),officialId:row.jef_member_no??undefined})),horses:data.horses.map(row=>({id:row.id,name:row.name,orgId:row.organization_id,jefRegistered:!!row.jef_registration_no?.trim(),officialId:row.jef_registration_no??undefined}))}
}
export function winterMasterEntryModel(data:Data,competitionId:string){
 const model=eventStartListModel(data,data.eventId,competitionId,[])
 // Winter entries are ID-linked; do not reconstruct affiliations by organization names.
 const riderOrg=new Map(data.riders.map(row=>[row.id,row.organization_id]))
 return {...model,entriesByCompetition:(id:string)=>model.entriesByCompetition(id).map(entry=>({...entry,organizationId:entry.organizationId??riderOrg.get(entry.playerId)}))}
}
export function winterMasterPrice(data:Data,id:string,selection:WinterFeeSelection){
 const c=data.competitions.find(row=>row.id===id);if(!c)throw new Error('Winterの競技を選択してください')
 assertWinterEvent(c.event_id)
 return winterEntryPrice({...winterCompetition(c.competition_no),fee:c.fee,opFee:c.op_fee,memberFee:c.member_fee,nonmemberFee:c.nonmember_fee,official:c.official},selection)
}
export function winterMasterAddFee(data:Data,id:string,selection:WinterFeeSelection):FeeBreakdown{
 const addEntry=winterMasterPrice(data,id,selection);return {addBase:3000,addEntry,changeBase:0,competitionDiff:0,total:3000+addEntry}
}
export function winterMasterChangeFee(data:Data,state:MasterChangeState,fromSelection:WinterFeeSelection,selection:WinterFeeSelection):FeeBreakdown{
 if(!state.fromCompetition||!state.toCompetition)throw new Error('変更前と変更後の競技を選択してください')
 const before=winterMasterPrice(data,state.fromCompetition.id,{...fromSelection,isOp:!!state.entry.isOp}),after=winterMasterPrice(data,state.toCompetition.id,{...selection,isOp:state.toIsOp})
 const addBase=state.treatedAsWithdrawAdd?3000:0,addEntry=state.treatedAsWithdrawAdd?after:0,changeBase=state.treatedAsWithdrawAdd?0:2000,competitionDiff=state.treatedAsWithdrawAdd?0:Math.max(0,after-before)
 return {addBase,addEntry,changeBase,competitionDiff,total:addBase+addEntry+changeBase+competitionDiff}
}
export function winterMasterAddInput(data:Data,state:MasterAddState,visitorName:string,selection:WinterFeeSelection,id:string):WinterAddInput{
 assertWinterEvent(data.eventId)
 const organization=data.organizations.find(row=>row.id===state.organizationId),competition=data.competitions.find(row=>row.id===state.competition.id),rider=data.riders.find(row=>row.id===state.playerId),horse=data.horses.find(row=>row.id===state.horseId)
 if(!organization||!competition||!rider||!horse)throw new Error('大会・人馬・所属を確認してください')
 return {id,organization:{...organization},competition:{...competition},rider:{...rider},horse:{...horse},visitorName,selection:{...selection,isOp:state.isOp},note:state.note.trim(),masterForm:true}
}
export function winterMasterChangeInput(data:Data,state:MasterChangeState,visitorName:string,fromSelection:WinterFeeSelection,selection:WinterFeeSelection,id:string):WinterChangeInput{
 const original=data.entries.find(row=>row.entry_id===state.entry.id),from=data.competitions.find(row=>row.id===state.entry.competitionId)
 if(!original||!from||!state.toCompetition||original.rider_id!==state.entry.playerId||original.horse_id!==state.entry.horseId||!!original.is_op!==!!state.entry.isOp)throw new Error('変更前の出番が変わりました。選び直してください')
 return {original:{...original},from:{...from},fromSelection:{...fromSelection,isOp:!!original.is_op},target:winterMasterAddInput(data,{competition:state.toCompetition,playerId:state.toPlayerId,horseId:state.toHorseId,organizationId:state.organizationId,isOp:state.toIsOp,note:''},visitorName,selection,id)}
}
