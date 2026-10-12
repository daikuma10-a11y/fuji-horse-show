import type {loadWinterData} from './winter-data'
import type {WinterRequestRow} from './winter-reception'
import {WINTER_EVENT_ID,assertWinterEvent} from './winter-event'
import {eventStartListModel} from './master/event-start-list-model'
/** Event boundary only. Row projection is maintained in the shared master. */
export function winterStartListModel(data:Awaited<ReturnType<typeof loadWinterData>>,competitionId:string,requests:WinterRequestRow[]){
 assertWinterEvent(data.eventId)
 return eventStartListModel(data,WINTER_EVENT_ID,competitionId,requests)
}
export type WinterStartListModel=ReturnType<typeof winterStartListModel>
