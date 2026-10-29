'use client'

import {stableDateLabel,type StableSchedule} from '@/lib/master/stable-schedule'
import {MasterApplicationImportStatus} from './application-import-status'
import {MasterFilePicker} from './file-picker'
import type {ApplicationImportFeedback} from '@/lib/master/application-import-status'
import {ApplicationAffiliationFields} from './application-affiliation'
import type {ApplicationPerson,IdentityCandidate,RosterAffiliationEdit} from '@/lib/master/application'

type IdentityCorrection={person:ApplicationPerson;accepted?:boolean;participantCount?:number;original?:ApplicationPerson;selected:string;club:string;candidates:IdentityCandidate[];affiliation:RosterAffiliationEdit;clubs:{id:string;name:string}[];currentClubs:{id:string;name:string}[]}
type ResultRow={key:string;label:string;state:string;id?:string;issues:string[]}
export type ApplicationRegistrationPanelProps={
 feedback?:ApplicationImportFeedback
 busy:boolean;running:boolean;frozen:boolean;hasCheckpoint:boolean;hasPlan:boolean;ready:boolean
 stable?:{needed:boolean;complete:boolean;expectation?:{value:StableSchedule}}
 credentials?:{key:string;name:string;kind:string;value:string;previous:string;saved:boolean}[]
 showAccountConfirmation?:boolean;hasCorrections?:boolean;reviewStale?:boolean;editError?:string
 onCorrectionAccepted?:(key:string,value:boolean)=>void;onSaveRoster?:(key:string)=>void;onUseOriginal?:(key:string)=>void
 onCorrectAffiliation?:(key:string,value:RosterAffiliationEdit)=>void
 accountChecked?:boolean;onAccountChecked?:(value:boolean)=>void;onRoster?:()=>void
 onCorrectPerson?:(key:string,patch:Partial<ApplicationPerson>)=>void;onCorrectChoice?:(key:string,id:string)=>void;onUseExisting?:(key:string,id:string)=>void
 rosterCorrectionCount?:number;complete?:boolean;onStartlist?:()=>void;onSettlement?:()=>void;onNext?:()=>void
 canReview:boolean;canOpenSaved:boolean;accepted:boolean;singleOperator:boolean
 reference:string;originalTotal:string;paid:string;participantState:string;savedSummary:string;message:string;error:string
 people:(ResultRow&{resolve:boolean;candidates:IdentityCandidate[];selected:string;correction?:IdentityCorrection})[]
 entries:(ResultRow&{fee:number|null})[]
 onReview:()=>void;onRun:()=>void;onStop:()=>void;onAccepted:(v:boolean)=>void;onSingleOperator:(v:boolean)=>void
 onChoice:(key:string,id:string)=>void;onResolve:(key:string)=>void
 onOpenSaved:()=>void;onRestoreFile:(file:File)=>void;onDownload:()=>void;onClose:()=>void
}
const buttonBase='min-h-14 rounded-xl border-2 border-blue-800 px-4 py-3 text-lg font-bold disabled:opacity-40'
const button=buttonBase+' bg-white text-blue-900'
const primaryButton=buttonBase+' bg-blue-800 text-white'
const cell='min-w-0 break-words border border-slate-300 p-3 align-top'
const table='w-full table-fixed border-collapse'
const resultRow='@max-[760px]:grid @max-[760px]:grid-cols-2'
const issueCell=cell+' @max-[760px]:col-span-2'
const input='mt-1 min-h-11 w-full min-w-0 max-w-full rounded-lg border-2 border-slate-400 bg-white p-2 text-base text-slate-950'

function IdentityCorrectionFields({value,p}:{value:IdentityCorrection;p:ApplicationRegistrationPanelProps}){
 const person=value.person,selected=value.candidates.find(c=>c.id===value.selected)
 const affiliation=value.affiliation,destination=affiliation.source==='application'?value.club:affiliation.source==='existing'?value.clubs.find(c=>c.id===affiliation.clubId)?.name??'':affiliation.clubName.trim()
 const afterClubs=[...new Set([...value.currentClubs.filter(c=>!affiliation.endClubIds.includes(c.id)).map(c=>c.name),...(destination?[destination]:[])])]
 const changed=(key:'name'|'reading'|'jef')=>!!selected&&person[key].trim()!==selected[key].trim()
 return <fieldset disabled={p.busy||p.frozen} className="mt-3 min-w-0 space-y-3 rounded-lg border-2 border-amber-500 bg-amber-50 p-3">
  <legend className="px-1 font-bold">この場で訂正</legend>
  <label className={`block rounded-lg p-2 ${!selected||destination&&!selected.clubs.includes(destination)?'bg-amber-200':'bg-white'}`}>対応する登録済みの人馬・所属
   <select aria-label={`${person.key} 照合結果の人馬選択`} className={input} value={value.selected} onChange={e=>p.onCorrectChoice?.(person.key,e.target.value)}>
    <option value="">選択してください</option><option value="new">新規登録（既存候補と別の人馬）</option>
    {value.candidates.map(c=><option key={c.id} value={c.id}>{c.name} ／ 日馬連 {c.jef||'なし'} ／ {c.clubs.join('、')||'所属なし'}</option>)}
   </select>
   {selected&&destination&&!selected.clubs.includes(destination)&&<span className="mt-1 block font-bold">選択した所属先「{destination}」への所属を追加します。クラブ間の移動なら、下で終了する旧所属も選んでください。</span>}
  </label>
  {selected&&<details className="rounded-lg border border-blue-300 bg-blue-50 p-2"><summary>保存済み名簿の内容を見る・入力へ戻す</summary><p>選択した名簿：{selected.name} ／ 読み {selected.reading||'記載なし'} ／ 日馬連 {selected.jef||'なし'}</p>
   <button type="button" className={button+' mt-2 !text-base'} onClick={()=>p.onUseExisting?.(person.key,selected.id)}>同じ人馬と確認し、名簿の表記を使う</button>
   <p className="mt-1 text-sm">今回の申込の名前・フリガナ・日馬連番号に反映します。Excel原本と保存済みの名簿は保持します。</p></details>}
  <div className="grid min-w-0 grid-cols-1 gap-2 @min-[900px]:grid-cols-2">{([['name','名前・馬名'],['reading','フリガナ'],['jef','日馬連番号']] as const).map(([key,label])=><label key={key} className={`block min-w-0 rounded-lg p-2 ${changed(key)?'bg-amber-200':'bg-white'}`}>{label}{changed(key)&&<span className="ml-1 text-sm font-bold">（名簿との表記差）</span>}
   <input aria-label={`${person.key} 照合結果の${label}`} className={input} maxLength={100} value={person[key]} placeholder={key==='jef'?'なし':undefined} onChange={e=>p.onCorrectPerson?.(person.key,{[key]:e.target.value})}/>
  </label>)}</div>
  <label className={`flex gap-2 rounded-lg p-2 ${person.jef&&!person.checked?'bg-amber-200':'bg-white'}`}><input type="checkbox" checked={person.checked} onChange={e=>p.onCorrectPerson?.(person.key,{checked:e.target.checked})}/>日馬連番号を確認済み{!person.jef?'（番号なし）':''}</label>
  <details className="text-sm"><summary>Excel原本の記載</summary><p>{value.original?.name} ／ 読み {value.original?.reading||'記載なし'} ／ 日馬連 {value.original?.jef||'なし'}</p><button type="button" className={button+' mt-2 !text-base'} onClick={()=>p.onUseOriginal?.(person.key)}>Excel原本の名前・読み・番号を入力へ戻す</button></details>
  {selected&&<ApplicationAffiliationFields personKey={person.key} applicationClub={value.club} affiliation={affiliation} clubs={value.clubs} currentClubs={value.currentClubs} onChange={v=>p.onCorrectAffiliation?.(person.key,v)}/>}
  {selected&&p.onSaveRoster&&<div className="space-y-3 rounded-lg border-2 border-blue-800 bg-white p-3">
   <h5 className="font-bold">既存名簿を正しい内容へ訂正して保存</h5>
   <dl className="space-y-2">{([['name','名前・馬名'],['reading','フリガナ'],['jef','日馬連番号']] as const).map(([key,label])=><div key={key} className={changed(key)?'rounded bg-amber-100 p-2':'p-2'}><dt className="font-bold">{label}</dt><dd>変更前：{selected[key]||'なし'} → 変更後：{person[key]||'なし'}</dd></div>)}<div className="p-2"><dt className="font-bold">所属</dt><dd>変更前：{selected.clubs.join('、')||'所属なし'} → 変更後：{afterClubs.join('、')||'未選択'}</dd></div></dl>
   <p>名前・番号は共通名簿とWinterに登録済みの同じ人馬 {value.participantCount??0}件へ反映します。出番・請求先・料金・入金は保持します。</p>
   <label className="flex gap-2 font-bold"><input type="checkbox" checked={!!value.accepted} onChange={e=>p.onCorrectionAccepted?.(person.key,e.target.checked)}/>同じ人馬の訂正であることと、変更前・変更後を確認しました</label>
   <button type="button" className={primaryButton+' w-full !text-base'} disabled={!value.accepted||!destination} onClick={()=>p.onSaveRoster?.(person.key)}>既存名簿を訂正・所属を保存</button>
  </div>}
  {!selected&&value.candidates.length>0&&<p className="rounded-lg bg-amber-200 p-2 font-bold">以前の名前や番号を直す場合は、新規登録ではなく上の候補から同じ人馬を選び、正しい内容を入力して「既存名簿を訂正・所属を保存」を押してください。</p>}
  <button type="button" className="block text-left underline" onClick={()=>{const target=document.getElementById(`application-person-${encodeURIComponent(person.key)}`);target?.scrollIntoView({block:'center',behavior:'smooth'});target?.focus({preventScroll:true})}}>この人馬の資格・会員区分・グレードも確認する（②へ）</button>
 </fieldset>
}
export function MasterApplicationRegistration(p:ApplicationRegistrationPanelProps){
 const existing=p.entries.filter(r=>r.state==='登録済み').length,remaining=p.entries.length-existing
 const extra=p.entries.filter(r=>r.state!=='登録済み').reduce((sum,r)=>sum+(r.fee??0),0)
 return <section id="application-registration" tabIndex={-1} aria-label="申込書の確定登録と再開" className="master-action-surface space-y-4 rounded-xl border-2 border-blue-800 p-5">
  <h3 className="text-2xl font-bold">{p.complete?'④ 取り込み結果':'③ 確認した内容を取り込む'}</h3>
  <p>{p.complete?'今回のExcelの出番はすべて登録済みです。重複して取り込む必要はありません。':'②で内容を確認した後、ここで取込対象を確認します。取り込むボタンを押すと出番表と精算の請求に反映します。'}</p>
  {!p.hasPlan&&!p.frozen&&!p.hasCorrections&&!p.reviewStale&&<p className="rounded-lg bg-blue-50 p-3">まず②の確認箇所を直して「取込内容を確認する」を押してください。</p>}
  <details className="rounded-lg border p-3"><summary className="cursor-pointer font-bold">以前の取り込みを再開する</summary>
  <div className="flex flex-wrap gap-3">
   <button type="button" className={button} disabled={p.busy||!p.canOpenSaved} onClick={p.onOpenSaved}>この資料番号の登録途中を開く</button>
   <MasterFilePicker label="登録再開JSONを選んで開く" accept=".json" disabled={p.busy} hint="登録途中に保存したJSONを選ぶと、その内容を開きます。" onFiles={files=>{const f=files[0];if(f)p.onRestoreFile(f)}}/>
  </div>
  <p className="mt-3">同じ端末では資料番号から再開できます。別の端末では最新の登録再開JSONを開いてください。</p></details>
  {p.frozen&&<p className="rounded-lg bg-amber-50 p-3 font-semibold">登録再開記録を開いています。確定時の入力は固定しています。訂正版は上のExcel読込から差分だけを確認し、既存登録を変更・削除しません。</p>}
  <button type="button" className={button} disabled={p.busy||!p.canReview} onClick={p.onReview}>{p.hasCorrections?'訂正内容を再照合する':p.frozen||p.hasPlan?'登録結果を再確認':'既存登録との照合（内容確認後）'}</button>
  {p.error&&p.feedback?.state!=='error'&&<p role="alert" className="whitespace-pre-wrap rounded-lg bg-red-100 p-4">{p.error}</p>}
  {p.message&&<p role="status" className="whitespace-pre-wrap rounded-lg bg-blue-50 p-4">{p.message}</p>}
  {p.editError&&(p.hasCorrections||p.reviewStale)&&<p role="alert" className="rounded-lg bg-red-100 p-3">{p.editError}</p>}
  {p.reviewStale&&<p role="status" className="rounded-lg bg-amber-100 p-3 font-bold">入力を変更しました。表の黄色い欄で訂正を続け、下の「訂正内容を再照合する」を押してください。前回の確認事項は再照合まで残しています。</p>}
  {(p.hasPlan||p.hasCheckpoint||p.hasCorrections||p.reviewStale)&&<>
   <p className="text-sm break-all">資料番号：{p.reference} ／ {p.hasPlan?'最新の照合結果':p.reviewStale?'訂正中・未再照合':'この端末の保存記録・未再照合'}</p>
   {p.hasPlan&&<div className={`rounded-xl border-2 p-4 ${p.complete?'border-emerald-700 bg-emerald-50':'border-blue-700 bg-blue-50'}`}><p className="text-xl font-bold">登録済み {existing}件 ／ {p.ready?'今回取り込む':'要確認・未登録'} {remaining}件</p><p>登録済みの同じ出番は追加請求しません。{p.ready&&remaining>0?`今回追加するエントリー料金：${extra.toLocaleString('ja-JP')}円。`:''}</p>{p.ready&&remaining>0&&<p>この金額はエントリー料金だけです。馬匹登録料と団体全体の請求は取り込み後に精算画面で確認してください。</p>}</div>}
   {!!p.rosterCorrectionCount&&<p className="rounded-lg border-2 border-blue-700 bg-blue-50 p-3 font-bold">人馬の仮確定で確認した名簿の訂正 {p.rosterCorrectionCount}件を先に保存し、保存結果を確認してから出番を取り込みます。</p>}
   <div className="@container min-w-0"><table className={table}><caption className="mb-2 text-left text-xl font-bold">人馬の登録確認・訂正</caption><colgroup><col style={{width:'18%'}}/><col style={{width:'18%'}}/><col style={{width:'64%'}}/></colgroup><thead className="@max-[760px]:hidden"><tr>{['人馬','状態・登録番号','差分・結果不明の照合'].map(t=><th className={cell} key={t}>{t}</th>)}</tr></thead><tbody>{p.people.map(row=><tr key={row.key} className={resultRow}>
    <td className={cell}>{row.label}</td><td className={cell}>{row.state}{row.id&&<details className="text-sm"><summary>登録番号</summary><p className="break-all">{row.id}</p></details>}</td>
    <td className={issueCell}>{p.reviewStale&&row.issues.length>0&&<p className="font-bold">前回の確認事項</p>}{row.issues.map((issue,i)=><p key={i} className="mb-2 rounded-lg bg-amber-100 p-2">{issue}</p>)}{row.correction&&!p.frozen&&<details open={row.issues.length>0||p.reviewStale||undefined}><summary className="cursor-pointer font-bold">名簿の名前・番号・所属を訂正する</summary><IdentityCorrectionFields value={row.correction} p={p}/></details>}
    {row.resolve&&<>
     <p>自動再送はしません。名簿で保存結果を確認して、該当する人馬を選択してください。見つからない場合は既存の人馬登録欄で確認してください。</p>
     <label className="block">保存された人馬<select aria-label={`${row.key} 結果不明の対応`} className="my-2 min-h-12 w-full rounded-lg border-2 p-2" value={row.selected} disabled={p.busy||!p.hasPlan} onChange={e=>p.onChoice(row.key,e.target.value)}><option value="">確認して明示選択</option>{row.candidates.map(c=><option key={c.id} value={c.id}>{c.name} ／ {c.reading} ／ 日馬連 {c.jef.trim()||'なし'} ／ {c.clubs.join('、')||'所属なし'} ／ {c.id}</option>)}</select></label>
     <button type="button" className={button} disabled={p.busy||!row.selected||!p.hasPlan} onClick={()=>p.onResolve(row.key)}>この人馬と照合して再開記録を保存</button>
    </>}</td>
   </tr>)}</tbody></table></div>
   {(p.hasCorrections||p.showAccountConfirmation)&&<div className="space-y-3 rounded-lg border-2 border-blue-800 bg-blue-50 p-4">
    <p>原本請求総額：{p.originalTotal||'未確認'}円 ／ 別途確認した入金額：{p.paid||'未確認'}円</p>
    <label className="flex gap-2"><input type="checkbox" checked={!!p.accountChecked} disabled={p.busy} onChange={e=>p.onAccountChecked?.(e.target.checked)}/>訂正後の原本請求額と、別途確認した入金額を確認しました</label>
    <button type="button" className={primaryButton} disabled={p.busy||!p.canReview} onClick={p.onReview}>訂正内容を再照合する</button>
    <p>資格・競技・料金にも確認事項がある場合は、②の黄色い欄を確認してください。</p>
   </div>}
   {p.frozen&&p.onRoster&&p.people.some(r=>r.issues.length>0)&&<div className="rounded-lg border p-3"><p>選択した名簿自体の名前・番号・所属が違う場合はこちら。訂正後は「Excel申込書の取り込み」へ戻り、③で再照合してください。</p><button type="button" className={button+' mt-2'} disabled={p.busy} onClick={p.onRoster}>名簿の所属を確認・訂正する</button><p className="text-sm">現在の申込内容をこの端末に保存して移動します。</p></div>}
   {p.stable?.needed&&p.stable.expectation&&<div className="rounded-lg border p-3"><h4 className="text-lg font-bold">手帳チェックに保存する入退厩予定{p.stable.complete?'（保存済み）':''}</h4><p>入厩：{stableDateLabel(p.stable.expectation.value.arrivalDate,p.stable.expectation.value.arrivalTime)||'未記載'}</p><p>退厩：{stableDateLabel(p.stable.expectation.value.departureDate,p.stable.expectation.value.departureTime)||'未記載'}</p>{p.stable.expectation.value.notes&&<p className="whitespace-pre-wrap">{p.stable.expectation.value.notes}</p>}</div>}
   {p.credentials&&<div className="rounded-lg border border-slate-300 p-3"><h4 className="text-lg font-bold">団体別一覧に保存する資格・グレード</h4><ul className="mt-2 space-y-2">{p.credentials.map(c=><li key={c.key}>{c.name} ／ {c.kind==='rider'?'所有資格級':'グレード宣言'}：{c.value?(c.saved?`${c.value}（保存済み）`:c.previous?`保存済み ${c.previous} → 今回 ${c.value}`:`今回 ${c.value} を保存`):c.previous?`${c.previous}（今回の原本は空欄・保存済みを保持）`:'記載なし・未確認'}</li>)}</ul><p className="mt-2 text-sm">申込書で確認した値を保存します。日馬連マスターの登録内容を変更する操作ではありません。</p></div>}
   {!p.reviewStale&&<><p>Winter参加登録：{p.participantState}</p>
   <div className="@container min-w-0"><table className={table}><caption className="mb-2 text-left text-xl font-bold">エントリーの登録確認</caption><colgroup><col style={{width:'54%'}}/><col style={{width:'18%'}}/><col style={{width:'28%'}}/></colgroup><thead className="@max-[760px]:hidden"><tr>{['競技・人馬','計算料金','状態・差分'].map(t=><th className={cell} key={t}>{t}</th>)}</tr></thead><tbody>{p.entries.map(row=><tr key={row.key} className={resultRow}>
    <td className={cell}>{row.label}</td><td className={cell}>{row.fee===null?'未照合':`${row.fee.toLocaleString('ja-JP')}円`}</td><td className={issueCell}>{row.state}{row.id&&<details className="text-sm"><summary>登録番号</summary><p className="break-all">{row.id}</p></details>}{row.issues.map((issue,i)=><p key={i}>{issue}</p>)}</td>
   </tr>)}</tbody></table></div>
   <p>確認した原本請求総額：{p.originalTotal||'未確認'}円 ／ 別途確認した入金額：{p.paid||'未確認'}円。出番の計算額と分けて再開記録に保持します。入金処理は行いません。</p></>}
   {p.hasPlan&&!p.complete&&<>
    <label className="flex gap-3"><input type="checkbox" checked={p.accepted} disabled={p.busy||!p.ready} onChange={e=>p.onAccepted(e.target.checked)}/>原本・人馬の対応・名簿の訂正・所属・資格・グレード宣言・料金と照合結果を確認しました。</label>
    <label className="flex gap-3"><input type="checkbox" checked={p.singleOperator} disabled={p.busy||!p.ready} onChange={e=>p.onSingleOperator(e.target.checked)}/>この申込はこの画面だけで登録し、人馬登録など別の画面・端末・管理者と同時に登録しません。</label>
    <p>別画面・別端末・別ブラウザーとの同時操作は自動では防げません。途中再開では保存済みを照合し、未登録の分だけを処理します。</p>
    <button type="button" className={primaryButton} disabled={p.busy||!p.ready||!p.accepted||!p.singleOperator} onClick={p.onRun}>{p.running?'反映中…':remaining?`確認した${remaining}件を取り込む`:p.rosterCorrectionCount?'仮確定した人馬名簿の訂正を保存する':'確認した資格・グレードを保存する'}</button>
   </>}
  </>}
  {p.feedback&&<MasterApplicationImportStatus value={p.feedback} onReview={p.onReview} canReview={p.canReview} busy={p.busy} onStop={p.onStop}/>}
  {p.complete&&<div className="flex flex-wrap gap-3"><button type="button" disabled className="min-h-14 w-full rounded-xl border-2 border-emerald-700 bg-emerald-50 p-3 text-xl font-bold text-emerald-900">✓ 反映完了</button>{p.onStartlist&&<button type="button" className={primaryButton} disabled={p.busy} onClick={p.onStartlist}>出番表を見る</button>}{p.onSettlement&&<button type="button" className={button} disabled={p.busy} onClick={p.onSettlement}>精算を見る</button>}<p className="w-full">請求への反映を確認できます。ここで確認した入金額は、精算の入金登録には使いません。</p></div>}
  {p.complete&&!p.hasCheckpoint&&p.onNext&&<button type="button" className={button} disabled={p.busy} onClick={p.onNext}>次の申込書へ（この端末に記録を保持）</button>}
  {p.running&&!p.feedback&&<button type="button" className={button+' border-red-800 !text-red-900'} onClick={p.onStop}>処理中の1件を確認して停止</button>}
  {p.hasCheckpoint&&<div className="space-y-3">
   <p>{p.savedSummary}。端末記録だけで完了とは判断せず、上の照合ボタンで現在の結果を確認してください。</p>
   <details className="rounded-lg border p-3"><summary className="cursor-pointer font-bold">別の端末で再開・ファイルに保存</summary><button type="button" className={button+' mt-3'} disabled={p.busy} onClick={p.onDownload}>原本・対応・途中結果を登録再開JSONに保存</button>
   <p>取り込みの進行状況はこの端末に保存します。別の端末に移る場合は、最新の登録再開JSONを保存して使ってください。ファイルには人馬名と金額が含まれます。</p></details>
   <button type="button" className={button} disabled={p.busy} onClick={p.onClose}>{p.complete?'次の申込書へ（この端末に記録を保持）':'この端末に保存して申込書を閉じる'}</button>
  </div>}
 </section>
}
