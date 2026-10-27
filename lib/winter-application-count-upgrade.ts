import type {Application} from './master/application'
import {readApplicationDraft,type ApplicationDraft} from './winter-application-draft'

/** Same-file read supplements old review drafts, never a frozen registration checkpoint. */
export function upgradeApplicationCounts(draft:ApplicationDraft,app:Application,frozen=false):ApplicationDraft|null{
 if(frozen||draft.original.digest!==app.digest||draft.original.entryCounts!==undefined||app.entryCounts===undefined)return null
 if(JSON.stringify(draft.original.entries)!==JSON.stringify(app.entries))throw new Error('原本の出場者欄が一致しないため集計人数を追加できません。元の確認記録を保持してください。')
 const next=structuredClone(draft)
 next.original.entryCounts=structuredClone(app.entryCounts);next.edited.entryCounts=structuredClone(app.entryCounts)
 next.accountChecked=false
 return readApplicationDraft(next)
}
