"use client"
import { useEffect, useMemo, useRef, useState } from 'react'
import { MasterStableInformation } from './master/stable-information'
import {MasterStableScheduleEditor} from './master/stable-schedule-editor'
import {loadWinterStableSchedules,saveWinterStableSchedule,stableScheduleRequestId,type WinterStableSchedule} from '@/lib/winter-stable-schedules'
import {readWinterApplication} from '@/lib/winter-application'
import {emptyStableSchedule,sameStableSchedule,type StableSchedule} from '@/lib/master/stable-schedule'
import {WINTER_EVENT_ID} from '@/lib/winter-event'
import { MasterStableReports } from './master/stable-reports'
import { loadWinterData } from '@/lib/winter-data'
import { WINTER_EVENT_NAME } from '@/lib/winter-event'
import { winterStableGroups } from '@/lib/winter-stable-information'
import { bookletRows, bookletPrintHtml, unsettledPrintHtml, type UnsettledRow } from '@/lib/master/stable-reports'
import { winterUnsettledRows } from '@/lib/winter-stable-reports'
import { loadWinterSettlement } from '@/lib/winter-settlement'
import { verifyAdminSession, type AdminSession } from '@/lib/supabase-rest'
import { MasterStallAllocation } from './master/stall-allocation'
import { loadWinterStallPlan, saveWinterStallPlan } from '@/lib/winter-stall-allocation'

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
  const [schedules,setSchedules]=useState<WinterStableSchedule[]>([]),[scheduleLoading,setScheduleLoading]=useState(true),[scheduleError,setScheduleError]=useState('')
  const sessionRef = useRef(session); sessionRef.current = session
  useEffect(() => {
    if (!active || !data || loading || error) return
    let alive = true
    setLedgerLoading(true); setLedgerError(''); setUnsettled([])
    setScheduleLoading(true); setScheduleError('')
    async function refresh() {
      try {
        const verified = await verifyAdminSession(sessionRef.current)
        if (!alive) return
        onSession(verified)
        await Promise.all([
          loadWinterSettlement(verified.accessToken).then(ledger => { if (alive) setUnsettled(winterUnsettledRows(data!, ledger)) }).catch(reason => { if (alive) setLedgerError(reason instanceof Error ? reason.message : '精算状況を取得できませんでした。') }).finally(() => { if (alive) setLedgerLoading(false) }),
          loadWinterStableSchedules(verified.accessToken).then(rows => { if (alive) setSchedules(rows) }).catch(reason => { if (alive) setScheduleError(reason instanceof Error ? reason.message : '入退厩予定を取得できませんでした。') }).finally(() => { if (alive) setScheduleLoading(false) }),
        ])
      } catch (reason) {
        if (alive) { const message = reason instanceof Error ? reason.message : '本部ログインを確認できません'; setLedgerError(message); setScheduleError(message); setLedgerLoading(false); setScheduleLoading(false) }
      }
    }
    void refresh()
    return () => { alive = false }
  }, [active, data, loading, error, revision, onSession])
  async function reloadSchedules(){
    setScheduleLoading(true);setScheduleError('')
    try{const verified=await verifyAdminSession(sessionRef.current);onSession(verified);const rows=await loadWinterStableSchedules(verified.accessToken);setSchedules(rows);return rows}
    catch(reason){setScheduleError(reason instanceof Error?reason.message:'入退厩予定を取得できません');throw reason}
    finally{setScheduleLoading(false)}
  }
  async function saveSchedule(id:string,value:StableSchedule,expected:string|null){
    const org=data?.organizations.find(o=>o.id===id);if(!org)throw new Error('保存先の団体を確認できません')
    const reference='入厩情報で日時を補足・訂正',digest='0'.repeat(64),requestId=await stableScheduleRequestId(reference,digest,{expected,value},id)
    const verified=await verifyAdminSession(sessionRef.current);onSession(verified)
    let writeError:unknown
    try{await saveWinterStableSchedule({eventId:WINTER_EVENT_ID,organizationId:id,organizationName:org.name,requestId,expected,value,reference,digest},verified.accessToken)}catch(reason){writeError=reason}
    const after=await reloadSchedules(),saved=after.find(row=>row.organization_id===id)
    if(!saved||!sameStableSchedule(saved.value,value))throw new Error((writeError instanceof Error?writeError.message:'日時の保存結果を確認できません')+'。最新の保存内容を読み直して確認してください。')
  }
  async function loadBookletPrint(){
    const verified=await verifyAdminSession(sessionRef.current);onSession(verified)
    const [fresh,dates]=await Promise.all([loadWinterData(),loadWinterStableSchedules(verified.accessToken)])
    return bookletPrintHtml(bookletRows(winterStableGroups(fresh),dates.map(row=>({id:row.organization_id,value:row.value}))),WINTER_EVENT_NAME,printedAt())
  }
  const pending = loading || !data && !error, problem = error || view.error
  async function loadUnsettledPrint() {
    const verified = await verifyAdminSession(sessionRef.current)
    onSession(verified)
    const [fresh, ledger] = await Promise.all([loadWinterData(), loadWinterSettlement(verified.accessToken)])
    return unsettledPrintHtml(winterUnsettledRows(fresh, ledger), WINTER_EVENT_NAME, printedAt())
  }
  return <MasterStableInformation groups={view.groups} eventName={WINTER_EVENT_NAME} loading={pending} error={problem} loadForPrint={async () => winterStableGroups(await loadWinterData())}
    allocation={<MasterStallAllocation groups={view.groups} eventName={WINTER_EVENT_NAME} active={active&&!pending&&!problem} onLoad={async()=>{const verified=await verifyAdminSession(sessionRef.current);onSession(verified);const [fresh,saved]=await Promise.all([loadWinterData(),loadWinterStallPlan(verified.accessToken)]);return {groups:winterStableGroups(fresh),saved}}} onSave={async(plan,expected)=>{const verified=await verifyAdminSession(sessionRef.current);onSession(verified);return saveWinterStallPlan(plan,expected,verified.accessToken)}}/>}
    reports={<><MasterStableScheduleEditor rows={view.groups.map(g=>{const row=schedules.find(s=>s.organization_id===g.id);return {id:g.id,name:g.name,value:row?.value??emptyStableSchedule(),revision:row?.request_id??null}})} loading={pending||scheduleLoading} error={problem||scheduleError} year="2026" onReload={async()=>{await reloadSchedules()}} onSave={saveSchedule} onReadExcel={async file=>{const app=await readWinterApplication(new Uint8Array(await file.arrayBuffer()),file.name);return {club:app.club,value:app.stable??emptyStableSchedule()}}}/>
    <MasterStableReports booklets={bookletRows(view.groups,schedules.map(row=>({id:row.organization_id,value:row.value})))} bookletLoading={scheduleLoading} bookletError={scheduleError} unsettled={unsettled} loading={pending} error={problem} unsettledLoading={ledgerLoading} unsettledError={ledgerError}
      loadBookletPrint={loadBookletPrint} loadUnsettledPrint={loadUnsettledPrint}/></>}/>
}
