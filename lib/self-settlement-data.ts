import { organizations, players as seedPlayers, horses as seedHorses, competitions as seedCompetitions } from './mock-data'
import { canonicalOrgId } from './organization-aliases'
import { loadAutumnEntryRows, loadAutumnMasterOrganizations, loadCompetitionFees, loadCancelledReceptionEntryIds, normalizeRequestRow } from './supabase-rest'
import { loadPostDeadlineMasters } from './post-deadline-masters'
import type { AccountData } from './self-settlement-account'
import type { AppRequest, StartEntry, Player, Horse } from './types'

type PrivateData = Pick<AccountData,'feeOverrides'|'prepayments'|'manualRecords'|'paymentInstructions'|'receipts'> & {requestRows: Parameters<typeof normalizeRequestRow>[0][];financialVersion:string}
const norm=(s:string)=>(s??'').normalize('NFKC').replace(/[\s　]+/g,'').toLocaleLowerCase('ja-JP')
export async function checkoutData(finance: Promise<PrivateData>): Promise<AccountData & {financialVersion:string}> {
 const [privateData, dbEntries, masters, fees, extra, cancelled]=await Promise.all([finance,loadAutumnEntryRows(),loadAutumnMasterOrganizations(),loadCompetitionFees(),loadPostDeadlineMasters(organizations),loadCancelledReceptionEntryIds()])
 const players=[...seedPlayers,...extra.players],horses=[...seedHorses,...extra.horses]
 const competitions=seedCompetitions.map(c=>({...c,entryFee:fees.get(c.number)??c.entryFee}))
 const org=(name:string)=>{const matches=organizations.filter(o=>norm(o.name)===norm(name));return matches.find(o=>o.name===name)??matches.find(o=>o.id===canonicalOrgId(o.id))??matches[0]}
 const resolve=<T extends Player|Horse>(items:T[],id:string,kind:'player'|'horse')=>{
  const direct=items.find(item=>item.id===id);if(direct)return direct
  const master=(kind==='player'?masters.registeredRiders:masters.registeredHorses).find(row=>row.id===id)
  if(!master)return undefined
  const matches=items.filter(item=>norm(item.name)===norm(master.name)&&norm(organizations.find(o=>o.id===item.orgId)?.name??'')===norm(master.organizationName))
  return matches.length===1?matches[0]:matches.find(item=>item.orgId===canonicalOrgId(item.orgId))
 }
 const comp=(id:string)=>competitions.find(c=>c.id===id)?.id??competitions.find(c=>c.number===Number(dbEntries.find(e=>e.competition_id===id)?.competition_no))?.id??id
 const startEntries:StartEntry[]=dbEntries.filter(row=>!cancelled.has(row.entry_id)).flatMap(row=>{
  const player=resolve(players,row.rider_id,'player'),horse=resolve(horses,row.horse_id,'horse'),organization=org(row.organization_name)
  if(!player||!horse||!organization)return[]
  return[{id:row.entry_id,competitionId:comp(row.competition_id),order:row.start_order,playerId:player.id,horseId:horse.id,organizationId:organization.id,isOp:!!row.is_op,withdrawn:['withdrawn','wd'].includes(row.status.toLowerCase())}]
 })
 const player=(id:string)=>resolve(players,id,'player')?.id??id,horse=(id:string)=>resolve(horses,id,'horse')?.id??id
 const requests=privateData.requestRows.map(normalizeRequestRow).filter((r):r is AppRequest=>!!r).map(req=>{
  const official=startEntries.find(e=>e.id===req.officialEntryId)
  const orgId=organizations.some(o=>o.id===req.orgId)?req.orgId:official?.organizationId??req.orgId
  if(req.add)return{...req,orgId,add:{...req.add,competitionId:comp(req.add.competitionId),playerId:player(req.add.playerId),horseId:horse(req.add.horseId)}}
  if(req.change)return{...req,orgId,change:{...req.change,fromCompetitionId:comp(req.change.fromCompetitionId),toCompetitionId:comp(req.change.toCompetitionId),fromPlayerId:player(req.change.fromPlayerId),toPlayerId:player(req.change.toPlayerId),fromHorseId:horse(req.change.fromHorseId),toHorseId:horse(req.change.toHorseId)}}
  if(req.withdraw)return{...req,orgId,withdraw:{...req.withdraw,competitionId:comp(req.withdraw.competitionId),playerId:player(req.withdraw.playerId),horseId:horse(req.withdraw.horseId)}}
  return req
 })
 return{...privateData,organizations,players,horses,competitions,startEntries,requests}
}
