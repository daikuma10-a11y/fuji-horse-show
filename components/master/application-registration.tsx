'use client'

import type {IdentityCandidate} from '@/lib/master/application'

type ResultRow={key:string;label:string;state:string;id?:string;issues:string[]}
export type ApplicationRegistrationPanelProps={
 busy:boolean;running:boolean;frozen:boolean;hasCheckpoint:boolean;hasPlan:boolean;ready:boolean
 complete?:boolean;onStartlist?:()=>void;onSettlement?:()=>void;onNext?:()=>void
 canReview:boolean;canOpenSaved:boolean;accepted:boolean;singleOperator:boolean
 reference:string;originalTotal:string;paid:string;participantState:string;savedSummary:string;message:string;error:string
 people:(ResultRow&{resolve:boolean;candidates:IdentityCandidate[];selected:string})[]
 entries:(ResultRow&{fee:number|null})[]
 onReview:()=>void;onRun:()=>void;onStop:()=>void;onAccepted:(v:boolean)=>void;onSingleOperator:(v:boolean)=>void
 onChoice:(key:string,id:string)=>void;onResolve:(key:string)=>void
 onOpenSaved:()=>void;onRestoreFile:(file:File)=>void;onDownload:()=>void;onClose:()=>void
}
const buttonBase='min-h-14 rounded-xl border-2 border-blue-800 px-4 py-3 text-lg font-bold disabled:opacity-40'
const button=buttonBase+' bg-white text-blue-900'
const primaryButton=buttonBase+' bg-blue-800 text-white'
const cell='border border-slate-300 p-3 align-top'
export function MasterApplicationRegistration(p:ApplicationRegistrationPanelProps){
 const existing=p.entries.filter(r=>r.state==='登録済み').length,remaining=p.entries.length-existing
 const extra=p.entries.filter(r=>r.state!=='登録済み').reduce((sum,r)=>sum+(r.fee??0),0)
 return <section id="application-registration" tabIndex={-1} aria-label="申込書の確定登録と再開" className="space-y-4 rounded-xl border-2 border-blue-800 p-5">
  <h3 className="text-2xl font-bold">{p.complete?'④ 取り込み結果':'③ 確認した内容を取り込む'}</h3>
  <p>{p.complete?'今回のExcelの出番はすべて登録済みです。重複して取り込む必要はありません。':'②で内容を確認した後、ここで取込対象を確認します。取り込むボタンを押すと出番表と精算の請求に反映します。'}</p>
  {!p.hasPlan&&!p.frozen&&<p className="rounded-lg bg-blue-50 p-3">まず②の確認箇所を直して「取込内容を確認する」を押してください。</p>}
  <details className="rounded-lg border p-3"><summary className="cursor-pointer font-bold">以前の取り込みを再開する</summary>
  <div className="flex flex-wrap gap-3">
   <button type="button" className={button} disabled={p.busy||!p.canOpenSaved} onClick={p.onOpenSaved}>この資料番号の登録途中を開く</button>
   <label className={button}>登録再開JSONを開く<input type="file" accept=".json" className="block max-w-full text-base" disabled={p.busy} onChange={e=>{const f=e.target.files?.[0];e.target.value='';if(f)p.onRestoreFile(f)}}/></label>
  </div>
  <p className="mt-3">同じ端末では資料番号から再開できます。別の端末では最新の登録再開JSONを開いてください。</p></details>
  {p.frozen&&<p className="rounded-lg bg-amber-50 p-3 font-semibold">登録再開記録を開いています。確定時の入力は固定しています。訂正版は上のExcel読込から差分だけを確認し、既存登録を変更・削除しません。</p>}
  <button type="button" className={button} disabled={p.busy||!p.canReview} onClick={p.onReview}>{p.frozen||p.hasPlan?'登録結果を再確認':'既存登録との照合（内容確認後）'}</button>
  {p.error&&<p role="alert" className="whitespace-pre-wrap rounded-lg bg-red-100 p-4">{p.error}</p>}
  {p.message&&<p role="status" className="whitespace-pre-wrap rounded-lg bg-blue-50 p-4">{p.message}</p>}
  {(p.hasPlan||p.hasCheckpoint)&&<>
   <p className="text-sm break-all">資料番号：{p.reference} ／ {p.hasPlan?'最新の照合結果':'この端末の保存記録・未再照合'}</p>
   {p.hasPlan&&<div className={`rounded-xl border-2 p-4 ${p.complete?'border-emerald-700 bg-emerald-50':'border-blue-700 bg-blue-50'}`}><p className="text-xl font-bold">登録済み {existing}件 ／ {p.ready?'今回取り込む':'要確認・未登録'} {remaining}件</p><p>登録済みの同じ出番は追加請求しません。{p.ready&&remaining>0?`今回追加するエントリー料金：${extra.toLocaleString('ja-JP')}円。`:''}</p>{p.ready&&remaining>0&&<p>この金額はエントリー料金だけです。馬匹登録料と団体全体の請求は取り込み後に精算画面で確認してください。</p>}</div>}
   <div className="overflow-x-auto"><table className="w-full min-w-[650px] border-collapse"><caption className="mb-2 text-left text-xl font-bold">人馬の登録確認</caption><thead><tr>{['人馬','状態・登録番号','差分・結果不明の照合'].map(t=><th className={cell} key={t}>{t}</th>)}</tr></thead><tbody>{p.people.map(row=><tr key={row.key}>
    <td className={cell}>{row.label}</td><td className={cell}>{row.state}{row.id&&<details className="text-sm"><summary>登録番号</summary><p className="break-all">{row.id}</p></details>}</td>
    <td className={cell}>{row.issues.map((issue,i)=><p key={i}>{issue}</p>)}{row.resolve&&<>
     <p>自動再送はしません。名簿で保存結果を確認して、該当する人馬を選択してください。見つからない場合は既存の人馬登録欄で確認してください。</p>
     <label className="block">保存された人馬<select aria-label={`${row.key} 結果不明の対応`} className="my-2 min-h-12 w-full rounded-lg border-2 p-2" value={row.selected} disabled={p.busy||!p.hasPlan} onChange={e=>p.onChoice(row.key,e.target.value)}><option value="">確認して明示選択</option>{row.candidates.map(c=><option key={c.id} value={c.id}>{c.name} ／ {c.reading} ／ 日馬連 {c.jef||'空欄'} ／ {c.clubs.join('、')||'所属なし'} ／ {c.id}</option>)}</select></label>
     <button type="button" className={button} disabled={p.busy||!row.selected||!p.hasPlan} onClick={()=>p.onResolve(row.key)}>この人馬と照合して再開記録を保存</button>
    </>}</td>
   </tr>)}</tbody></table></div>
   <p>Winter参加登録：{p.participantState}</p>
   <div className="overflow-x-auto"><table className="w-full min-w-[650px] border-collapse"><caption className="mb-2 text-left text-xl font-bold">エントリーの登録確認</caption><thead><tr>{['競技・人馬','計算料金','状態・差分'].map(t=><th className={cell} key={t}>{t}</th>)}</tr></thead><tbody>{p.entries.map(row=><tr key={row.key}>
    <td className={cell}>{row.label}</td><td className={cell}>{row.fee===null?'未照合':`${row.fee.toLocaleString('ja-JP')}円`}</td><td className={cell}>{row.state}{row.id&&<details className="text-sm"><summary>登録番号</summary><p className="break-all">{row.id}</p></details>}{row.issues.map((issue,i)=><p key={i}>{issue}</p>)}</td>
   </tr>)}</tbody></table></div>
   <p>確認した原本請求総額：{p.originalTotal||'未確認'}円 ／ 別途確認した入金額：{p.paid||'未確認'}円。出番の計算額と分けて再開記録に保持します。入金処理は行いません。</p>
   {p.hasPlan&&!p.complete&&<>
    <label className="flex gap-3"><input type="checkbox" checked={p.accepted} disabled={p.busy||!p.ready} onChange={e=>p.onAccepted(e.target.checked)}/>原本・人馬の対応・所属・資格・料金と照合結果を確認しました。</label>
    <label className="flex gap-3"><input type="checkbox" checked={p.singleOperator} disabled={p.busy||!p.ready} onChange={e=>p.onSingleOperator(e.target.checked)}/>この申込はこの画面だけで登録し、人馬登録など別の画面・端末・管理者と同時に登録しません。</label>
    <p>別画面・別端末・別ブラウザーとの同時操作は自動では防げません。途中再開では保存済みを照合し、未登録の分だけを処理します。</p>
    <button type="button" className={primaryButton} disabled={p.busy||!p.ready||!p.accepted||!p.singleOperator} onClick={p.onRun}>{p.running?'取り込み中…':`確認した${remaining}件を取り込む`}</button>
   </>}
  </>}
  {p.complete&&<div className="flex flex-wrap gap-3">{p.onStartlist&&<button type="button" className={primaryButton} onClick={p.onStartlist}>出番表を見る</button>}{p.onSettlement&&<button type="button" className={button} onClick={p.onSettlement}>精算を見る</button>}<p className="w-full">請求への反映を確認できます。ここで確認した入金額は、精算の入金登録には使いません。</p></div>}
  {p.complete&&!p.hasCheckpoint&&p.onNext&&<button type="button" className={button} disabled={p.busy} onClick={p.onNext}>次の申込書へ（この端末に記録を保持）</button>}
  {p.running&&<button type="button" className={button+' border-red-800 !text-red-900'} onClick={p.onStop}>処理中の1件を確認して停止</button>}
  {p.hasCheckpoint&&<div className="space-y-3">
   <p>{p.savedSummary}。端末記録だけで完了とは判断せず、上の照合ボタンで現在の結果を確認してください。</p>
   <details className="rounded-lg border p-3"><summary className="cursor-pointer font-bold">別の端末で再開・ファイルに保存</summary><button type="button" className={button+' mt-3'} disabled={p.busy} onClick={p.onDownload}>原本・対応・途中結果を登録再開JSONに保存</button>
   <p>取り込みの進行状況はこの端末に保存します。別の端末に移る場合は、最新の登録再開JSONを保存して使ってください。ファイルには人馬名と金額が含まれます。</p></details>
   <button type="button" className={button} disabled={p.busy} onClick={p.onClose}>{p.complete?'次の申込書へ（この端末に記録を保持）':'この端末に保存して申込書を閉じる'}</button>
  </div>}
 </section>
}
