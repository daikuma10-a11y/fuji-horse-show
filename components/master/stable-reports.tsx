"use client"
import { bookletHeaders, bookletExplanation, type BookletRow, type UnsettledRow } from '@/lib/master/stable-reports'
import { UnsettledReport } from './unsettled-report'
import { usePrintDocument } from './use-print-document'
import { fitStableChecklistNames } from '@/lib/master/stable-information'
const button = 'min-h-14 rounded-xl bg-primary px-5 py-3 text-lg font-bold text-primary-foreground disabled:opacity-50'
const cell = 'border p-2 text-left align-top'

export function MasterStableReports({ booklets, unsettled, loading, error, unsettledLoading, unsettledError, bookletLoading = false, bookletError = '', followupStorageKey, loadBookletPrint, loadUnsettledPrint }: {
  followupStorageKey: string; bookletLoading?:boolean; bookletError?:string; booklets: BookletRow[]; unsettled: UnsettledRow[]; loading: boolean; error: string; unsettledLoading: boolean; unsettledError: string
  loadBookletPrint: () => Promise<string>; loadUnsettledPrint: () => Promise<string>
}) {
  const printer = usePrintDocument()
  return <div className="space-y-5">
    <section className="space-y-3 rounded-xl border-2 bg-card p-4" aria-label="手帳チェック">
      <h3 className="text-xl font-bold">手帳チェック</h3><p>{bookletExplanation}</p>
      <button className={button} type="button" disabled={printer.busy || loading || bookletLoading || !!error || !!bookletError || !booklets.length} onClick={() => void printer.print(loadBookletPrint, '縦', fitStableChecklistNames)}>手帳チェックを印刷</button>
      {(loading || bookletLoading)&&<p role="status">最新の入退厩予定を確認しています…</p>}{bookletError&&<p role="alert" className="rounded-lg bg-red-50 p-3 text-red-800">{bookletError}</p>}
      {!loading && !bookletLoading && !error && !bookletError && <>
        <p>{booklets.length}団体 ／ {booklets.reduce((sum, row) => sum + row.count, 0)}頭</p>
        <div className="overflow-x-auto"><table className="w-full border-collapse text-sm">
          <thead><tr>{bookletHeaders.map(label => <th className={`${cell} whitespace-nowrap`} key={label}>{label}</th>)}</tr></thead>
          <tbody>{booklets.map((row, i) => <tr key={row.id}>
            <td className={cell}>{i+1}</td><td className={`${cell} whitespace-nowrap`}>{row.name}</td>
            <td className={cell}>{row.received}</td><td className={cell}>{row.count}</td>
            <td className={cell}>{row.arrival}</td><td className={cell}>{row.departure}</td>
            <td className={cell}>{row.returned}</td><td className={`${cell} w-[21%] min-w-48 [overflow-wrap:anywhere]`}>{row.notes}</td>
          </tr>)}</tbody>
        </table></div>
      </>}
    </section>
    <UnsettledReport rows={unsettled} storageKey={followupStorageKey} loading={loading || unsettledLoading}
      error={error || unsettledError} printing={printer.busy} onPrint={() => void printer.print(loadUnsettledPrint, '縦')}/>
    {printer.notice && <p role="status">{printer.notice}</p>}{printer.error && <p role="alert" className="rounded-lg bg-red-50 p-3 font-bold text-red-800">{printer.error}</p>}
  </div>
}
