'use client'
import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import { formatYen } from '@/lib/fees'
import type { SavedSettlement } from '@/lib/self-settlement-saved'
import type { selfSettlementAccount } from '@/lib/self-settlement-account'

type Account=ReturnType<typeof selfSettlementAccount>
type RecordRow=SavedSettlement
type Organization={id:string;name:string}
const button='min-h-16 rounded-2xl border-2 px-5 py-3 text-xl font-bold disabled:opacity-40'
async function api(url:string,options?:RequestInit){const response=await fetch(url,{...options,cache:'no-store'});const result=await response.json();if(!response.ok)throw Object.assign(new Error(result.error||'通信できませんでした'),{refresh:result.refresh,status:response.status});return result}

export function SelfSettlement(){
 const [organizations,setOrganizations]=useState<Organization[]>([]),[query,setQuery]=useState(''),[org,setOrg]=useState('')
 const [account,setAccount]=useState<Account|null>(null),[version,setVersion]=useState(''),[name,setName]=useState(''),[method,setMethod]=useState(''),[checked,setChecked]=useState(false)
 const [record,setRecord]=useState<RecordRow|null>(null),[history,setHistory]=useState<RecordRow[]>([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[consult,setConsult]=useState(false)
 const attemptId=useRef<string|null>(null),lastAction=useRef(Date.now()),sequence=useRef(0),working=useRef(false),printing=useRef(false)
 function reset(){sequence.current++;setOrg('');setQuery('');setAccount(null);setVersion('');setName('');setMethod('');setChecked(false);setRecord(null);setHistory([]);setError('');setConsult(false);attemptId.current=null;lastAction.current=Date.now()}
 useEffect(()=>{let active=true;api('/api/self-settlement').then(data=>{if(active)setOrganizations(data.organizations)}).catch(e=>{if(active){setError(e.message)}});return()=>{active=false}},[])
 useEffect(()=>{const touch=()=>{lastAction.current=Date.now()};const timer=window.setInterval(()=>{if(!working.current&&!printing.current&&document.visibilityState!=='hidden'&&Date.now()-lastAction.current>120000)reset()},5000);window.addEventListener('pointerdown',touch);window.addEventListener('keydown',touch);return()=>{window.clearInterval(timer);window.removeEventListener('pointerdown',touch);window.removeEventListener('keydown',touch)}},[])
 useEffect(()=>{const start=()=>{printing.current=true};const finish=()=>{printing.current=false;lastAction.current=Date.now()};window.addEventListener('beforeprint',start);window.addEventListener('afterprint',finish);return()=>{window.removeEventListener('beforeprint',start);window.removeEventListener('afterprint',finish)}},[])
 async function select(id:string){const seq=++sequence.current;setOrg(id);setAccount(null);setRecord(null);setHistory([]);setChecked(false);setMethod('');setName('');setConsult(false);setError('');setBusy(true);working.current=true;attemptId.current=null
  try{const data=await api(`/api/self-settlement?org=${encodeURIComponent(id)}`);if(seq===sequence.current){setAccount(data.account);setVersion(data.version);setRecord(data.savedRecord??null);if(data.account.document.due===0)setMethod('no_payment_due')}}catch(e){if(seq===sequence.current)setError(e instanceof Error?e.message:'取得できません')}finally{if(seq===sequence.current)setBusy(false);working.current=false}
 }
 async function confirm(){if(!account||working.current||busy||!checked||!name.trim()||!method)return;setBusy(true);working.current=true;setError('');attemptId.current??=crypto.randomUUID()
  try{const data=await api('/api/self-settlement',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'confirm',org,name,method,version,id:attemptId.current})});setRecord(data.record)}catch(e){setError(e instanceof Error?e.message:'確定できません');if((e as {refresh?:boolean}).refresh){setChecked(false);attemptId.current=null;await select(org);setError('明細が更新されました。新しい内容を確認してください。')}}finally{setBusy(false);working.current=false;lastAction.current=Date.now()}
 }
 async function loadHistory(){setBusy(true);working.current=true;setError('');try{const data=await api(`/api/self-settlement?org=${encodeURIComponent(org)}&history=1`);setHistory(data.records)}catch(e){setError(e instanceof Error?e.message:'履歴を取得できません')}finally{setBusy(false);working.current=false}}
 function print(){lastAction.current=Date.now();printing.current=true;window.print()}
 return <>
  <main className="print-hide mx-auto min-h-dvh max-w-5xl space-y-5 bg-background px-5 py-6 text-foreground">
   <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold">大会精算</h1>{!busy&&<Link href="/" onClick={reset} className="rounded-xl border-2 px-4 py-3 text-lg font-bold">受付へ戻る</Link>}</header>
   <p className="text-lg">団体を選択 → 明細確認 → 支払い方法 → 確定・印刷</p>
   {error&&<p role="alert" className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-xl font-bold text-red-800">{error}</p>}
   {!org?<>
    <h2 className="text-2xl font-bold">ご所属の団体を選んでください</h2><input aria-label="団体を検索" placeholder="団体名で検索" value={query} onChange={e=>setQuery(e.target.value)} className="min-h-16 w-full rounded-xl border-2 bg-card px-4 text-2xl"/>
    <div className="grid gap-3">{organizations.filter(o=>o.name.normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').toLowerCase())).map(o=><button key={o.id} type="button" onClick={()=>void select(o.id)} className={`${button} border-border bg-card text-left`}>{o.name} <span className="float-right">›</span></button>)}</div>{!organizations.length&&<p className="text-xl">団体を読み込んでいます…</p>}
   </>:<>
    <button type="button" disabled={busy} onClick={reset} className={`${button} bg-card`}>← 団体を選び直す</button>
    {busy&&<p role="status" className="text-xl font-bold">処理中です。少しお待ちください…</p>}
    {record?<>
     <div className="rounded-2xl border-2 border-green-400 bg-green-50 p-6 text-green-950"><h2 className="text-3xl font-bold">精算内容を確定しました</h2><p className="mt-2 text-xl font-bold">サーバーに保存済みです</p><p className="mt-1 text-lg">保存日時：{new Date(record.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p><p className="mt-3 text-xl font-bold">{record.document.document.organization}</p><p className="mt-2 text-xl">受付番号：{record.id.slice(0,8).toUpperCase()}</p><p className="mt-2 text-xl">支払い方法：{record.document.document.method} ／ {formatYen(record.amount)}</p><p className="mt-3 text-lg">{record.payment_method==='bank_transfer'?'精算書に記載の振込先へお支払いください。':record.payment_method==='cash_at_venue'?'精算書を係員に提示して、お支払いください。':'今回のお支払いはありません。'}</p><p className="mt-2">領収書が必要な場合は、入金確認後に係員が発行します。</p></div>
     <div className="flex flex-wrap gap-3"><button type="button" onClick={print} className={`${button} border-blue-700 bg-blue-700 text-white`}>精算書を印刷・再印刷</button><button type="button" onClick={reset} className={`${button} bg-card`}>終了・次の団体へ</button>{account&&<button type="button" onClick={()=>{setRecord(null);setChecked(false);setName('');setMethod(account.document.due===0?'no_payment_due':'');attemptId.current=null}} className={`${button} bg-card`}>明細を確認・支払い方法を変更</button>}</div><p className="text-lg">印刷画面でプリンターを選びます。印刷に失敗した場合は、同じボタンから再印刷できます。再印刷で精算内容を再保存する必要はありません。</p>
     <div className="rounded-2xl border-2 bg-white p-5 text-black"><ConfirmationPaper record={record}/></div>
    </>:account?<>
     <h2 className="text-3xl font-bold">{account.document.organization}</h2>
     <section className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-5"><p className="text-xl font-bold">お支払いいただく金額</p><p className="mt-2 text-5xl font-bold text-blue-800">{formatYen(account.document.due)}</p><dl className="mt-5 grid grid-cols-2 gap-3 text-lg"><dt>事前エントリー</dt><dd>{formatYen(account.document.normalTotal)}</dd><dt>事前分の入金済み</dt><dd>{formatYen(account.document.advancePaid)}{!account.document.advanceRecorded&&'（未確認）'}</dd><dt>追加・変更など</dt><dd>{formatYen(account.document.extraTotal)}</dd><dt>追加・変更などの入金済み</dt><dd>{formatYen(account.document.extraPaid)}</dd></dl></section>
     <details className="rounded-xl border-2 bg-card p-4"><summary className="cursor-pointer text-xl font-bold">事前エントリーの明細（{account.normalLines.length}件）</summary><NormalLines account={account}/></details>
     <section className="rounded-xl border-2 bg-card p-4"><h3 className="mb-3 text-2xl font-bold">追加・変更・棄権の明細</h3>{account.document.lines.length?account.document.lines.map((line,i)=><div key={line.key??i} className="border-t py-4 text-lg"><p className="font-bold">{line.action} ／ {line.competition}</p><p className="mt-1 whitespace-pre-line">{line.rider} ／ {line.horse}</p><p className="mt-2 font-bold">料金 {formatYen(line.amount)} ／ 入金済み {formatYen(line.paid)}</p>{line.note&&<p className="mt-1">{line.note}</p>}</div>):<p className="text-lg">追加・変更・棄権はありません。</p>}</section>
     {account.warnings.map(w=><p key={w} role="alert" className="rounded-xl bg-amber-100 p-4 text-xl font-bold text-amber-950">{w}</p>)}
     <button type="button" disabled={busy} onClick={()=>setConsult(true)} className={`${button} w-full border-amber-500 bg-amber-50 text-amber-950`}>内容が違う・係員に相談</button>
     {consult?<div role="status" className="rounded-xl border-2 border-amber-500 p-5 text-xl"><p className="font-bold">この画面を係員に見せてください。</p><p className="mt-3">係員が管理画面で確認・訂正します。</p><button type="button" disabled={busy} onClick={()=>void select(org)} className={`${button} mt-4 bg-card`}>訂正後の明細を読み直す</button></div>:<>
      <label className="flex min-h-20 items-center gap-4 rounded-xl border-2 bg-card p-4 text-2xl font-bold"><input type="checkbox" checked={checked} disabled={busy||!!account.warnings.length} onChange={e=>setChecked(e.target.checked)} className="size-8"/>この団体の明細・金額を確認しました</label>
      <label className="block text-xl font-bold">確認者のお名前<input value={name} maxLength={100} disabled={busy} onChange={e=>{setName(e.target.value);attemptId.current=null}} className="mt-2 min-h-16 w-full rounded-xl border-2 bg-card px-4 text-2xl"/></label>
      {account.document.due>0&&<fieldset disabled={busy} className="space-y-3"><legend className="mb-3 text-2xl font-bold">支払い方法を選んでください</legend>{[['bank_transfer','後日振込'],['cash_at_venue','当日現金・係員へ支払い']].map(([value,label])=><label key={value} className={`flex min-h-20 items-center gap-4 rounded-xl border-2 p-4 text-2xl font-bold ${method===value?'border-blue-700 bg-blue-50':'bg-card'}`}><input type="radio" name="payment" value={value} checked={method===value} onChange={()=>{setMethod(value);attemptId.current=null}} className="size-7"/>{label}</label>)}</fieldset>}
      <button type="button" disabled={busy||!checked||!name.trim()||!method||!!account.warnings.length} onClick={()=>void confirm()} className={`${button} w-full border-blue-700 bg-blue-700 text-white`}>{busy?'確定内容を保存中…':'この内容で精算を確定'}</button>
     </>}
     <button type="button" disabled={busy} onClick={()=>void loadHistory()} className={`${button} w-full bg-card`}>この団体の確定履歴・再印刷</button>
     {history.map(row=><button key={row.id} type="button" onClick={()=>setRecord(row)} className={`${button} w-full bg-card text-left`}>{new Date(row.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ {row.id.slice(0,8).toUpperCase()}<span className="block text-lg">{formatYen(row.amount)} ／ 保存時点の精算書を表示</span></button>)}
    </>:null}
   </>}
  </main>
  {record&&<div className="print-only document-page hidden bg-white text-black"><ConfirmationPaper record={record}/></div>}
 </>
}
function NormalLines({account}:{account:Account}){return <table className="settlement-normal-lines mt-3 w-full text-left text-base"><colgroup><col style={{width:'46%'}}/><col style={{width:'20%'}}/><col style={{width:'22%'}}/><col style={{width:'12%'}}/></colgroup><thead><tr><th>競技</th><th>選手</th><th>馬</th><th>金額</th></tr></thead><tbody>{account.normalLines.map(line=><tr key={line.id}><td>{line.competition}</td><td>{line.rider}</td><td>{line.horse}</td><td className="amount">{formatYen(line.amount)}</td></tr>)}</tbody></table>}
export function ConfirmationPaper({record}:{record:RecordRow}){
 const document=record.document.document
 return <article className="checkout-paper">
  <header className="checkout-heading"><h2>Fuji Horse Show 精算書</h2><h3>{document.organization} 御中</h3><p>受付番号：{record.id.slice(0,8).toUpperCase()} ／ 保存日時：{new Date(record.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ 確認者：{record.confirmed_by}</p><p>支払い予定の確認書です。領収書は入金確認後に係員が発行します。</p></header>
  <section className="checkout-totals"><table><tbody>
   <tr><th>事前エントリー合計</th><td>{formatYen(document.normalTotal)}</td><th>事前分の入金済み</th><td>{formatYen(document.advancePaid)}</td></tr>
   <tr><th>追加・変更等の合計</th><td>{formatYen(document.extraTotal)}</td><th>追加・変更等の入金済み</th><td>{formatYen(document.extraPaid)}</td></tr>
   <tr className="checkout-due"><th>お支払額</th><td>{formatYen(document.due)}</td><th>支払い方法</th><td>{document.method}</td></tr>
   {document.bankDetails&&<tr><th>振込先</th><td colSpan={3}>{document.bankDetails}</td></tr>}
  </tbody></table></section>
  <section className="checkout-extra"><h4>締切後・大会期間中の追加・変更・棄権</h4><table className="checkout-extra-lines"><colgroup><col style={{width:'7%'}}/><col style={{width:'35%'}}/><col style={{width:'16%'}}/><col style={{width:'18%'}}/><col style={{width:'12%'}}/><col style={{width:'12%'}}/></colgroup><thead><tr><th>区分</th><th>競技</th><th>選手</th><th>馬</th><th>備考</th><th>金額</th></tr></thead><tbody>{document.lines.length?document.lines.map((line,index)=><tr key={line.key??index}><td>{line.action}</td><td>{line.competition}</td><td>{line.rider}</td><td>{line.horse}</td><td>{line.action.startsWith('棄権')?'':line.note||'—'}</td><td className="amount">{formatYen(line.amount)}</td></tr>):<tr><td colSpan={6}>追加・変更・棄権の記録はありません。</td></tr>}</tbody></table></section>
 </article>
}
