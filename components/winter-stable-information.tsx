"use client"
import { useEffect, useMemo, useRef, useState } from 'react'
import { MasterStableInformation } from './master/stable-information'
import { MasterStableReports } from './master/stable-reports'
import { loadWinterData } from '@/lib/winter-data'
import { WINTER_EVENT_NAME } from '@/lib/winter-event'
import { winterStableGroups } from '@/lib/winter-stable-information'
import { bookletRows, bookletPrintHtml, unsettledPrintHtml, type UnsettledRow } from '@/lib/master/stable-reports'
import { winterUnsettledRows } from '@/lib/winter-stable-reports'
import { loadWinterSettlement } from '@/lib/winter-settlement'
import { verifyAdminSession, type AdminSession } from '@/lib/supabase-rest'

type Data = Awaited<ReturnType<typeof loadWinterData>>
const printedAt = () => new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })
export function WinterStableInformation({ data, loading, error, session, onSession, active, revision }: {
  data: Data | null; loading: boolean; error: string; session: AdminSession; onSession: (session: AdminSession) => void; active: boolean; revision: number
}) {
  const view = useMemo(() => {
    try { return { groups: data ? winterStableGroups(data) : [], error: '' } }
    catch (reason) { return { groups: [], error: reason instanceof Error ? reason.message : '入厩情報を確認できません。' } }
  }, [data])
  const [unsettled, setUnsettled] = useState<UnsettledRow[]>([]), [ledgerLoading, setLedgerLoading] = useState(true), [ledgerError, setLedgerError] = useState('')
  const sessionRef = useRef(session); sessionRef.current = session
  useEffect(() => {
    if (!active || !data || loading || error) return
    let alive = true
    setLedgerLoading(true); setLedgerError(''); setUnsettled([])
    async function refresh() {
      try {
        const verified = await verifyAdminSession(sessionRef.current)
        if (!alive) return
        onSession(verified)
        const ledger = await loadWinterSettlement(verified.accessToken)
        if (alive) setUnsettled(winterUnsettledRows(data!, ledger))
      } catch (reason) { if (alive) setLedgerError(reason instanceof Error ? reason.message : '精算状況を取得できませんでした。') }
      finally { if (alive) setLedgerLoading(false) }
    }
    void refresh()
    return () => { alive = false }
  }, [active, data, loading, error, revision, onSession])
  const pending = loading || !data && !error, problem = error || view.error
  async function loadUnsettledPrint() {
    const verified = await verifyAdminSession(sessionRef.current)
    onSession(verified)
    const [fresh, ledger] = await Promise.all([loadWinterData(), loadWinterSettlement(verified.accessToken)])
    return unsettledPrintHtml(winterUnsettledRows(fresh, ledger), WINTER_EVENT_NAME, printedAt())
  }
  return <MasterStableInformation groups={view.groups} eventName={WINTER_EVENT_NAME} loading={pending} error={problem} loadForPrint={async () => winterStableGroups(await loadWinterData())}
    reports={<MasterStableReports booklets={bookletRows(view.groups)} unsettled={unsettled} loading={pending} error={problem} unsettledLoading={ledgerLoading} unsettledError={ledgerError}
      loadBookletPrint={async () => bookletPrintHtml(bookletRows(winterStableGroups(await loadWinterData())), WINTER_EVENT_NAME, printedAt())} loadUnsettledPrint={loadUnsettledPrint}/>}/>
}
