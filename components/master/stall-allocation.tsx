"use client"
import type {StallRequest} from '@/lib/master/stall-request'
import { useEffect, useRef, useState } from 'react'
import type { StableGroup } from '@/lib/master/stable-information'
import { barnIds, stalls, tentIds, createStallPlan, defaultStallOptions, editStall, groupAllocation, horseTotal, moveStallGroup, readStallPlan, reconcileStallGroups, stallPlanIssues, stallSourceKey, standardTR, type SavedStallPlan, type StallOptions, type StallPlan, type StallUse } from '@/lib/master/stall-allocation'
import { stallPlanPrintHtml, stallPlanSvg } from '@/lib/master/stall-allocation-print'
import { usePrintDocument } from './use-print-document'

const primary='min-h-14 rounded-xl border-2 border-primary bg-primary px-5 py-3 text-lg font-bold text-primary-foreground disabled:opacity-40'
const secondary='min-h-12 rounded-xl border-2 border-primary bg-background px-4 py-2 font-bold text-primary disabled:opacity-40'
const field='mt-1 min-h-12 w-full rounded-lg border-2 bg-background p-2 text-base'
type RequestSource=Record<string,{value:StallRequest;revision:string}>
type LoadResult={groups:StableGroup[];saved:SavedStallPlan|null;requestSource?:RequestSource}
function withRequests(options:StallOptions,groups:StableGroup[],source?:RequestSource):StallOptions{
 const layout=options.layout??defaultStallOptions(groups).layout!
 const rows=Object.entries(source??{}).filter(([id])=>groups.some(g=>g.id===id))
 return {...options,layout:{...layout,requests:Object.fromEntries(rows.map(([id,r])=>[id,r.value])),requestVersions:Object.fromEntries(rows.map(([id,r])=>[id,r.revision]))}}
}
export function MasterStallAllocation({groups,eventName,active=true,onLoad,onSave,requestSource}: {
  requestSource?:RequestSource;groups:StableGroup[];eventName:string;active?:boolean;onLoad:()=>Promise<LoadResult>;
  onSave:(plan:StallPlan,expected:string|null)=>Promise<SavedStallPlan>
}){
  const [plan,setPlan]=useState<StallPlan|null>(null),[saved,setSaved]=useState<SavedStallPlan|null>(null)
  const [source,setSource]=useState(groups),[options,setOptions]=useState<StallOptions>(defaultStallOptions(groups))
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loaded,setLoaded]=useState(false)
  const [complete,setComplete]=useState(false),[replace,setReplace]=useState(false),[discard,setDiscard]=useState(false)
  const [barn,setBarn]=useState('1'),[slotId,setSlotId]=useState(''),[kind,setKind]=useState<'empty'|StallUse['kind']>('empty'),[groupId,setGroupId]=useState(''),[horseId,setHorseId]=useState(''),[note,setNote]=useState(''),[wire,setWire]=useState(false)
  const [moveGroup,setMoveGroup]=useState(''),[moveBarn,setMoveBarn]=useState('1')
  const lock=useRef(false),loadedRef=useRef(false),alive=useRef(true),loadRef=useRef(onLoad);loadRef.current=onLoad
  const printer=usePrintDocument(), pending=!!busy||printer.busy
  const dirty=!!plan&&JSON.stringify(plan)!==JSON.stringify(saved?.plan)
  const freshSource=source
  const stale=!!plan&&stallSourceKey(plan.groups)!==stallSourceKey(freshSource)
  const requestsStale=!!plan&&requestSource!==undefined&&JSON.stringify(Object.entries(plan.options.layout?.requestVersions??{}).sort())!==JSON.stringify(Object.entries(requestSource).map(([id,r])=>[id,r.revision]).sort())
  const issues=plan?stallPlanIssues(plan):[]
  useEffect(()=>{alive.current=true;return()=>{alive.current=false}},[])
  useEffect(()=>{setSource(groups)},[groups])
  useEffect(()=>{
    if(!active||loadedRef.current)return
    loadedRef.current=true
    void reload()
  },[active]) // Explicit reload protects edits from background parent refreshes.
  useEffect(()=>{if(!dirty)return;const leave=(e:BeforeUnloadEvent)=>{e.preventDefault();e.returnValue=''};window.addEventListener('beforeunload',leave);return()=>window.removeEventListener('beforeunload',leave)},[dirty])
  async function run(label:string,work:()=>Promise<void>){
    if(lock.current)return;lock.current=true;setBusy(label);setError('');setNotice('')
    try{await work()}catch(e){if(alive.current)setError(e instanceof Error?e.message:'処理できませんでした。もう一度確認してください。')}
    finally{lock.current=false;if(alive.current)setBusy('')}
  }
  async function reload(){await run('保存済みの厩舎割を読み込み中…',async()=>{
    const r=await loadRef.current();if(!alive.current)return
    setSource(r.groups);setSaved(r.saved);setPlan(r.saved?.plan??null);setOptions(r.saved?.plan.options??defaultStallOptions(r.groups));setLoaded(true);setDiscard(false);setReplace(false);setSlotId('');setNotice(r.saved?'保存済みの厩舎割を読み込みました。':'まだ厩舎割は作成されていません。')
  })}
  function change(p:StallPlan){setPlan(p);setOptions(p.options);setNotice('変更しました。まだ保存していません。');setError('')}
  function changeOptions(o:StallOptions){setOptions(o);if(plan)change({...plan,options:o})}
  async function generate(){
    if(!complete||plan&&!replace)return
    await run('最新の団体・頭数から配置案を作成中…',async()=>{
      const r=await loadRef.current();if(!alive.current)return
      if((r.saved?.requestId??null)!==(saved?.requestId??null))throw new Error('別の端末で厩舎割が更新されています。保存済みの内容を読み直してください。')
      const p=createStallPlan(r.groups,withRequests(options,r.groups,r.requestSource))
      setSource(r.groups);setPlan(p);setOptions(p.options);setReplace(false);setSlotId('');setNotice('配置案を作成しました。内容を確認し「厩舎割を保存」を押してください。まだ保存していません。')
    })
  }
  async function save(){if(!plan)return;await run('厩舎割を保存中…',async()=>{
    const valid=readStallPlan(plan),r=await onSave(valid,saved?.requestId??null)
    if(!alive.current)return;setSaved(r);setPlan(r.plan);setNotice(`保存が完了しました（${new Date(r.savedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}）。`)
  })}
  function selectSlot(id:string){if(!plan)return;const s=stalls.find(s=>s.id===id);if(!s)return;const c=plan.cells[id];setSlotId(id);setBarn(s.barn);setKind(c?.kind??'empty');setGroupId(c?.groupId??'');setHorseId(c?.horseId??'');setNote(c?.note??'');setWire(plan.wireHorseSlots.includes(id));setError('')}
  function applySlot(){if(!plan||!slotId)return;try{
    if((kind==='horse'||kind==='tr')&&!groupId)throw new Error('団体を選んでください。')
    if(kind==='horse'&&!horseId)throw new Error('馬を選んでください。')
    change(editStall(plan,slotId,kind==='empty'?null:{kind,groupId:kind==='blocked'?'':groupId,horseId:kind==='horse'?horseId:'',note},wire))
  }catch(e){setError(e instanceof Error?e.message:'区画を変更できませんでした。')}}
  const currentSlot=stalls.find(s=>s.id===slotId),editingGroup=plan?.groups.find(g=>g.id===groupId)
  const allGroups=plan?.groups??source
  return <section className="master-action-surface space-y-4 rounded-xl border-2 bg-card p-4" aria-label="厩舎割の作成と修正">
    <h3 className="text-2xl font-bold">厩舎配置図・厩舎割</h3>
    <p>締切後、全団体を取り込んでから作成してください。S・1〜10番厩舎の共通マスターを使います。</p>
    <div className="rounded-xl border bg-blue-50 p-4 text-blue-950"><strong>{allGroups.length}団体 ／ {horseTotal(allGroups)}頭</strong><p>団体の馬とTRを同じ区画にまとめ、希望厩舎・近接理由を優先します。Sはフジファームを優先し、その他は大会ごとの条件で決めます。</p></div>
    <details className="rounded-lg border p-3"><summary className="cursor-pointer font-bold">配分ルールと作成設定を開く</summary>
      <p className="my-3">TRは道具・餌の保管場所です。ワイヤー区画は自動では馬を配置しません。151頭以上は各厩舎にTR2枠分のテントを確保します。テントは厩舎内で共有し、通常厩舎では各団体に屋内TRを最低1つ確保します。</p>
      <div className="grid gap-4 md:grid-cols-3">
        <label>S厩舎の優先団体<select className={field} disabled={pending} value={options.priorityId} onChange={e=>changeOptions({...options,priorityId:e.target.value})}><option value="">指定なし</option>{allGroups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>
        <label>Sに優先する少頭数団体（頭以下）<input className={field} type="number" min="0" max="24" disabled={pending} value={options.smallMax} onChange={e=>changeOptions({...options,smallMax:Number(e.target.value)})}/></label>
      </div>
      <div className="my-3 space-y-3"><strong>使用する厩舎（外した棟は予備）</strong><div className="flex flex-wrap gap-3">{barnIds.map(b=><label key={b} className="flex min-h-12 items-center gap-2"><input type="checkbox" disabled={pending} checked={(options.layout?.enabledBarns??barnIds).includes(b)} onChange={e=>{const l=options.layout??defaultStallOptions(allGroups).layout!;changeOptions({...options,layout:{...l,enabledBarns:e.target.checked?barnIds.filter(x=>x===b||l.enabledBarns.includes(x)):l.enabledBarns.filter(x=>x!==b)}})}}/>{b}厩舎</label>)}</div><label className="block">通常厩舎の目安頭数（空きが足りない場合は超過して要確認表示）<input type="number" className={field} min={1} max={18} disabled={pending} value={options.layout?.normalHorseLimit??13} onChange={e=>changeOptions({...options,layout:{...(options.layout??defaultStallOptions(allGroups).layout!),normalHorseLimit:Number(e.target.value)}})}/></label><label className="flex min-h-12 items-center gap-3"><input type="checkbox" disabled={pending} checked={options.layout?.extraTR??false} onChange={e=>changeOptions({...options,layout:{...(options.layout??defaultStallOptions(allGroups).layout!),extraTR:e.target.checked}})}/>使用する棟の余裕を、各団体に隣接する追加TRとして配分する</label><p>TR表は最低必要数です。Sの通路利用は団体別の要望で個別に指定します。頭数の目安・予備棟・追加TRは大会ごとに調整してください。</p></div>
      <p className="mt-3 text-sm">優先団体・少頭数・使用棟・目安頭数の設定は、配置案の再作成時に反映します。Sの通路利用は要望で個別に指定し、作成済みの割り当ても団体別一覧で変更できます。</p>
      <table className="my-3 w-full border-collapse text-sm"><thead><tr><th>大会総頭数</th><th>団体の頭数 → TR数</th></tr></thead><tbody><tr><td>1〜100</td><td>1〜3 → 1 ／ 4〜7 → 2 ／ 8〜10 → 3 ／ 11〜13 → 4 ／ 14〜16 → 5</td></tr><tr><td>101〜150</td><td>1〜4 → 1 ／ 5〜8 → 2 ／ 9〜12 → 3 ／ 13〜16 → 4</td></tr><tr><td>151〜200</td><td>1〜5 → 1 ／ 6〜10 → 2 ／ 11〜15 → 3 ／ 16以上 → 4</td></tr></tbody></table>
      <h4 className="font-bold">TR数を個別に指定する</h4><p>200頭超、150頭以下で17頭以上の団体は個別指定が必要です。変更する場合は理由も入力してください。</p>
      <div className="grid gap-3 md:grid-cols-2">{allGroups.map(g=>{const override=options.trOverrides[g.id],standard=standardTR(horseTotal(allGroups),g.horses.length);return <div key={g.id} className={`rounded-lg border p-3 ${standard===null?'bg-amber-50':''}`}><label className="block">{g.name}（{g.horses.length}頭・基準{standard??'未設定'}）<input aria-label={`${g.name}の個別TR数`} className={field} type="number" min="1" max="50" placeholder="基準を使用" disabled={pending} value={override?.count??''} onChange={e=>{const v={...options.trOverrides};if(!e.target.value)delete v[g.id];else v[g.id]={count:Number(e.target.value),reason:v[g.id]?.reason??''};changeOptions({...options,trOverrides:v})}}/></label>{override&&<label>個別指定の理由<input className={field} disabled={pending} value={override.reason} onChange={e=>changeOptions({...options,trOverrides:{...options.trOverrides,[g.id]:{...override,reason:e.target.value}}})}/></label>}</div>})}</div>
    </details>
    <label className="flex min-h-14 items-center gap-3 rounded-xl border-2 p-3 font-bold"><input type="checkbox" className="h-6 w-6" checked={complete} disabled={pending} onChange={e=>setComplete(e.target.checked)}/>申込締切を過ぎ、全団体の読み込みが完了しました</label>
    {plan&&<label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={replace} disabled={pending} onChange={e=>setReplace(e.target.checked)}/>配置案を作り直す（現在の手動配置は置き換わります）</label>}
    <div className="flex flex-wrap gap-3"><button type="button" className={primary} disabled={pending||!loaded||!complete||!!plan&&!replace||!source.length} onClick={()=>void generate()}>{plan?'厩舎割を再作成':'厩舎割を作成'}</button><button type="button" className={secondary} disabled={pending||dirty&&!discard} onClick={()=>void reload()}>保存済みの厩舎割を読み直す</button></div>
    {dirty&&<label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={discard} onChange={e=>setDiscard(e.target.checked)}/>編集中の内容を破棄して読み直す</label>}
    {busy&&<p role="status" className="rounded-lg bg-blue-100 p-4 font-bold">{busy}</p>}
    {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-4 font-bold text-emerald-900">{notice}</p>}
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-4 font-bold text-red-900">{error}</p>}
    {plan&&<>
      {requestsStale&&<div role="alert" className="rounded-lg bg-amber-100 p-4"><p>保存後に団体の厩舎割要望が変わりました。配置を保持して条件を読み込み、未反映の希望を確認してください。</p><button className={secondary} disabled={pending} onClick={()=>void run('最新の要望を読み込み中…',async()=>{const r=await loadRef.current();if((r.saved?.requestId??null)!==(saved?.requestId??null))throw new Error('別の端末で厩舎割が更新されています。読み直してください。');change({...plan,options:withRequests(plan.options,plan.groups,r.requestSource)})})}>最新の要望を配置条件に反映（配置を維持）</button></div>}

      {stale&&<div role="alert" className="rounded-lg bg-amber-100 p-4"><p className="font-bold">登録団体・馬が作成時から変わっています。保存・印刷の前に更新してください。</p><button className={secondary} disabled={pending} onClick={()=>void run('最新の参加馬を確認中…',async()=>{const r=await loadRef.current();setSource(r.groups);change(reconcileStallGroups(plan,r.groups))})}>最新の団体・頭数を反映（配置を維持）</button></div>}
      <p className="font-bold">{dirty?'編集中・未保存':'保存済み'} ／ 未配置 {horseTotal(plan.groups)-Object.values(plan.cells).filter(c=>c.kind==='horse').length}頭 ／ 要確認 {issues.length}件</p>
      {!!issues.length&&<div role="alert" className="rounded-xl border-2 border-amber-500 bg-amber-50 p-4"><strong>次の箇所を修正してください。未完成のまま下書き保存できます。</strong><ul className="list-disc pl-5">{issues.map((v,i)=><li key={i}>{v}</li>)}</ul></div>}
      {!!plan.wireHorseSlots.length&&<p className="rounded-lg bg-amber-50 p-3">ワイヤー区画に手動配置した馬があります：{plan.wireHorseSlots.join('、')}</p>}
      <h4 className="text-xl font-bold">全体図</h4><p>図の馬房を押すと、その区画を下の編集欄で変更できます。</p>
      <div className="rounded-lg border bg-white" onClick={e=>{if(!pending){const id=(e.target as Element).closest('[data-slot]')?.getAttribute('data-slot');if(id)selectSlot(id)}}} onKeyDown={e=>{if(!pending&&(e.key==='Enter'||e.key===' ')){const id=(e.target as Element).closest('[data-slot]')?.getAttribute('data-slot');if(id){e.preventDefault();selectSlot(id)}}}} dangerouslySetInnerHTML={{__html:stallPlanSvg(plan,eventName)}}/>
      <details className="rounded-xl border-2 p-4" open><summary className="cursor-pointer text-xl font-bold">団体別の割り当て・まとめて移動</summary>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>団体</th><th>配置／頭数</th><th>厩舎</th><th>屋内TR</th><th>テント</th><th>S通路利用</th><th>要望の反映</th></tr></thead><tbody>{plan.groups.map(g=>{const a=groupAllocation(plan,g);return <tr key={g.id} className="border-t"><td className="py-3">{g.name}</td><td>{a.horses}／{g.horses.length}</td><td>{a.barns.join('・')||'未配置'}</td><td>{a.indoor}（必要{a.needed??'未設定'}）</td><td>{a.tent}</td><td><label><input aria-label={`${g.name}のS通路利用`} type="checkbox" disabled={pending} checked={plan.corridors.includes(g.id)} onChange={e=>change({...plan,corridors:e.target.checked?[...plan.corridors,g.id]:plan.corridors.filter(id=>id!==g.id)})}/>利用</label>{plan.corridors.includes(g.id)&&!a.corridor&&<small className="block text-amber-800">全頭をSに配置すると有効</small>}</td><td>{!plan.options.layout?.requests[g.id]?'指定なし':requestsStale?'更新あり':issues.some(i=>i.startsWith(g.name+'：'))?'未反映・要確認':'条件を満たしています'}</td></tr>})}</tbody></table></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3"><label>移動する団体<select className={field} disabled={pending} value={moveGroup} onChange={e=>setMoveGroup(e.target.value)}><option value="">選択してください</option>{plan.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label><label>移動先<select className={field} disabled={pending} value={moveBarn} onChange={e=>setMoveBarn(e.target.value)}>{barnIds.map(id=><option key={id} value={id}>{id}厩舎</option>)}</select></label><button className={secondary} disabled={pending||!moveGroup} onClick={()=>{try{change(moveStallGroup(plan,moveGroup,moveBarn))}catch(e){setError(e instanceof Error?e.message:'移動できません')}}}>この団体の馬とTRを移動</button></div>
      </details>
      <div className="space-y-3 rounded-xl border-2 p-4"><h4 className="text-xl font-bold">馬房ごとに修正する</h4>
        <label>厩舎<select className={field} disabled={pending} value={barn} onChange={e=>{setBarn(e.target.value);setSlotId('')}}>{barnIds.map(id=><option key={id}>{id}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{stalls.filter(s=>s.barn===barn).map(s=>{const c=plan.cells[s.id],g=plan.groups.find(g=>g.id===c?.groupId),h=g?.horses.find(h=>h.id===c?.horseId);return <button key={s.id} type="button" disabled={pending} className={`min-h-20 rounded-lg border-2 p-2 text-left ${s.id===slotId?'border-primary bg-blue-100':s.wire?'border-amber-500 bg-amber-50':'bg-background'}`} onClick={()=>selectSlot(s.id)}><strong>{s.number??s.id.split(':')[1]}{s.wire?'（ワイヤー）':''}</strong><span className="block">{h?.name??(c?.kind==='tr'?'TR':c?.kind==='blocked'?'使用不可':'空き')}</span><small>{g?.name}</small></button>})}</div>
        {slotId&&<fieldset className="space-y-3 rounded-lg border-2 border-primary p-4"><legend className="px-2 text-lg font-bold">{slotId}の編集</legend>
          <div className="grid gap-3 md:grid-cols-3"><label>使い方<select className={field} value={kind} disabled={pending} onChange={e=>setKind(e.target.value as typeof kind)}><option value="empty">空ける</option><option value="horse">馬</option><option value="tr">TR</option><option value="blocked">使用不可</option></select></label>{(kind==='horse'||kind==='tr')&&<label>団体<select className={field} value={groupId} disabled={pending} onChange={e=>{setGroupId(e.target.value);setHorseId('')}}><option value="">選択</option>{plan.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}{kind==='horse'&&<label>馬<select className={field} value={horseId} disabled={pending} onChange={e=>setHorseId(e.target.value)}><option value="">選択</option>{editingGroup?.horses.map(h=><option key={h.id} value={h.id}>{h.name} {Object.entries(plan.cells).find(([,c])=>c.kind==='horse'&&c.horseId===h.id)?.[0]??'未配置'}</option>)}</select></label>}</div>
          <label className="block">備考<input className={field} value={note} maxLength={500} disabled={pending} onChange={e=>setNote(e.target.value)}/></label>
          {currentSlot?.wire&&kind==='horse'&&<label className="flex min-h-14 items-center gap-3 rounded-lg bg-amber-100 p-3 font-bold"><input type="checkbox" checked={wire} disabled={pending} onChange={e=>setWire(e.target.checked)}/>この区画にはワイヤーがあります。現場を確認し、例外として馬を配置します</label>}
          <p className="text-sm">配置済みの馬を選ぶと元の区画から移動します。移動先にいた馬は未配置になり、上の要確認に表示されます。</p><button type="button" className={primary} disabled={pending} onClick={applySlot}>この区画に反映</button>
        </fieldset>}
        {horseTotal(plan.groups)>150&&barn!=='S'&&<fieldset className="rounded-lg border bg-blue-50 p-3"><legend>この厩舎の仮設テント（TR2枠分）</legend>{tentIds.filter(id=>id.startsWith(`${barn}:`)).map((id,i)=><label key={id} className="block">荷物枠{i+1}<select className={field} disabled={pending} value={plan.tents[id]??''} onChange={e=>{const tents={...plan.tents};if(e.target.value)tents[id]=e.target.value;else delete tents[id];change({...plan,tents})}}><option value="">未使用</option>{plan.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>)}</fieldset>}
      </div>
      <div className="flex flex-wrap gap-3"><button className={primary} disabled={pending||stale||requestsStale||!dirty} onClick={()=>void save()}>{issues.length?'厩舎割を下書き保存':'厩舎割を保存'}</button><button className={secondary} disabled={pending||dirty||stale||requestsStale||!!issues.length||!saved} onClick={()=>void printer.print(async()=>{const r=await loadRef.current();if(!r.saved)throw new Error('保存済みの厩舎割がありません。');if(r.saved.requestId!==saved?.requestId)throw new Error('別の端末で厩舎割が更新されています。保存済みの内容を読み直してから印刷してください。');if(stallSourceKey(r.groups)!==stallSourceKey(r.saved.plan.groups))throw new Error('登録内容が変わっています。厩舎割を更新してください。');if(r.requestSource&&JSON.stringify(Object.entries(r.saved.plan.options.layout?.requestVersions??{}).sort())!==JSON.stringify(Object.entries(r.requestSource).filter(([id])=>r.groups.some(g=>g.id===id)).map(([id,v])=>[id,v.revision]).sort()))throw new Error('厩舎割要望が変わっています。最新の要望を配置条件に反映してください。');return stallPlanPrintHtml(r.saved.plan,eventName)},'横')}>保存済みの厩舎割を印刷</button></div>
      {dirty&&<p className="font-bold text-amber-800">未保存の変更があります。保存してから印刷してください。</p>}
      {saved&&<p>最終保存：{new Date(saved.savedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>}
      {printer.notice&&<p role="status">{printer.notice}</p>}{printer.error&&<p role="alert">{printer.error}</p>}
    </>}
  </section>
}
