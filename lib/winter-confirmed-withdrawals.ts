import type {WinterEntryRow} from './winter-data'

// Only an confirmed withdrawal or meeting transfer belongs at the foot of the start list.
// Reversed additions and pre-registration cancellations can also have status 'withdrawn'.
export function isConfirmedWithdrawal(entry:WinterEntryRow) {
  return (entry.meetingWithdrawal === true || entry.receptionWithdrawal === true) && /^(wd|withdrawn)$/i.test(entry.status)
}

export function winterOfficialStarts(entries:WinterEntryRow[], competitionId:string) {
  const group=entries.filter(row=>row.competition_id===competitionId)
  const byOrder=(a:WinterEntryRow,b:WinterEntryRow)=>a.start_order-b.start_order || a.entry_id.localeCompare(b.entry_id)
  const starters=group.filter(row=>!/^(wd|withdrawn)$/i.test(row.status)).sort(byOrder)
  const withdrawals=group.filter(isConfirmedWithdrawal).sort(byOrder)
  const last=starters.reduce((max,row)=>Math.max(max,row.start_order),0)
  return [...starters,...withdrawals.map((row,index)=>({...row,start_order:last+index+1}))]
}
