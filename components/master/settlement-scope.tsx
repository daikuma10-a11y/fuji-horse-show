"use client"
import {MasterConfirmationPaper} from './self-settlement'
import type {MasterSavedSettlement} from '@/lib/master/self-settlement'
import type {StatementScope,StatementPayment} from '@/lib/master/settlement-scope'

export type MasterStatementScopeProps={
 dates:string[];payments:StatementPayment[];scope:StatementScope;record:MasterSavedSettlement|null
 busy:boolean;disabled?:boolean;error:string
 onScope:(scope:StatementScope)=>void;onPreview:()=>void;onPrint:()=>void;onExcel:()=>void
}
const button='min-h-12 rounded-xl border-2 bg-white px-4 py-3 text-lg font-bold disabled:opacity-50'
export function MasterStatementScope({dates,payments,scope,record,busy,disabled,error,onScope,onPreview,onPrint,onExcel}:MasterStatementScopeProps){
 return <section className="space-y-3 rounded-xl border-2 border-blue-300 bg-blue-50 p-4" aria-label="日付・入金後の明細">
  <h3 className="text-xl font-bold">日付・入金後の明細</h3>
  <p>一度精算した後の追加・変更は、競技日と前回の入金を選んで明細を作れます。事前エントリー・馬匹登録料は含みません。</p>
  <fieldset className="grid gap-3 md:grid-cols-2" disabled={busy||disabled}>
   <label className="font-bold">対象の競技日<select className="mt-2 min-h-12 w-full rounded-xl border-2 bg-white p-3" value={scope.date} onChange={e=>onScope({...scope,date:e.target.value})}>
    <option value="">全競技日</option>{dates.map(date=><option key={date} value={date}>{date.replaceAll('-','/')}</option>)}
   </select></label>
   <label className="font-bold">どの入金後の追加・変更を出すか<select className="mt-2 min-h-12 w-full rounded-xl border-2 bg-white p-3" value={scope.paymentId} onChange={e=>onScope({...scope,paymentId:e.target.value})}>
    <option value="">全履歴（入金前も含む）</option>{payments.map(payment=><option key={payment.id} value={payment.id}>{payment.label} の後</option>)}
   </select></label>
  </fieldset>
  <p className="text-sm">競技日は変更先の日付です。入金後に本部へ反映した分が対象です。明細の作成・印刷では、入金や精算内容を変更しません。</p>
  <button type="button" className={button} disabled={busy||disabled} onClick={onPreview}>{busy?'明細を確認中…':'対象の明細を確認'}</button>
  {error&&<p role="alert" className="rounded-lg bg-red-100 p-3">{error}</p>}
  {record&&<div className="space-y-3 rounded-xl bg-white p-4">
   {record.document.warnings.map((warning,i)=><p role="alert" key={i} className="rounded-lg bg-amber-100 p-3">{warning}</p>)}
   {!record.document.document.lines.length&&<p role="status" className="font-bold">この範囲の追加・変更はまだありません。登録・本部反映後に「対象の明細を確認」を押してください。</p>}
   <p>対象明細合計は、この範囲の料金です。未払い額は「団体全体のお支払い残額」で確認してください。</p>
   <div className="flex flex-wrap gap-3"><button type="button" className={button} disabled={busy||disabled} onClick={onPrint}>この明細を印刷</button><button type="button" className={button} disabled={busy||disabled} onClick={onExcel}>この明細をExcelに保存</button></div>
   <div className="self-settlement-confirmation overflow-x-auto"><MasterConfirmationPaper record={record}/></div>
  </div>}
 </section>
}
