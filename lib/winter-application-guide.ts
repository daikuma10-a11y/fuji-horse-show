import type {ApplicationDraft} from './winter-application-draft'
import type {ApplicationSnapshot} from './winter-application-registration'
import type {ApplicationTodo,ApplicationClubSummary} from './master/application-guide'
import {applicationPersonTarget,applicationEntryTarget} from './master/application-guide'
import {applicationReview,normalizeApplicationName} from './winter-application'

/** Map validation back to the Excel row and the editable control, without relaxing any gate. */
export function applicationTodos(d:ApplicationDraft,rosterLoaded:boolean):ApplicationTodo[]{
 const app=d.edited,review=applicationReview(app,d.paid,d.accountChecked),items:ApplicationTodo[]=[]
 const add=(label:string,message:string,target:string,blocking=true)=>items.push({label,message,target,blocking})
 for(const message of app.issues)add('Excel原本',message,'application-source')
 if(!rosterLoaded)add('既存登録の確認','登録済みの団体・人馬を読み込んでください。','application-club')
 for(const p of app.people)if(!d.choices[p.key])add(p.name||'名前未入力','既存の人馬を選ぶか、新規登録を選んでください。',applicationPersonTarget(p.key))
 if(!d.reference.trim())add('資料番号','自動発行された資料番号を入力してください。','application-reference')
 for(const issue of review.report.issues){
  const person=issue.section==='名簿'?app.people[issue.row-3]:undefined
  const entry=issue.section==='出番表'?app.entries[issue.row-2]:undefined
  add(person?.name??(entry?`${entry.origin.sheet}!${entry.origin.cell}・第${entry.competition}競技`:issue.section),issue.message,
   person?applicationPersonTarget(person.key):entry?applicationEntryTarget(entry.key):issue.section==='事前精算'?'application-payment':'application-club',issue.severity==='error')
 }
 for(const row of review.amounts)if(row.reason)add(row.label,row.reason,`application-amount-${row.key}`)
 if(!app.entries.length)add('エントリー','Excelに出場する人馬が入力されているか確認してください。','application-entries')
 return items
}

/** An existing club is distinct from a confirmed identity or a registered entry. Never name-merge. */
export function applicationClubSummary(d:ApplicationDraft,s:ApplicationSnapshot):ApplicationClubSummary{
 const name=d.edited.club.trim(),clubs=s.roster.clubs.filter(c=>c.name===name),orgs=s.data.organizations.filter(o=>o.name===name)
 if(clubs.length>1||orgs.length>1)return {state:'ambiguous',label:'同名の団体が複数あります',detail:'人馬の登録画面で団体を確認してください。自動では統合しません。',entries:[]}
 const club=clubs[0],org=orgs[0],participants=s.roster.participants.filter(p=>p.club_id===club?.id)
 const entries=org?s.data.entries.filter(e=>e.organization_id===org.id).map(e=>({id:e.entry_id,
  label:`第${e.competition_no}競技 ／ ${s.data.riders.find(r=>r.id===e.rider_id)?.name??'選手未確認'} ／ ${s.data.horses.find(h=>h.id===e.horse_id)?.name??'馬未確認'}${e.is_op?' ／ OP':''}`,
  status:['wd','withdrawn'].includes(e.status.toLowerCase())?'棄権済み':'登録済み'})):[]
 if(org||participants.length)return {state:'registered',label:'この団体はWinterに登録済みです',detail:`既存の出番 ${entries.length}件。今回のExcelと照合し、同じ出番は重複登録しません。`,entries}
 if(club)return {state:'known',label:'共通名簿に登録済みの団体です',detail:'Winterの参加登録はまだありません。既存の人馬を確認して選んでください。',entries}
 const similar=s.roster.clubs.some(c=>normalizeApplicationName(c.name)===normalizeApplicationName(name))||s.data.organizations.some(o=>normalizeApplicationName(o.name)===normalizeApplicationName(name))
 return similar?{state:'ambiguous',label:'表記の似た登録済み団体があります',detail:'団体名の空白・全半角などを確認してください。別団体としての作成は照合後に判断します。',entries:[]}:
  {state:'new',label:'登録済みの団体は見つかりません',detail:'団体名と所属を確認してください。取り込み時に新規登録します。',entries:[]}
}
