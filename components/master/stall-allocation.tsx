"use client"
import type {StallRequest} from '@/lib/master/stall-request'
import { useEffect, useRef, useState } from 'react'
import type { StableGroup } from '@/lib/master/stable-information'
import { barnIds, stalls, stallLocation, previewStallMove, tentIds, createStallPlan, defaultStallOptions, editStall, groupAllocation, horseTotal, moveStallGroup, readStallPlan, reconcileStallGroups, stallPlanIssues, stallSourceKey, standardTR, type SavedStallPlan, type StallOptions, type StallPlan, type StallUse } from '@/lib/master/stall-allocation'
import { openStallPlanFile, stallPlanFile } from '@/lib/master/stall-plan-file'
import { StallMap } from './stall-map'
import { stallPlanPrintHtml } from '@/lib/master/stall-allocation-print'
import { PdfDownload } from './pdf-download'
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
export function MasterStallAllocation({groups,eventName,eventId,active=true,onLoad,onSave,requestSource}: {
  requestSource?:RequestSource;groups:StableGroup[];eventName:string;eventId:string;active?:boolean;onLoad:()=>Promise<LoadResult>;
  onSave:(plan:StallPlan,expected:string|null)=>Promise<SavedStallPlan>
}){
  const [plan,setPlan]=useState<StallPlan|null>(null),[saved,setSaved]=useState<SavedStallPlan|null>(null)
  const [source,setSource]=useState(groups),[options,setOptions]=useState<StallOptions>(defaultStallOptions(groups))
  const [busy,setBusy]=useState(''),[error,setError]=useState(''),[notice,setNotice]=useState(''),[loaded,setLoaded]=useState(false)
  const [complete,setComplete]=useState(false),[replace,setReplace]=useState(false),[discard,setDiscard]=useState(false)
  const [barn,setBarn]=useState('1'),[slotId,setSlotId]=useState(''),[kind,setKind]=useState<'empty'|StallUse['kind']>('empty'),[groupId,setGroupId]=useState(''),[horseId,setHorseId]=useState(''),[note,setNote]=useState(''),[wire,setWire]=useState(false)
  const [moveGroup,setMoveGroup]=useState(''),[moveBarn,setMoveBarn]=useState('1')
  const lock=useRef(false),loadedRef=useRef(false),alive=useRef(true),loadRef=useRef(onLoad);loadRef.current=onLoad
  const [fileBase,setFileBase]=useState<string|null|undefined>(undefined)
  const expected=fileBase!==undefined?fileBase:(saved?.requestId??null)
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
    setSource(r.groups);setSaved(r.saved);setFileBase(undefined);setPlan(r.saved?.plan??null);setOptions(r.saved?.plan.options??defaultStallOptions(r.groups));setLoaded(true);setDiscard(false);setReplace(false);setSlotId('');setNotice(r.saved?'保存済みの厩舎割を読み込みました。':'まだ厩舎割は作成されていません。')
  })}
  function change(p:StallPlan){setPlan(p);setOptions(p.options);setNotice('変更しました。まだ保存していません。');setError('')}
  function changeOptions(o:StallOptions){setOptions(o);if(plan)change({...plan,options:o})}
  async function generate(){
    if(!complete||plan&&!replace)return
    await run('最新の団体・頭数から配置案を作成中…',async()=>{
      const r=await loadRef.current();if(!alive.current)return
      if((r.saved?.requestId??null)!==(saved?.requestId??null))throw new Error('別の端末で厩舎割が更新されています。保存済みの内容を読み直してください。')
      const p=createStallPlan(r.groups,withRequests(options,r.groups,r.requestSource))
      setSource(r.groups);setFileBase(undefined);setPlan(p);setOptions(p.options);setReplace(false);setSlotId('');setNotice('配置案を作成しました。内容を確認し「厩舎割を保存」を押してください。まだ保存していません。')
    })
  }
  async function save() {
    if (!plan) return
    const draft = plan
    await run('厩舎割を保存中…', async () => {
      for (let attempt=0; attempt<2; attempt++) {
        const current = await loadRef.current()
        if (!alive.current) return
        const value = reconcileStallGroups(draft, current.groups)
        if (current.requestSource !== undefined) value.options = withRequests(value.options, current.groups, current.requestSource)
        let result = current.saved
        if (!result || JSON.stringify(result.plan) !== JSON.stringify(value)) {
          if ((result?.requestId ?? null) !== expected) throw new Error('別の端末で厩舎割が更新されています。現在の配置は端末ファイルにも保存できます。')
          try {
            result = await onSave(readStallPlan(value), expected)
          } catch (e) {
            // The request/roster can change between the read and the version-checked write.
            if (!attempt && e instanceof Error && /要望が更新|保存済みの厩舎割要望|団体情報が変わ|参加馬情報が変わ|参加馬の頭数が変わ/.test(e.message)) continue
            throw e
          }
        }
        if (!alive.current) return
        setSource(current.groups);setSaved(result);setPlan(result.plan);setOptions(result.plan.options);setFileBase(undefined)
        setNotice(`保存が完了しました（${new Date(result.savedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}）。`)
        return
      }
    })
  }
  function downloadPlan() {
    if (!plan) return
    try {
      const blob = new Blob([stallPlanFile(eventId,expected,plan)],{type:'application/json'})
      const url = URL.createObjectURL(blob), link = document.createElement('a')
      link.href=url;link.download=eventName+'-厩舎割.json';link.click()
      window.setTimeout(()=>URL.revokeObjectURL(url),1000)
      setNotice('現在の配置を端末ファイルに書き出しました。')
    } catch (e) {setError(e instanceof Error ? e.message : 'ファイルに保存できませんでした。')}
  }
  async function restoreFile(file: File) {
    if (dirty && !window.confirm('編集中の配置をファイルの内容に置き換えますか？')) return
    await run('厩舎割ファイルを開いています…',async()=>{
      const data=openStallPlanFile(await file.text(),eventId)
      if (!alive.current) return
      loadedRef.current=true
      setPlan(data.plan);setOptions(data.plan.options);setFileBase(data.expected);setSlotId('');setLoaded(true)
      setNotice('ファイルの配置を開きました。本部へ保存するには「厩舎割を保存」を押してください。')
    })
  }
  function selectSlot(id:string, selectedPlan=plan){if(!selectedPlan)return;const s=stalls.find(s=>s.id===id);if(!s)return;const c=selectedPlan.cells[id];setSlotId(id);setBarn(s.barn);setKind(c?.kind??'empty');setGroupId(c?.groupId??'');setHorseId(c?.horseId??'');setNote(c?.note??'');setWire(selectedPlan.wireHorseSlots.includes(id));setError('')}
  function moveSlot(fromId: string, toId: string) {
    if (!plan || pending || lock.current) return
    function occupantName(cell: StallUse) {
      const group = plan!.groups.find(g => g.id === cell.groupId)
      if (cell.kind === 'tr') return (group?.name ?? '') + 'のTR'
      return group?.horses.find(h => h.id === cell.horseId)?.name ?? '馬'
    }
    try {
      const {next, swap, wireSlots} = previewStallMove(plan, fromId, toId)
      const source = stallLocation(fromId), destination = stallLocation(toId)
      const message = swap
        ? [source + 'の' + occupantName(plan.cells[fromId]) + 'と、' + destination + 'の' + occupantName(plan.cells[toId]) + 'を入れ替えます。']
        : []
      for (const slot of wireSlots) message.push(stallLocation(slot.id) + 'にはワイヤーがあります。現場を確認して馬を配置しますか？')
      if (message.length && !window.confirm(message.join('\n'))) return
      change(next)
      selectSlot(toId, next)
      setNotice(source + ' → ' + destination + (swap ? '：入れ替えました。' : '：移動しました。') + 'まだ保存していません。')
    } catch (e) {setError(e instanceof Error ? e.message : '馬房を移動できませんでした。')}
  }
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
        <label>Sに優先する少頭数団体（頭以下）<input className={field} type="number" min="0" max="24" disabled={pending} value={options.smallMax} onChange={e=>changeOptions({...options,smallMax:Math.min(24,Math.max(0,Math.round(Number(e.target.value)||0)))})}/></label>
      </div>
      <div className="my-3 space-y-3"><strong>使用する厩舎（外した棟は予備）</strong><div className="flex flex-wrap gap-3">{barnIds.map(b=><label key={b} className="flex min-h-12 items-center gap-2"><input type="checkbox" disabled={pending||options.layout?.enabledBarns.length===1&&options.layout.enabledBarns[0]===b} checked={(options.layout?.enabledBarns??barnIds).includes(b)} onChange={e=>{const l=options.layout??defaultStallOptions(allGroups).layout!;changeOptions({...options,layout:{...l,enabledBarns:e.target.checked?barnIds.filter(x=>x===b||l.enabledBarns.includes(x)):l.enabledBarns.filter(x=>x!==b)}})}}/>{b}厩舎</label>)}</div><label className="block">通常厩舎の自動配置の目安頭数<input type="number" className={field} min={1} max={18} disabled={pending} value={options.layout?.normalHorseLimit??13} onChange={e=>changeOptions({...options,layout:{...(options.layout??defaultStallOptions(allGroups).layout!),normalHorseLimit:Math.min(18,Math.max(1,Math.round(Number(e.target.value)||13)))}})}/></label><label className="flex min-h-12 items-center gap-3"><input type="checkbox" disabled={pending} checked={options.layout?.extraTR??false} onChange={e=>changeOptions({...options,layout:{...(options.layout??defaultStallOptions(allGroups).layout!),extraTR:e.target.checked}})}/>使用する棟の余裕を、各団体に隣接する追加TRとして配分する</label><p>TR表は自動配置の目安です。Sの通路利用は団体別の要望で個別に指定します。頭数の目安・予備棟・追加TRは大会ごとに調整してください。</p></div>
      <p className="mt-3 text-sm">優先団体・少頭数・使用棟・目安頭数の設定は、配置案の再作成時に反映します。Sの通路利用は要望で個別に指定し、作成済みの割り当ても団体別一覧で変更できます。</p>
      <table className="my-3 w-full border-collapse text-sm"><thead><tr><th>大会総頭数</th><th>団体の頭数 → TR数</th></tr></thead><tbody><tr><td>1〜100</td><td>1〜3 → 1 ／ 4〜7 → 2 ／ 8〜10 → 3 ／ 11〜13 → 4 ／ 14〜16 → 5</td></tr><tr><td>101〜150</td><td>1〜4 → 1 ／ 5〜8 → 2 ／ 9〜12 → 3 ／ 13〜16 → 4</td></tr><tr><td>151〜200</td><td>1〜5 → 1 ／ 6〜10 → 2 ／ 11〜15 → 3 ／ 16以上 → 4</td></tr></tbody></table>
      <h4 className="font-bold">TR数を個別に指定する</h4><p>表に目安がない団体には、個別指定がなければTRを1室分見込んで自動配置します。</p>
      <div className="grid gap-3 md:grid-cols-2">{allGroups.map(g=>{const override=options.trOverrides[g.id],standard=standardTR(horseTotal(allGroups),g.horses.length);return <div key={g.id} className={`rounded-lg border p-3 ${standard===null?'bg-amber-50':''}`}><label className="block">{g.name}（{g.horses.length}頭・基準{standard??'未設定'}）<input aria-label={`${g.name}の個別TR数`} className={field} type="number" min="1" max="50" placeholder="基準を使用" disabled={pending} value={override?.count??''} onChange={e=>{const v={...options.trOverrides};if(!e.target.value)delete v[g.id];else {const count=Number(e.target.value);if(!Number.isInteger(count)||count<1||count>50)return;v[g.id]={count,reason:v[g.id]?.reason||'管理者による個別指定'}};changeOptions({...options,trOverrides:v})}}/></label>{override&&<label>補足（任意）<input className={field} maxLength={500} disabled={pending} value={override.reason==='管理者による個別指定'?'':override.reason} onChange={e=>changeOptions({...options,trOverrides:{...options.trOverrides,[g.id]:{...override,reason:e.target.value.trim()?e.target.value:'管理者による個別指定'}}})}/></label>}</div>})}</div>
    </details>
    <label className="flex min-h-14 items-center gap-3 rounded-xl border-2 p-3 font-bold"><input type="checkbox" className="h-6 w-6" checked={complete} disabled={pending} onChange={e=>setComplete(e.target.checked)}/>申込締切を過ぎ、全団体の読み込みが完了しました</label>
    {plan&&<label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={replace} disabled={pending} onChange={e=>setReplace(e.target.checked)}/>配置案を作り直す（現在の手動配置は置き換わります）</label>}
    <div className="flex flex-wrap gap-3"><button type="button" className={primary} disabled={pending||!loaded||!complete||!!plan&&!replace||!source.length} onClick={()=>void generate()}>{plan?'厩舎割を再作成':'厩舎割を作成'}</button><button type="button" className={secondary} disabled={pending||dirty&&!discard} onClick={()=>void reload()}>保存済みの厩舎割を読み直す</button></div>
    {dirty&&<label className="flex min-h-12 items-center gap-3"><input type="checkbox" checked={discard} onChange={e=>setDiscard(e.target.checked)}/>編集中の内容を破棄して読み直す</label>}
    {busy&&<p role="status" className="rounded-lg bg-blue-100 p-4 font-bold">{busy}</p>}
    {notice&&<p role="status" className="rounded-lg bg-emerald-50 p-4 font-bold text-emerald-900">{notice}</p>}
    {error&&<p role="alert" className="rounded-lg bg-red-50 p-4 font-bold text-red-900">{error}</p>}
    {plan&&<>
      {(requestsStale||stale)&&<p>名簿または要望に更新があります。保存時に最新の内容を読み込みます。</p>}
      <p className="font-bold">{dirty?'編集中・未保存':'保存済み'} ／ 未配置 {horseTotal(plan.groups)-Object.values(plan.cells).filter(c=>c.kind==='horse').length}頭</p>
      {!!issues.length&&<details className="rounded-lg border p-3"><summary className="cursor-pointer">自動配置の参考情報（{issues.length}件）</summary><ul className="list-disc pl-5">{issues.map((v,i)=><li key={i}>{v}</li>)}</ul></details>}
      {!!plan.wireHorseSlots.length&&<p className="rounded-lg bg-amber-50 p-3">ワイヤー区画に手動配置した馬があります：{plan.wireHorseSlots.map(stallLocation).join('、')}</p>}
      <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="text-xl font-bold">全体図</h4><a href="#stall-save-print" className="font-bold underline underline-offset-4">保存・印刷へ</a></div><p>馬やTRを移動先の馬房へドラッグしてください。馬房をクリックすると、下の編集欄が開きます。</p>
      <StallMap plan={plan} eventName={eventName} disabled={pending} onSelect={selectSlot} onMove={moveSlot}/>
      <details className="rounded-xl border-2 p-4" open><summary className="cursor-pointer text-xl font-bold">団体別の割り当て・まとめて移動</summary>
        <div className="overflow-x-auto"><table className="w-full text-left"><thead><tr><th>団体</th><th>配置／頭数</th><th>厩舎</th><th>屋内TR</th><th>テント</th><th>S通路利用</th><th>要望の反映</th></tr></thead><tbody>{plan.groups.map(g=>{const a=groupAllocation(plan,g);return <tr key={g.id} className="border-t"><td className="py-3">{g.name}</td><td>{a.horses}／{g.horses.length}</td><td>{a.barns.join('・')||'未配置'}</td><td>{a.indoor}（目安{a.needed??'未設定'}）</td><td>{a.tent}</td><td><label><input aria-label={`${g.name}のS通路利用`} type="checkbox" disabled={pending} checked={plan.corridors.includes(g.id)} onChange={e=>change({...plan,corridors:e.target.checked?[...plan.corridors,g.id]:plan.corridors.filter(id=>id!==g.id)})}/>利用</label>{plan.corridors.includes(g.id)&&!a.corridor&&<small className="block text-amber-800">全頭をSに配置すると有効</small>}</td><td>{!plan.options.layout?.requests[g.id]?'指定なし':requestsStale?'更新あり':issues.some(i=>i.startsWith(g.name+'：'))?'目安との差あり':'反映済み'}</td></tr>})}</tbody></table></div>
        <div className="mt-4 grid gap-3 md:grid-cols-3"><label>移動する団体<select className={field} disabled={pending} value={moveGroup} onChange={e=>setMoveGroup(e.target.value)}><option value="">選択してください</option>{plan.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label><label>移動先<select className={field} disabled={pending} value={moveBarn} onChange={e=>setMoveBarn(e.target.value)}>{barnIds.map(id=><option key={id} value={id}>{id}厩舎</option>)}</select></label><button className={secondary} disabled={pending||!moveGroup} onClick={()=>{try{change(moveStallGroup(plan,moveGroup,moveBarn))}catch(e){setError(e instanceof Error?e.message:'移動できません')}}}>この団体の馬とTRを移動</button></div>
      </details>
      <div className="space-y-3 rounded-xl border-2 p-4"><h4 className="text-xl font-bold">馬房ごとに修正する</h4>
        <label>厩舎<select className={field} disabled={pending} value={barn} onChange={e=>{setBarn(e.target.value);setSlotId('')}}>{barnIds.map(id=><option key={id}>{id}</option>)}</select></label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{stalls.filter(s=>s.barn===barn).map(s=>{const c=plan.cells[s.id],g=plan.groups.find(g=>g.id===c?.groupId),h=g?.horses.find(h=>h.id===c?.horseId);return <button key={s.id} type="button" disabled={pending} className={`min-h-20 rounded-lg border-2 p-2 text-left ${s.id===slotId?'border-primary bg-blue-100':s.wire?'border-amber-500 bg-amber-50':'bg-background'}`} onClick={()=>selectSlot(s.id)}><strong>{s.number}番</strong><span className="block">{h?.name??(c?.kind==='tr'?'TR':c?.kind==='blocked'?'使用不可':'空き')}</span><small>{g?.name}</small></button>})}</div>
        {slotId&&<fieldset className="space-y-3 rounded-lg border-2 border-primary p-4"><legend className="px-2 text-lg font-bold">{stallLocation(slotId)}の編集</legend>
          <div className="grid gap-3 md:grid-cols-3"><label>使い方<select className={field} value={kind} disabled={pending} onChange={e=>setKind(e.target.value as typeof kind)}><option value="empty">空ける</option><option value="horse">馬</option><option value="tr">TR</option><option value="blocked">使用不可</option></select></label>{(kind==='horse'||kind==='tr')&&<label>団体<select className={field} value={groupId} disabled={pending} onChange={e=>{setGroupId(e.target.value);setHorseId('')}}><option value="">選択</option>{plan.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>}{kind==='horse'&&<label>馬<select className={field} value={horseId} disabled={pending} onChange={e=>setHorseId(e.target.value)}><option value="">選択</option>{editingGroup?.horses.map(h=><option key={h.id} value={h.id}>{h.name} {stallLocation(Object.entries(plan.cells).find(([,c])=>c.kind==='horse'&&c.horseId===h.id)?.[0])}</option>)}</select></label>}</div>
          <label className="block">備考<input className={field} value={note} maxLength={500} disabled={pending} onChange={e=>setNote(e.target.value)}/></label>
          {currentSlot?.wire&&kind==='horse'&&<label className="flex min-h-14 items-center gap-3 rounded-lg bg-amber-100 p-3 font-bold"><input type="checkbox" checked={wire} disabled={pending} onChange={e=>setWire(e.target.checked)}/>この区画にはワイヤーがあります。現場を確認し、例外として馬を配置します</label>}
          <p className="text-sm">配置済みの馬を選ぶと元の区画から移動します。移動先にいた馬は未配置になり、上の要確認に表示されます。</p><button type="button" className={primary} disabled={pending} onClick={applySlot}>この区画に反映</button>
        </fieldset>}
        {horseTotal(plan.groups)>150&&barn!=='S'&&<fieldset className="rounded-lg border bg-blue-50 p-3"><legend>この厩舎の仮設テント（TR2枠分）</legend>{tentIds.filter(id=>id.startsWith(`${barn}:`)).map((id,i)=><label key={id} className="block">荷物枠{i+1}<select className={field} disabled={pending} value={plan.tents[id]??''} onChange={e=>{const tents={...plan.tents};if(e.target.value)tents[id]=e.target.value;else delete tents[id];change({...plan,tents})}}><option value="">未使用</option>{plan.groups.map(g=><option key={g.id} value={g.id}>{g.name}</option>)}</select></label>)}</fieldset>}
      </div>
      <div id="stall-save-print" className="flex scroll-mt-4 flex-wrap gap-3">
        <button className={primary} disabled={pending} onClick={()=>void save()}>厩舎割を保存</button>
        <button className={secondary} disabled={printer.busy} onClick={()=>void printer.print(async()=>stallPlanPrintHtml(plan,eventName),'横')}>現在の厩舎割を印刷</button>
        <PdfDownload label="現在の厩舎割をPDFでダウンロード" filename={eventName+'_厩舎割'} generate={async()=>{
          const {stallAllocationPdf}=await import('@/lib/master/handout-pdf')
          return stallAllocationPdf(plan,eventName)
        }}/>
      </div>
      {saved&&<p>最終保存：{new Date(saved.savedAt).toLocaleString('ja-JP',{timeZone:'Asia/Tokyo'})}</p>}
      {printer.notice&&<p role="status">{printer.notice}</p>}{printer.error&&<p role="alert">{printer.error}</p>}
    </>}
    <details className="rounded-lg border p-3"><summary className="cursor-pointer font-bold">端末に保存・ファイルから再開</summary>
      <div className="my-2 flex flex-wrap gap-3">{plan&&<button type="button" className={secondary} onClick={downloadPlan}>現在の配置をファイルに保存</button>}
        <label className={secondary}>厩舎割ファイルを開く<input type="file" accept=".json" className="block" disabled={pending} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void restoreFile(file)}}/></label>
      </div>
    </details>
  </section>
}
