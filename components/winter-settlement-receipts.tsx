'use client'
import {useEffect,useRef,useState} from 'react'
import {createPortal} from 'react-dom'
import {ReceiptPrint} from './master/financial-print-layouts'
import {ScopedReceiptForm} from './master/scoped-receipt-form'
import {formatYen} from '@/lib/fees'
import {WINTER_EVENT_ID,WINTER_EVENT_NAME} from '@/lib/winter-event'
import {loadWinterData} from '@/lib/winter-data'
import {loadWinterSettlement,winterSettlementAccount,type WinterSettlementData} from '@/lib/winter-settlement'
import {loadSettlementReceipts,createSettlementReceipt,type SettlementReceipt,type ReceiptInput} from '@/lib/settlement-receipts'
import {winterReceiptModel,verifyWinterReceipt,winterReceiptCoverage} from '@/lib/winter-receipts'
import {verifyAdminSession,SUPABASE_URL,SUPABASE_PUBLISHABLE_KEY,type AdminSession} from '@/lib/supabase-rest'

type Props={data:Awaited<ReturnType<typeof loadWinterData>>;ledger:WinterSettlementData;account:ReturnType<typeof winterSettlementAccount>;session:AdminSession}

async function receiptBalance(token:string,group:string):Promise<number|null>{
  const response=await fetch(SUPABASE_URL+'/rest/v1/rpc/winter_receipt_balance',{method:'POST',headers:{apikey:SUPABASE_PUBLISHABLE_KEY,Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify({p_organization:group}),cache:'no-store'})
  const value=await response.json()
  if(response.status===404 && value?.code==='PGRST202')return null
  if(!response.ok || !Number.isSafeInteger(value) || value<0)throw Error('領収書の発行可能額を確認できません。履歴を読み直してください。')
  return value
}

export function WinterSettlementReceipts({data,ledger,account,session}:Props){
  const group=account.organization.id
  const [open,setOpen]=useState(false),[version,reload]=useState(0)
  const [history,setHistory]=useState<SettlementReceipt[]|null>(null),[error,setError]=useState('')
  const [balance,setBalance]=useState<number|null>(null)
  const [paper,setPaper]=useState<SettlementReceipt|null>(null)
  const auth=useRef(session);auth.current=session
  useEffect(()=>{
    if(!open)return
    let current=true
    setError('');setHistory(null)
    verifyAdminSession(auth.current).then(s=>Promise.all([loadSettlementReceipts(s,group,WINTER_EVENT_ID),receiptBalance(s.accessToken,group)])).then(([rows,confirmed])=>{if(current){setBalance(confirmed);setHistory(rows)}}).catch(e=>{if(current)setError(e.message)})
    return ()=>{current=false}
  },[open,version,group])
  useEffect(()=>{
    if(!paper)return
    let active=true
    document.body.classList.add('winter-printing-receipt')
    const clear=()=>setPaper(null)
    window.addEventListener('afterprint',clear)
    document.fonts.ready.then(()=>{if(active)window.print()})
    return ()=>{active=false;document.body.classList.remove('winter-printing-receipt');window.removeEventListener('afterprint',clear)}
  },[paper])
  async function issue(s:AdminSession,input:ReceiptInput,id:string){
    const verified=await verifyAdminSession(s)
    const [currentData,currentLedger,records,confirmed]=await Promise.all([loadWinterData(),loadWinterSettlement(verified.accessToken),loadSettlementReceipts(verified,group,WINTER_EVENT_ID),receiptBalance(verified.accessToken,group)])
    if(!records.some(r=>r.id===id)){
      const currentAccount=winterSettlementAccount(currentData,currentLedger,group)
      verifyWinterReceipt(input,winterReceiptCoverage(winterReceiptModel(currentData,currentLedger,currentAccount,records),currentAccount,records,confirmed),records)
    }
    return createSettlementReceipt(verified,input,id,WINTER_EVENT_ID)
  }
  const model=history&&winterReceiptCoverage(winterReceiptModel(data,ledger,account,history),account,history,balance)
  function print(record:SettlementReceipt){setPaper({...record})}
  return <section className="space-y-3 rounded-xl border-2 p-4" aria-label="領収書">
    <button type="button" className="min-h-12 rounded-lg bg-blue-800 px-5 font-bold text-white" aria-expanded={open} onClick={()=>setOpen(!open)}>領収書の発行・再印刷</button>
    {open&&<>{!history&&!error&&<p role="status">発行履歴を読み込んでいます…</p>}
      {error&&<p role="alert">{error}</p>}
      {model&&history&&<>{balance===null&&<p>発行対象は確認済みの事前入金（事前競技料・馬匹登録料）です。</p>}<ScopedReceiptForm embedded includeHorses organizationKey={group} organization={account.organization.name} session={session} receipts={history}
        {...model} defaultPurpose={WINTER_EVENT_NAME+' 参加料として'} saveReceipt={issue}
        onSaved={row=>{setHistory(records=>[row,...(records??[]).filter(r=>r.id!==row.id)]);print(row)}}/>
        <h3 className="text-lg font-bold">発行済み領収書</h3>
        {history.length===0?<p>この団体の発行履歴はありません。</p>:history.map(row=><div className="flex flex-wrap items-center gap-3 border-t py-2" key={row.id}><span>{row.issue_date}　{row.recipient}　{formatYen(row.amount)}　{row.purpose}</span><button type="button" className="rounded-lg border px-3 py-2" onClick={()=>print(row)}>再印刷</button></div>)}
      </>}
      <button type="button" className="rounded-lg border px-3 py-2" onClick={()=>reload(v=>v+1)}>発行履歴を読み直す</button>
    </>}
    {paper&&createPortal(<div className="winter-receipt-sheet document-page"><ReceiptPrint receipt={paper}/></div>,document.body)}
  </section>
}
