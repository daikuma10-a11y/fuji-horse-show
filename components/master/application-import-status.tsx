'use client'
import type {ApplicationImportFeedback} from '@/lib/master/application-import-status'
const phases={checking:'保存前の確認',roster:'名簿の訂正',people:'人馬の登録',participation:'大会への参加登録',credentials:'資格・グレードの保存',entries:'出番・請求への反映',verifying:'保存結果の最終確認'}
export function MasterApplicationImportStatus({value,onReview,canReview,busy,onStop}:{value:ApplicationImportFeedback;onReview:()=>void;canReview:boolean;busy:boolean;onStop?:()=>void}){
 const active=value.state==='running',success=value.state==='success',problem=['error','attention','stopped'].includes(value.state),p=value.progress
 const title=active?(value.stopRequested?'停止を受け付けました':value.operation==='review'?'保存結果を確認中…':'反映中…'):success?'反映完了':value.state==='ready'?'確認完了・まだ反映していません':value.state==='stopped'?'途中で停止しました':value.state==='error'?(value.operation==='save'?'反映を完了できませんでした':'保存結果を確認できませんでした'):'未完了・確認が必要です'
 const color=success?'border-emerald-700 bg-emerald-50 text-emerald-950':value.state==='error'?'border-red-700 bg-red-50 text-red-950':problem?'border-amber-600 bg-amber-50 text-amber-950':'border-blue-700 bg-blue-50 text-blue-950'
 return <div id="application-import-status" tabIndex={-1} className={`${active?'fixed inset-x-3 bottom-3 z-50 mx-auto max-w-3xl max-h-[75dvh] overflow-y-auto shadow-2xl':'scroll-mt-24'} space-y-3 whitespace-pre-wrap rounded-xl border-2 p-4 sm:p-5 ${color}`}>
  <div role={value.state==='error'?'alert':'status'} aria-live={value.state==='error'?'assertive':'polite'} aria-atomic="true">
   <h4 className="flex items-center gap-3 text-2xl font-bold sm:text-3xl">{active?<span aria-hidden="true" className="size-6 shrink-0 animate-spin rounded-full border-4 border-blue-300 border-t-blue-800 motion-reduce:animate-none"/>:<span aria-hidden="true">{success?'✓':problem?'!':'○'}</span>}{title}</h4>
   <p className="mt-2 font-bold">{active?(value.stopRequested?'処理中の1件の保存結果を確認してから停止します。':value.operation==='review'?'登録済みの内容を読み直しています。新しい登録は行っていません。':phases[p.phase]):value.detail}</p>
   {active&&!value.stopRequested&&<p className="mt-1 break-words">{p.detail}</p>}
  </div>
  <p className="font-semibold">人馬の保存確認 {p.peopleConfirmed} / {p.peopleTotal}件　出番の保存確認 {p.entriesConfirmed} / {p.entriesTotal}件</p>
  {p.entriesTotal>0&&<progress className="block h-3 w-full accent-blue-700" aria-label="出番の保存確認済み件数（既存登録を含む）" max={p.entriesTotal} value={p.entriesConfirmed}/>}
  <p className="text-sm">件数には既存の登録も含みます。{active?'画面を閉じずにお待ちください。全件の保存結果を確認してから「反映完了」と表示します。':''}</p>
  {value.checkedAt&&<p className="text-sm">保存結果の確認時刻：{new Date(value.checkedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo',hour12:false})}</p>}
  {active&&value.operation==='save'&&onStop&&<button type="button" disabled={value.stopRequested} onClick={onStop} className="min-h-11 rounded-lg border-2 border-current bg-white px-3 py-2 font-bold disabled:opacity-50">{value.stopRequested?'停止処理中…':'処理中の1件を確認して停止'}</button>}
  {problem&&<><p>保存済みの分は再登録せず、まず保存結果を確認してください。</p><button type="button" disabled={busy||!canReview} onClick={onReview} className="min-h-12 w-full rounded-lg border-2 border-current bg-white px-4 py-3 text-lg font-bold disabled:opacity-40">保存結果を確認する</button></>}
 </div>
}
