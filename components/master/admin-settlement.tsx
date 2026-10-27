"use client"
import type {ReactNode} from 'react'
import {formatYen} from '@/lib/fees'
import type {AdminSettlementBalance,AdminSettlementGroup} from '@/lib/master/admin-settlement'
export function MasterAdminSettlementGroups({rows,grandTotal,receptionTotal,balanceTotals,excludedLegacyCount=0,history,disabled=false,onSelect}:{rows:readonly AdminSettlementGroup[];grandTotal:number;receptionTotal:number;balanceTotals?:AdminSettlementBalance;excludedLegacyCount?:number;history?:ReactNode;disabled?:boolean;onSelect:(id:string)=>void}){
 return <div className="flex flex-col gap-5">
  {history}
  {balanceTotals?<div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5">
   <p className="text-lg font-semibold">Excel取込分を含む登録済みの料金と、記録済みの入金額です。団体を選ぶと内訳を確認できます。</p>
   <dl className="mt-4 grid gap-4 border-t border-primary/20 pt-4 sm:grid-cols-3">
    <div><dt className="font-bold">全団体 請求総額</dt><dd className="text-2xl font-bold text-primary">{formatYen(balanceTotals.total)}</dd></div>
    <div><dt className="font-bold">入金済（記録）</dt><dd className="text-2xl font-bold">{formatYen(balanceTotals.paid)}</dd></div>
    <div><dt className="font-bold">差引残額の合計</dt><dd className="text-2xl font-bold text-primary">{formatYen(balanceTotals.remaining)}</dd></div>
   </dl>
   <p className="mt-3 text-sm text-muted-foreground">請求総額には競技料金・馬匹登録料・追加変更料金・金額訂正を含みます。入金未記録の金額は残額に含まれます。</p>
  </div>:<div className="rounded-2xl border-2 border-primary/40 bg-primary/5 p-5"><p className="text-lg font-semibold">通常エントリー料金は原則事前払いです。団体を選ぶと通常分と今回の受付分を分けて確認できます。</p>{excludedLegacyCount>0&&<p className="mt-2 text-sm font-semibold text-muted-foreground">旧テストデータ {excludedLegacyCount}件は正式データへ紐付けできないため、精算金額から除外しています。</p>}<div className="mt-4 flex items-end justify-between gap-4 border-t border-primary/20 pt-4"><span className="text-lg font-bold">全団体 追加・変更分</span><span className="text-3xl font-bold text-primary">{formatYen(receptionTotal)}</span></div><p className="mt-2 text-sm text-muted-foreground">大会費用の合計（通常分を含む）：{formatYen(grandTotal)}。支払い済みかどうかは未反映です。</p></div>}
  <div className="overflow-hidden rounded-2xl border-2 border-border bg-card shadow-sm">
   {rows.map((row,index)=><button key={row.id} type="button" disabled={disabled||undefined} onClick={()=>onSelect(row.id)} className={row.balance?`flex w-full flex-col gap-4 px-5 py-5 text-left sm:flex-row sm:items-center sm:justify-between ${index?'border-t border-border':''}`:`flex w-full items-center justify-between gap-4 px-5 py-5 text-left ${index?'border-t border-border':''}`}>
    {row.balance?<>
     <span className="min-w-0 flex-1"><span className="text-xl font-bold text-foreground">{row.name}</span>{row.warnings?.map(warning=><span key={warning} className="mt-2 block text-sm font-semibold text-amber-800">{warning}</span>)}</span>
     <span className="flex shrink-0 items-center justify-end gap-3">
      <span className="flex flex-col items-end gap-1">
       <span className="text-sm font-bold">差引残額</span><span className="text-2xl font-bold text-primary">{formatYen(row.balance.remaining)}</span>
       <span className="text-sm">請求総額 {formatYen(row.balance.total)}</span>
       <span className="text-sm">入金済（記録） {formatYen(row.balance.paid)}</span>
       {row.balance.remaining<0&&<span className="text-sm font-bold text-amber-800">返金・充当を確認</span>}
      </span><span className="text-2xl text-muted-foreground">›</span>
     </span>
    </>:<><span className="min-w-0 text-xl font-bold text-foreground">{row.name}</span><span className="flex shrink-0 items-center gap-3"><span className="flex flex-col items-end"><span className="text-xl font-bold text-primary">{formatYen(row.extraTotal)}</span>{row.hasAdvance&&<span className="text-xs font-bold text-primary">事前入金記録あり</span>}</span><span className="text-2xl text-muted-foreground">›</span></span></>}
   </button>)}
  </div>
 </div>
}
export function MasterAdminSettlementSummary({name,due,normalTotal,advancePaid,advanceRecorded,advanceTarget=normalTotal,extraTotal,extraPaid,advanceAction,editor,summaryRows=[],warnings=[]}:{name:string;due:number;normalTotal:number;advancePaid:number;advanceRecorded:boolean;advanceTarget?:number;extraTotal:number;extraPaid:number;advanceAction?:ReactNode;editor?:ReactNode;summaryRows?:readonly{label:string;value:string}[];warnings?:readonly string[]}){return <div className="print-hide rounded-2xl border-2 border-border bg-card p-5 shadow-sm"><h3 className="text-3xl font-bold text-foreground">{name}</h3><div className="mt-4 rounded-xl bg-primary/10 p-4"><p className="text-lg font-bold">差引残額（お支払いいただく金額）</p><p className="mt-1 text-5xl font-bold text-primary">{formatYen(due)}</p></div><div className="mt-4 divide-y divide-border text-sm"><div className="flex flex-wrap items-center justify-between gap-3 py-3"><div><p className="font-bold">事前エントリー {formatYen(normalTotal)}</p><p className={`mt-1 font-semibold ${!advanceRecorded||advancePaid<advanceTarget?'text-amber-800':'text-primary'}`}>{!advanceRecorded?'入金状況：未登録':advancePaid>=advanceTarget?`支払い済み ／ ${formatYen(advancePaid)}`:`一部入金済み ／ ${formatYen(advancePaid)}`}</p></div>{advanceAction}</div><div className="flex flex-wrap justify-between gap-2 py-3"><span>追加・変更などの料金</span><span className="font-semibold">{formatYen(extraTotal)}</span></div><div className="flex flex-wrap justify-between gap-2 py-3"><span>追加・変更などの入金済み</span><span className="font-semibold">{formatYen(extraPaid)}</span></div>{summaryRows.map(row=><div key={row.label} className="flex flex-wrap justify-between gap-2 py-3"><span>{row.label}</span><span className="font-semibold">{row.value}</span></div>)}</div>{due<0&&<p role="status" className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-950">入金額が大会費用を上回っています。返金・充当を確認してください。</p>}{warnings.map(value=><p key={value} role="status" className="mt-2 rounded-lg bg-amber-50 p-3 text-sm font-bold text-amber-950">{value}</p>)}{editor}</div>}
