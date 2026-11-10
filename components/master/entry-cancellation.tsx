"use client"

import {useRef, useState} from 'react'

export type CancellationQuote = {
  entryId:string; competitionId:string; riderId:string; horseId:string; position:number; op:boolean
  billTo:string; fee:number; beforeTotal:number; afterTotal:number; afterRemaining:number
}
type Entry = {id:string; competition:string; rider:string; horse:string; position:number; op:boolean; label:string}
type Props = {
  competitions:{id:string;label:string}[]; entries:Entry[]; organizationName:(id:string)=>string
  calculate:(entry:string,operation:string|null,expected:CancellationQuote|null)=>Promise<CancellationQuote>
  onSaved:()=>void
}

const yen=(n:number)=>n.toLocaleString('ja-JP')+'円'
const field='block w-full min-h-12 rounded-xl border-2 p-2'
const button='min-h-12 rounded-xl border-2 px-4 font-bold disabled:opacity-50'

export function MasterEntryCancellation({competitions,entries,organizationName,calculate,onSaved}:Props){
  const [competition,selectCompetition]=useState(''),[entry,selectEntry]=useState('')
  const [review,setReview]=useState<{quote:CancellationQuote;label:string;operation:string}|null>(null)
  const [error,setError]=useState(''),[result,setResult]=useState(''),[busy,setBusy]=useState(false)
  const lock=useRef(false)
  const candidates=entries.filter(row=>row.competition===competition).sort((a,b)=>a.position-b.position)
  function reset(){setReview(null);setError('');setResult('')}
  async function submit(confirm:boolean){
    if(lock.current)return
    const chosen=candidates.find(row=>row.id===entry)
    if(confirm?!review:!chosen)return
    lock.current=true;setBusy(true);setError('');setResult('')
    try{
      if(confirm && review){
        await calculate(review.quote.entryId,review.operation,review.quote)
        setResult(review.label+' の事前エントリーを取り消しました。競技料は0円です。')
        setReview(null);selectEntry('');onSaved()
      }else if(chosen){
        const quote=await calculate(chosen.id,null,null)
        if(quote.entryId!==chosen.id||quote.competitionId!==chosen.competition||quote.riderId!==chosen.rider||
          quote.horseId!==chosen.horse||quote.position!==chosen.position||quote.op!==chosen.op){
          onSaved();throw new Error('出番が更新されました。最新の人馬を選び直してください。')
        }
        setReview({quote,label:chosen.label,operation:crypto.randomUUID()})
      }
    }catch(err){setError(err instanceof Error?err.message:'取消内容を確認できません。')}
    finally{lock.current=false;setBusy(false)}
  }
  return <div className="space-y-4 rounded-xl border-2 p-4">
    <h3 className="text-xl font-bold">事前エントリーの取消</h3>
    {review?<div className="space-y-3 rounded-lg bg-amber-50 p-4">
      <p>{competitions.find(c=>c.id===review.quote.competitionId)?.label}</p><p className="font-bold">{review.label}</p>
      <p>この出番の競技料　{yen(review.quote.fee)} → 0円</p>
      <p>{organizationName(review.quote.billTo)}の請求合計　{yen(review.quote.beforeTotal)} → {yen(review.quote.afterTotal)}</p>
      {review.quote.afterRemaining<0&&<p>取消後の過入金　{yen(-review.quote.afterRemaining)}（返金・充当は別途ご確認ください）</p>}
      <p>馬の参加登録・馬匹登録料・入金記録は維持します。</p>
      <button type="button" disabled={busy} className={button+' bg-destructive text-white'} onClick={()=>void submit(true)}>取消を確定</button>{' '}
      <button type="button" disabled={busy} className={button} onClick={()=>{reset();onSaved()}}>選び直す</button>
    </div>:<>
      <label className="block">競技<select className={field} disabled={busy} value={competition} onChange={e=>{reset();selectCompetition(e.target.value);selectEntry('')}}>
        <option value="">競技を選択</option>{competitions.map(c=><option key={c.id} value={c.id}>{c.label}</option>)}</select></label>
      <label className="block">取り消す出番<select className={field} disabled={busy||!candidates.length} value={entry} onChange={e=>{reset();selectEntry(e.target.value)}}>
        <option value="">出番を選択</option>{candidates.map(e=><option key={e.id} value={e.id}>{e.label}</option>)}</select></label>
      {competition&&!candidates.length&&<p>この競技に取消対象の事前エントリーはありません。</p>}
      <button type="button" className={button} disabled={busy||!candidates.some(e=>e.id===entry)} onClick={()=>void submit(false)}>取消内容を確認</button>
    </>}
    {busy&&<p role="status">確認中…</p>}{result&&<p role="status" className="font-bold">{result}</p>}
    {error&&<p role="alert" className="text-destructive">{error}</p>}
  </div>
}
