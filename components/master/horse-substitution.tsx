"use client"
import {useEffect,useRef,useState} from 'react'
import {UncertainSubstitution,type HorseOptions,type HorseEdit,type HorseQuote,type SwapInput} from '@/lib/master/horse-substitution'

type Props={
  data:{organizations:{id:string;name:string}[];riders:{id:string;name:string}[];horses:{id:string;name:string;organization_id:string;jef_registration_no:string|null}[];
    competitions:{id:string;competition_no:string;competition_date:string;name:string;official:boolean;op_fee:number|null;member_fee:number|null;nonmember_fee:number|null}[]}
  allowsOp?:(c:Props['data']['competitions'][number])=>boolean
  fixedHorse?:string;storageKey:string;needsInstructor:(id:string)=>boolean;feeNote:string;onSaved:()=>void
  loadOptions:(old:string)=>Promise<HorseOptions>
  calculate:(input:SwapInput,id?:string|null,expected?:HorseQuote|null)=>Promise<HorseQuote>
}
type Attempt={id:string;input:SwapInput;quote:HorseQuote}
const field='mt-1 block min-h-12 w-full rounded-lg border-2 bg-white px-3'
const button='min-h-12 rounded-xl border-2 border-blue-800 px-4 font-semibold disabled:opacity-50'
const yen=(n:number)=>n.toLocaleString('ja-JP')+'円'
const sum=(b:HorseQuote['billing'][number])=>b.difference+b.service+b.registration

export function MasterHorseSubstitution({data,storageKey,fixedHorse,allowsOp=c=>!c.official&&c.op_fee!=null,needsInstructor,feeNote,onSaved,loadOptions,calculate}:Props){
  const [org,setOrg]=useState(data.horses.find(h=>h.id===fixedHorse)?.organization_id??''),[old,setOld]=useState(fixedHorse??''),[target,setTarget]=useState('')
  const [options,setOptions]=useState<HorseOptions|null>(null),[rows,setRows]=useState<HorseEdit[]>([])
  const [quote,setQuote]=useState<HorseQuote|null>(null),[attempt,setAttempt]=useState<Attempt|null>(null)
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState('')
  const lock=useRef(false)
  useEffect(()=>{
    const saved=sessionStorage.getItem(storageKey)
    if(!saved)return
    try{
      const request:Attempt=JSON.parse(saved)
      if(!request.id||!request.input?.old||!Array.isArray(request.quote?.billing))throw Error()
      setAttempt(request);setQuote(request.quote)
    }catch{setError('端末の差し替え記録を確認できません。現在の参加馬・出番を確認してください。')}
  },[storageKey])
  const comp=(id:string)=>data.competitions.find(x=>x.id===id)
  const compName=(id:string)=>{const c=comp(id);return c?c.competition_no+' '+c.name:id}
  const rider=(id:string)=>data.riders.find(r=>r.id===id)?.name??'選手'
  const orgName=(id:string)=>data.organizations.find(o=>o.id===id)?.name??'団体'
  const choice=options?.choices.find(c=>c.kind+':'+c.id===target)
  function reset(){setOptions(null);setRows([]);setTarget('');setQuote(null);setError('');setMessage('')}
  function edit(id:string,patch:Partial<HorseEdit>){setRows(list=>list.map(r=>r.id===id?{...r,...patch}:r));setQuote(null);setError('')}
  async function run(fn:()=>Promise<void>){
    if(lock.current)return
    lock.current=true;setBusy(true);setError('')
    try{await fn()}catch(e){setError(e instanceof Error?e.message:'入力内容を確認してください')}finally{setBusy(false);lock.current=false}
  }
  function load(id:string){
    reset();setOld(id)
    if(id)void run(async()=>{
      const o=await loadOptions(id)
      setOptions(o);setRows(o.entries.map(({id,competition,membership,op,instructor})=>({id,competition,membership,op:!!op,instructor})))
    })
  }
  function preview(){if(choice)void run(async()=>{setQuote(null);setQuote(await calculate({old,target:choice,rows}))})}
  function confirm(){if(!quote||(!attempt&&!choice))return;void run(async()=>{
    const request=attempt??{id:crypto.randomUUID(),input:{old,target:choice!,rows},quote}
    sessionStorage.setItem(storageKey,JSON.stringify(request));setAttempt(request)
    try{
      await calculate(request.input,request.id,request.quote)
      sessionStorage.removeItem(storageKey)
      reset();setOld('');setAttempt(null);setMessage(request.quote.old+' → '+request.quote.new+' の差し替えを確定しました。請求額を精算に反映しました。');onSaved()
    }catch(e){
      if(!(e instanceof UncertainSubstitution)){sessionStorage.removeItem(storageKey);setAttempt(null);setQuote(null)}
      throw e
    }
  })}
  return <div className="space-y-4 rounded-xl border-2 bg-white p-4">
    <h3 className="text-2xl font-bold">馬の差し替え</h3>
    <fieldset disabled={busy||!!attempt} className="space-y-4">
      {fixedHorse?<p className="font-bold">{orgName(org)}　{data.horses.find(h=>h.id===fixedHorse)?.name??quote?.old}</p>:<div className="grid gap-3 sm:grid-cols-2">
        <label>馬の所属団体<select className={field} value={org} onChange={e=>{reset();setOrg(e.target.value);setOld('')}}><option value="">団体を選択</option>{data.organizations.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}</select></label>
        <label>今回来なくなる馬<select className={field} value={old} onChange={e=>load(e.target.value)}><option value="">元の馬を選択</option>{data.horses.filter(h=>h.organization_id===org).map(h=><option key={h.id} value={h.id}>{h.name}（{h.jef_registration_no||'番号なし'}）</option>)}</select></label>
      </div>}
      {old&&!options&&!busy&&<button className={button} onClick={()=>load(old)}>{fixedHorse?'差し替え先と出番を表示':'名簿と出番を読み直す'}</button>}
      {options&&<>
        <label className="block">代わりに来る馬<select className={field} value={target} onChange={e=>{setTarget(e.target.value);setQuote(null);setError('')}}><option value="">同じ団体の馬を選択</option>{options.choices.map(c=><option key={c.kind+c.id} value={c.kind+':'+c.id}>{c.name}（{c.number||'番号なし'}・{c.kind==='event'?'参加済み':'名簿から参加'}）</option>)}</select></label>
        <p>候補にない馬は「人馬の登録」で団体の名簿に登録してから、元の馬を選び直してください。</p>
        <h4 className="font-bold">引き継ぐ出番（{rows.length}件）</h4>
        {rows.length===0&&<p>元の馬の出番はありません。参加馬だけを差し替えます。</p>}
        {rows.map((r,i)=>{const start=options.entries[i],c=comp(r.competition);return <div key={r.id} className="space-y-2 rounded-lg border p-3">
          <p className="font-semibold">{compName(start.competition)}・{start.position}番　{rider(start.rider)}</p>
          <label>変更後の競技<select className={field} value={r.competition} onChange={e=>{const id=e.target.value,d=comp(id);edit(r.id,{competition:id,op:!!(r.op&&d&&allowsOp(d)),membership:d?.member_fee!=null||d?.nonmember_fee!=null?r.membership:null,instructor:false})}}>{data.competitions.map(c=><option key={c.id} value={c.id}>{c.competition_date.slice(5)}　{compName(c.id)}</option>)}</select></label>
          {(c?.member_fee!=null||c?.nonmember_fee!=null)&&<label>料金区分<select className={field} value={r.membership??''} onChange={e=>edit(r.id,{membership:e.target.value||null})}><option value="">選択</option><option value="member">会員</option><option value="nonmember">非会員</option></select></label>}
          {c&&allowsOp(c)&&<label className="block"><input type="checkbox" checked={r.op} onChange={e=>edit(r.id,{op:e.target.checked})}/> OP参加</label>}
          {c&&needsInstructor(c.id)&&<label className="block"><input type="checkbox" checked={r.instructor} onChange={e=>edit(r.id,{instructor:e.target.checked})}/> 地域乗馬指導者資格を確認済み</label>}
        </div>})}
        <button disabled={!choice} className={button} onClick={preview}>差し替え内容と請求差額を確認</button>
      </>}
    </fieldset>
    {quote&&<section className="space-y-2 rounded-xl border-2 border-blue-700 p-4">
      <h4 className="text-xl font-bold">{quote.old} → {quote.new}</h4>
      <p>団体の参加馬　{quote.oldCount}頭 → {quote.newCount}頭　／　馬匹登録料差額 {yen(quote.registration)}</p>
      {quote.entries.map(e=><p key={e.id}>{rider(e.rider)}　{compName(e.competition)} → {compName(e.to)}（{e.competition===e.to?'出番順を維持':'変更先の末尾'}）　競技料 {yen(e.oldFee)} → {yen(e.newFee)}　変更料 {yen(e.service)}</p>)}
      <p>{quote.late?feeNote:'締切前のため、変更料は無料です。'}</p>
      {quote.billing.map(b=><div key={b.billTo}><p><strong>{orgName(b.billTo)}　請求差額 {yen(sum(b))}</strong>（競技料 {yen(b.difference)}・変更料 {yen(b.service)}・馬匹登録料 {yen(b.registration)}）</p><p>請求総額 {yen(b.beforeTotal)} → {yen(b.afterTotal)}　／　入金差引後 {yen(b.beforeRemaining)} → {yen(b.afterRemaining)}</p></div>)}
      <button className={button} disabled={busy} onClick={confirm}>{attempt?'同じ内容で確定結果を再確認':'この内容で差し替えを確定'}</button>
    </section>}
    {busy&&<p role="status">確認中…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert" className="font-semibold text-red-800">{error}</p>}
  </div>
}
