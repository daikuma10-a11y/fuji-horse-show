import type { WithdrawPayload } from './types'
import type { WinterDraft } from './winter-batch'
import type { loadWinterData } from './winter-data'
import { assertWinterEvent } from './winter-event'

type Data = Awaited<ReturnType<typeof loadWinterData>>
/** Resolve original IDs again at staging; no financial or database write happens here. */
export function winterWithdrawDraft(data: Data, payload: WithdrawPayload, visitorName: string, id: string, options: { requireVisitor?: boolean } = {}): Extract<WinterDraft,{type:'withdraw'}> {
 assertWinterEvent(data.eventId)
 const entry=data.entries.find(row=>row.entry_id===payload.entryId)
 if(!entry || entry.competition_id!==payload.competitionId || entry.rider_id!==payload.playerId || entry.horse_id!==payload.horseId || ['wd','withdrawn'].includes(entry.status.toLowerCase()))throw new Error('棄権する出番が変わりました。選び直してください')
 const rider=data.riders.find(row=>row.id===entry.rider_id),horse=data.horses.find(row=>row.id===entry.horse_id)
 const organization=data.organizations.find(row=>row.id===rider?.organization_id)
 if(!rider || !horse || !organization)throw new Error('棄権する人馬の所属を確認できません')
 for(const row of [entry,rider,horse,organization])assertWinterEvent(row.event_id)
 if(payload.organizationId && payload.organizationId!==organization.id)throw new Error('棄権する出番の所属を確認してください')
 if((options.requireVisitor!==false&&!visitorName.trim()) || visitorName.trim().length>100)throw new Error('受付担当者名を入力してください')
 return {type:'withdraw',id,entry:{...entry},organizationId:organization.id,organizationName:organization.name,riderName:rider.name,horseName:horse.name,visitorName:visitorName.trim()}
}
