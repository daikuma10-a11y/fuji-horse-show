"use client"
import Link from 'next/link'
import {useEffect,useRef,useState} from 'react'
import {fitSettlementPaper} from '@/lib/master/settlement-fit'
import {masterConfirmationContent} from '@/lib/master/settlement-print'
import {masterSettlementSummary} from '@/lib/master/settlement-summary'
import {formatYen} from '@/lib/fees'
import {showSettlementLine} from '@/lib/master/self-settlement'
import type {MasterSettlementViewProps,MasterSettlementAccount as Account,MasterSavedSettlement as RecordRow} from '@/lib/master/self-settlement'
const button='min-h-16 rounded-2xl border-2 px-5 py-3 text-xl font-bold disabled:opacity-40'
export function MasterSelfSettlementView(props:MasterSettlementViewProps){
 const {organizations,query,org,account,record,history,busy,error,checked,name,method}=props
 const [scopedKey,setScopedKey]=useState('')
 const [confirmedPayment,setConfirmedPayment]=useState<{account:Account;method:string}|null>(null)
 const paymentReady=!!account&&(account.document.due<=0||confirmedPayment?.account===account&&confirmedPayment.method===method&&!!method&&props.canUseMethod?.(method)!==false)
 const totals=account?masterSettlementSummary(account.document):null
 const lines=account?.document.lines.filter(showSettlementLine)??[]
 const paper=record??(paymentReady&&!props.locked?props.draftPaper:null)
 const scopeKey=record?.id??`${org}:${method}:${paymentReady}`
 const scoped=!!props.statementScope&&scopedKey===scopeKey
 const scopeProps={scopeContent:props.statementScope,scoped,onScopedChange:(value:boolean)=>setScopedKey(value?scopeKey:'')}
 const reset=()=>{setScopedKey('');props.onReset()},select=(id:string)=>{setScopedKey('');props.onSelect(id)},confirm=props.onConfirm,print=props.onPrint,loadHistory=props.onHistory
 const setQuery=props.onQuery,setName=props.onName,setChecked=props.onChecked
 const setMethod=(value:string)=>{setScopedKey('');setConfirmedPayment(null);setChecked(false);props.onMethod(value)}
 const setRecord=props.onChooseHistory
 return <>
  <main className="print-hide mx-auto min-h-dvh max-w-5xl space-y-5 bg-background px-5 py-6 text-foreground">
   <header className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-3xl font-bold">大会精算</h1>{!busy&&<Link href={props.homeHref??"/"} onClick={props.locked?event=>event.preventDefault():reset} aria-disabled={props.locked||undefined} className="rounded-xl border-2 px-4 py-3 text-lg font-bold">受付へ戻る</Link>}</header>
   <p className="text-lg">団体を選択 → 支払い方法を確定 → 明細確認・印刷 → 精算を確定</p>
   {props.pendingMessage&&<div role="status" className="rounded-xl bg-orange-100 p-4 text-xl"><p>{props.pendingMessage}</p>{props.onRetry&&<button type="button" className={button} disabled={busy} onClick={props.onRetry}>同じ登録番号で保存を再確認</button>}</div>}
   {error&&<p role="alert" className="rounded-xl border-2 border-red-300 bg-red-50 p-4 text-xl font-bold text-red-800">{error}</p>}
   {!org?<>
    <h2 className="text-2xl font-bold">ご所属の団体を選んでください</h2><input aria-label="団体を検索" placeholder="団体名で検索" value={query} onChange={e=>setQuery(e.target.value)} className="min-h-16 w-full rounded-xl border-2 bg-card px-4 text-2xl"/>
    <div className="grid gap-3">{organizations.filter(o=>o.name.normalize('NFKC').toLowerCase().includes(query.normalize('NFKC').toLowerCase())).map(o=><button key={o.id} type="button" onClick={()=>void select(o.id)} className={`${button} border-border bg-card text-left`}>{o.name} <span className="float-right">›</span></button>)}</div>{!organizations.length&&<p className="text-xl">団体を読み込んでいます…</p>}
   </>:<>
    <button type="button" disabled={busy||props.locked} onClick={reset} className={`${button} bg-card`}>← 団体を選び直す</button>
    {busy&&<p role="status" className="text-xl font-bold">処理中です。少しお待ちください…</p>}
    {record?<>
     <div className="rounded-2xl border-2 border-green-400 bg-green-50 p-6 text-green-950"><h2 className="text-3xl font-bold">精算内容を確定しました</h2><p className="mt-2 text-xl font-bold">サーバーに保存済みです</p><p className="mt-1 text-lg">保存日時：{new Date(record.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p><p className="mt-3 text-xl font-bold">{record.document.document.organization}</p><p className="mt-2 text-xl">受付番号：{record.id.slice(0,8).toUpperCase()}</p><p className="mt-2 text-xl">支払い方法：{record.document.document.method} ／ {formatYen(record.amount)}</p><p className="mt-3 text-lg">{record.payment_method==='bank_transfer'?'精算書に記載の振込先へお支払いください。':record.payment_method==='cash_at_venue'?'精算書を係員に提示して、お支払いください。':'今回のお支払いはありません。'}</p><p className="mt-2">領収書が必要な場合は、入金確認後に係員が発行します。</p></div>
     <ConsultNotice/>
     <StatementPreview key={record.id} {...scopeProps} paper={record} onPrint={print} disabled={busy||!!props.locked}/>
     <div className="flex flex-wrap gap-3">{props.onExcel&&record&&<button type="button" className={button} onClick={()=>props.onExcel?.(record)}>精算書をExcelに保存</button>}<button type="button" onClick={reset} className={`${button} bg-card`}>終了・次の団体へ</button>{account&&props.canEditSaved!==false&&<button type="button" onClick={props.onEditSaved} className={`${button} bg-card`}>明細を確認・支払い方法を変更</button>}</div>
    </>:account?<>
     <h2 className="text-3xl font-bold">{account.document.organization}</h2>
     <section className="rounded-2xl border-2 border-blue-300 bg-blue-50 p-5">
      <p className="text-xl font-bold">{account.document.due<0?'ご返金額（未返金）':'お支払いいただく金額'}</p>
      <p className="mt-2 text-5xl font-bold text-blue-800">{formatYen(Math.abs(account.document.due))}</p>
      <div className="mt-5 grid gap-5 md:grid-cols-2">
       {[totals?.charges,totals?.payments].map((rows,index)=><dl key={index} className="grid grid-cols-2 content-start gap-3 text-lg">{rows?.map((row,i)=><div key={i} className="contents"><dt>{row.label}</dt><dd className="whitespace-pre-line">{row.value}</dd></div>)}</dl>)}
      </div>
     </section>
     {account.document.due>0&&<fieldset disabled={busy||props.locked} className="space-y-3"><legend className="mb-3 text-2xl font-bold">支払い方法を選んでください</legend>{[['bank_transfer','後日振込'],['cash_at_venue','当日現金・係員へ支払い']].map(([value,label])=><label key={value} className={`flex min-h-20 items-center gap-4 rounded-xl border-2 p-4 text-2xl font-bold ${method===value?'border-blue-700 bg-blue-50':'bg-card'}`}><input type="radio" name="payment" value={value} checked={method===value} disabled={props.canUseMethod?.(value)===false} onChange={()=>{if(!busy&&!props.locked)setMethod(value)}} className="size-7"/>{label}</label>)}</fieldset>}
     {account.document.due>0&&<button type="button" disabled={busy||props.locked||!method||props.canUseMethod?.(method)===false||paymentReady} onClick={()=>{if(!busy&&!props.locked&&method&&props.canUseMethod?.(method)!==false)setConfirmedPayment({account,method})}} className={`${button} w-full border-blue-700 bg-blue-700 text-white`}>{paymentReady?'支払い方法を確定しました':'この支払い方法で明細確認へ'}</button>}
     {!paymentReady&&<p className="text-lg">支払い方法を選んで確定すると、明細の確認・印刷ができます。</p>}
     {paymentReady&&<>
     {props.onExcel&&props.draftPaper&&<button type="button" disabled={busy||props.locked} onClick={()=>props.draftPaper&&props.onExcel?.(props.draftPaper)} className={button}>精算書をExcelに保存（確認用）</button>}
     {props.normalDetails!==false&&<details className="rounded-xl border-2 bg-card p-4"><summary className="cursor-pointer text-xl font-bold">事前エントリーの明細（{account.normalLines.length}件）</summary><NormalLines account={account}/></details>}
     <section className="rounded-xl border-2 bg-card p-4"><h3 className="mb-3 text-2xl font-bold">追加・変更の明細</h3>{lines.length?lines.map((line,i)=><div key={line.key??i} className="border-t py-4 text-lg"><p className="font-bold">{line.action} ／ {line.competition}</p><p className="mt-1 whitespace-pre-line">{line.rider} ／ {line.horse}</p><p className="mt-2 font-bold">料金 {formatYen(line.amount)}{typeof line.paid==='number'?` ／ 入金済み ${formatYen(line.paid)}`:' ／ 入金は合計欄を参照'}</p>{line.note&&<p className="mt-1">{line.note}</p>}</div>):<p className="text-lg">追加・変更はありません。</p>}</section>
     </>}
     {!!account.warnings.length&&<section id="settlement-confirmation-blockers" className="space-y-3 rounded-xl border-2 border-amber-500 bg-amber-50 p-4 text-lg text-amber-950">
      <div role="alert"><h3 className="text-2xl font-bold">本部確認待ち・まだ精算を確定できません</h3>{account.warnings.map(w=><p key={w} className="mt-2 font-bold">{w}</p>)}</div>
      <p>支払い方法を確定すると明細を確認できます。精算の確定には、上の確認事項の解消が必要です。</p>
      {account.warnings.some(w=>w.includes('事前入金'))&&<p>本部担当者は精算画面でこの団体を開き、「事前入金を記録・修正」から実際に確認した入金額を保存してください。未入金と確認できた場合は0円を保存します。「未確認」と「未入金」は別の状態です。</p>}
      <button type="button" disabled={busy||props.locked} onClick={()=>void select(org)} className={`${button} w-full border-amber-700 bg-white`}>本部確認後に明細を読み直す</button>
      <p>読み直した金額を確認し、確認者のお名前・支払い方法を入力して精算を確定してください。</p>
     </section>}
     <ConsultNotice/>
      {props.onPrintDraft&&<StatementPreview key={`${org}:${method}:${paymentReady}`} {...scopeProps} paper={paymentReady?props.draftPaper:null} onPrint={props.onPrintDraft} disabled={busy||!!props.locked||!paymentReady}/>}
      <label className="flex min-h-20 items-center gap-4 rounded-xl border-2 bg-card p-4 text-2xl font-bold"><input type="checkbox" checked={checked} disabled={busy||!!props.locked||!paymentReady} aria-describedby={account.warnings.length?'settlement-confirmation-blockers':undefined} onChange={e=>{if(paymentReady)setChecked(e.target.checked)}} className="size-8"/>この団体の明細・金額を確認しました</label>
      <label className="block text-xl font-bold">確認者のお名前<input value={name} maxLength={100} disabled={busy||props.locked} onChange={e=>setName(e.target.value)} className="mt-2 min-h-16 w-full rounded-xl border-2 bg-card px-4 text-2xl"/></label>
      <button type="button" disabled={busy||props.locked||!paymentReady||!checked||!name.trim()||!method||!!account.warnings.length} aria-describedby={account.warnings.length?'settlement-confirmation-blockers':undefined} onClick={()=>{if(paymentReady)void confirm()}} className={`${button} w-full border-blue-700 bg-blue-700 text-white`}>{busy?'確定内容を保存中…':account.warnings.length?'本部確認待ち・精算は未確定':'この内容で精算を確定'}</button>
     <button type="button" disabled={busy||props.locked} onClick={()=>void loadHistory()} className={`${button} w-full bg-card`}>この団体の確定履歴・再印刷</button>
     {history.map(row=><button key={row.id} type="button" disabled={props.locked} onClick={()=>setRecord(row)} className={`${button} w-full bg-card text-left`}>{new Date(row.created_at).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})} ／ {row.id.slice(0,8).toUpperCase()}<span className="block text-lg">{formatYen(row.amount)} ／ 保存時点の精算書を表示</span></button>)}
    </>:null}
   </>}
  </main>
  {paper&&!scoped&&<div className="print-only document-page hidden bg-white text-black"><MasterConfirmationPaper record={paper}/></div>}
 </>
}
function ConsultNotice(){
 return <p className="rounded-xl border border-amber-400 bg-amber-50 p-4 text-lg font-semibold text-amber-950">内容が違う場合は係員にお尋ねください。</p>
}
function StatementPreview({paper,onPrint,disabled,scopeContent,scoped,onScopedChange}:{paper?:RecordRow|null;onPrint:()=>void;disabled:boolean;scopeContent?:React.ReactNode;scoped?:boolean;onScopedChange?:(value:boolean)=>void}){
 const [open,setOpen]=useState(false)
 const visible=open&&!!paper
 return <div className="space-y-3">
  <button type="button" aria-expanded={visible} aria-controls="statement-preview" disabled={disabled||!paper}
    onClick={()=>{if(!disabled&&paper)setOpen(value=>!value)}} className={`${button} w-full border-blue-700 bg-white text-blue-800`}>明細確認、印刷</button>
  <div id="statement-preview" hidden={!visible}>
   {visible&&<section aria-label="精算書の明細" className="space-y-4 rounded-2xl border-2 bg-white p-4 text-black">
    {scopeContent&&<div className="flex flex-wrap gap-3" aria-label="明細の範囲"><button type="button" className={button} disabled={disabled} aria-pressed={!scoped} onClick={()=>onScopedChange?.(false)}>全期間の精算書</button><button type="button" className={button} disabled={disabled} aria-pressed={!!scoped} onClick={()=>onScopedChange?.(true)}>日付・入金後の明細</button></div>}
    {scoped?scopeContent:<><div className="overflow-x-auto"><MasterConfirmationPaper record={paper}/></div>
    <button type="button" disabled={disabled} onClick={()=>{if(!disabled)onPrint()}} className={`${button} w-full border-blue-700 bg-blue-700 text-white`}>印刷</button></>}
   </section>}
  </div>
 </div>
}
function NormalLines({account}:{account:Account}){return <table className="settlement-normal-lines mt-3 w-full text-left text-base"><colgroup><col style={{width:'46%'}}/><col style={{width:'20%'}}/><col style={{width:'22%'}}/><col style={{width:'12%'}}/></colgroup><thead><tr><th>競技</th><th>選手</th><th>馬</th><th>金額</th></tr></thead><tbody>{account.normalLines.map(line=><tr key={line.id}><td>{line.competition}</td><td>{line.rider}</td><td>{line.horse}</td><td className="amount">{formatYen(line.amount)}</td></tr>)}</tbody></table>}
export function MasterConfirmationPaper({record}:{record:RecordRow}){
 const root=useRef<HTMLElement>(null)
 useEffect(()=>{
  const element=root.current;if(!element)return
  let active=true
  const fit=()=>{if(active)fitSettlementPaper(element)}
  const observer=new ResizeObserver(fit);observer.observe(element)
  window.addEventListener('beforeprint',fit);window.addEventListener('afterprint',fit)
  void document.fonts.ready.then(fit);fit()
  return()=>{active=false;observer.disconnect();window.removeEventListener('beforeprint',fit);window.removeEventListener('afterprint',fit)}
 },[record])
 return <article ref={root} className="checkout-paper" dangerouslySetInnerHTML={{__html:masterConfirmationContent(record)}}/>
}
