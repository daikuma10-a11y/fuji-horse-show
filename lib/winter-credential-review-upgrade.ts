import type {Application} from './master/application'
import {readApplicationDraft,type ApplicationDraft} from './winter-application-draft'
import type {ApplicationRegistration} from './winter-application-registration'

/** Supplement an older completed import from the same actual workbook.
 * The old registration checkpoint stays immutable; fresh DB reconciliation is still required.
 */
export function credentialReviewUpgrade(app:Application,draft:ApplicationDraft,record?:ApplicationRegistration):ApplicationDraft|null{
 if(app.digest!==draft.original.digest||!app.people.some(p=>p.kind==='horse'&&p.horseGrade!==undefined&&draft.original.people.some(old=>old.key===p.key&&old.horseGrade===undefined)))return null
 if(record&&(!record.entries||Object.values(record.entries.states).length!==record.review.edited.entries.length||!Object.values(record.entries.states).every(s=>s==='registered')))return null
 const old=record?.review??draft,next=structuredClone(old)
 for(const p of app.people){
  const original=next.original.people.find(x=>x.key===p.key),edited=next.edited.people.find(x=>x.key===p.key)
  if(!original||!edited||original.kind!==p.kind)throw new Error('資格・グレードの原本行が一致しません')
  if(p.credentialOrigin){original.credentialOrigin=structuredClone(p.credentialOrigin);edited.credentialOrigin=structuredClone(p.credentialOrigin)}
  if(p.kind==='horse'&&original.horseGrade===undefined){original.horseGrade=p.horseGrade??'';edited.horseGrade=p.horseGrade??''}
  if(record?.people[p.key].entityId)next.choices[p.key]=record.people[p.key].entityId!
 }
 if(record)next.reference=`WINTER-CREDENTIALS-${app.digest.slice(0,32)}`
 next.accountChecked=false
 return readApplicationDraft(next)
}
