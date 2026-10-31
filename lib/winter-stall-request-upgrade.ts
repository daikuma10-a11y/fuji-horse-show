import type {Application} from './master/application'
import {readApplicationDraft,type ApplicationDraft} from './winter-application-draft'
import type {ApplicationRegistration} from './winter-application-registration'

/** Supplement a legacy review from the same workbook, without changing its
 * frozen registration journal or repeating already registered entries. */
export function stallRequestReviewUpgrade(app:Application,draft:ApplicationDraft,record?:ApplicationRegistration):ApplicationDraft|null{
 if(app.digest!==draft.original.digest||!app.stallRequest?.trim()||draft.original.stallRequest!==undefined)return null
 if(record&&(!record.entries||Object.values(record.entries.states).length!==record.review.edited.entries.length||!Object.values(record.entries.states).every(s=>s==='registered')))return null
 const next=structuredClone(draft)
 next.original.stallRequest=app.stallRequest;next.edited.stallRequest=app.stallRequest
 next.original.stallRequestOrigins=structuredClone(app.stallRequestOrigins??[]);next.edited.stallRequestOrigins=structuredClone(app.stallRequestOrigins??[])
 if(record){
  next.reference=`WINTER-STALL-REQUESTS-${app.digest.slice(0,32)}`
  for(const p of next.edited.people)if(record.people[p.key]?.entityId)next.choices[p.key]=record.people[p.key].entityId!
 }
 next.accountChecked=false
 return readApplicationDraft(next)
}
