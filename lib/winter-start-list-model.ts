import {winterOfficialStarts} from './winter-confirmed-withdrawals'
import {winterAffiliatedOrganizations} from './winter-display-order'
import type {loadWinterData} from './winter-data'
import type {WinterRequestRow} from './winter-reception'
import {WINTER_EVENT_ID,assertWinterEvent} from './winter-event'
import {eventStartListModel} from './master/event-start-list-model'
/** Event boundary only. Row projection is maintained in the shared master. */
export function winterStartListModel(data:Awaited<ReturnType<typeof loadWinterData>>,competitionId:string,requests:WinterRequestRow[], officialList=false){
 assertWinterEvent(data.eventId)
 const entries=officialList?winterOfficialStarts(data.entries,competitionId):data.entries
 const horses=officialList?[...data.horses,...(data.historicalHorses??[])]:data.horses
 return eventStartListModel({...data,entries,horses,organizations:winterAffiliatedOrganizations(data)},WINTER_EVENT_ID,competitionId,requests,officialList)
}
export type WinterStartListModel=ReturnType<typeof winterStartListModel>
