"use client"
import {useEffect,useRef,useState} from 'react'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
import {archiveRosterEntity,clubEntities,loadSharedRoster,refreshRosterEntity,refreshRosterParticipants,saveRosterEntity,saveWinterParticipants,type SharedRoster,type RosterClub,type RosterEntity} from '@/lib/shared-roster'
import {compareWinterOrganizations} from '@/lib/winter-display-order'
const field='min-h-14 w-full rounded-xl border-2 p-3 text-xl'
const button='min-h-14 rounded-xl bg-blue-800 p-3 text-xl font-bold text-white disabled:opacity-50'
export function SharedRosterManager({session,onParticipantsSaved}:{session:AdminSession;onParticipantsSaved:()=>void}){
 const [data,setData]=useState<SharedRoster|null>(null),[club,setClub]=useState(''),[selected,setSelected]=useState<string[]>([]),[expected,setExpected]=useState<string[]>([])
 const [clubs,setClubs]=useState<RosterClub[]>([]),[loading,setLoading]=useState(true),clubRef=useRef('')
 const [message,setMessage]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false),lock=useRef(false)
 const [edit,setEdit]=useState<RosterEntity|null>(null),[kind,setKind]=useState<'rider'|'horse'>('rider'),[name,setName]=useState(''),[reading,setReading]=useState(''),[number,setNumber]=useState(''),[clubName,setClubName]=useState('')
 const [replaceAffiliations,setReplaceAffiliations]=useState(false)
 const [search,setSearch]=useState('')
 const editorRef=useRef<HTMLDetailsElement>(null),nameRef=useRef<HTMLInputElement>(null),initialized=useRef(false)
 async function verifySession(){let timer:ReturnType<typeof setTimeout>|undefined;try{return await Promise.race([verifyAdminSession(session),new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(new Error('本部ログインの確認が時間切れです。接続を確認して再度お試しください')),15000)})])}finally{clearTimeout(timer)}}
 async function updateEntity(id:unknown,token:string){if(!data||typeof id!=='string')throw new Error('保存した人馬の番号を確認できません。名簿を再読み込みしてください');const value=await refreshRosterEntity(data,id,token);setData(value);setClubs(value.clubs)}
 async function reload(){setLoading(true);try{const verified=await verifySession();const value=await loadSharedRoster(verified.accessToken,setClubs);setData(value);return value}finally{setLoading(false)}}
 useEffect(()=>{let active=true;verifySession().then(v=>loadSharedRoster(v.accessToken,c=>{if(active)setClubs(c)})).then(v=>{if(active){setData(v);if(!initialized.current){choose(clubRef.current,v);initialized.current=true}}}).catch(e=>{if(active)setError(e instanceof Error?e.message:'名簿を読み込めません')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[session.refreshToken])
 function choose(id:string,value=data){clubRef.current=id;setClub(id);const ids=value?.participants.filter(x=>x.club_id===id).map(x=>x.entity_id)??[];setSelected(ids);setExpected(ids)}
 async function operation(action:()=>Promise<string>){if(lock.current)return;lock.current=true;setBusy(true);setMessage('');setError('');try{setMessage(await action())}catch(e){setError(e instanceof Error?e.message:'保存できません')}finally{lock.current=false;setBusy(false)}}
 function beginEdit(entity:RosterEntity){
  setEdit(entity);setReplaceAffiliations(false);setKind(entity.kind);setName(entity.name);setReading(entity.reading);setNumber(entity.jef_number??'');setError('');setMessage('')
  const existing=data?.affiliations.find(a=>a.entity_id===entity.id&&a.ended_at===null)
  setClubName(data?.clubs.find(x=>x.id===(club||existing?.club_id))?.name??'')
  requestAnimationFrame(()=>{if(editorRef.current){editorRef.current.open=true;editorRef.current.scrollIntoView({block:'start'});nameRef.current?.focus({preventScroll:true})}})
 }

 const normalize=(value:string)=>value.normalize('NFKC').replace(/\s+/g,'').toLocaleLowerCase('ja')
 const query=normalize(search)
 const matches=query?data?.entities.filter(x=>!x.archived_at&&[x.name,x.reading,x.jef_number??''].some(v=>normalize(v).includes(query)))??[]:[]
 const currentMembers=data?clubEntities(data,club):[]
 const currentIds=new Set(currentMembers.map(x=>x.id))
 const savedHere=new Set(data?.participants.filter(x=>x.club_id===club).map(x=>x.entity_id)??[])
 const members=[...currentMembers,...(data?.entities.filter(x=>savedHere.has(x.id)&&!currentIds.has(x.id))??[])]
 return <section className="space-y-5 rounded-xl border-2 border-blue-300 p-4">
  <h2 className="text-3xl font-bold">人馬名簿</h2>{error&&<p role="alert" className="rounded-xl bg-red-100 p-3 text-xl">{error}</p>}{message&&<p role="status" className="rounded-xl bg-slate-100 p-3 text-xl">{message}</p>}<p className="text-lg">継続して使う名簿と、Winterに参加する人馬を管理します。読みは推測しません。</p>
  <fieldset disabled={busy} className="space-y-4">
   {data&&<p className="text-lg">登録済み：選手 {data.entities.filter(x=>x.kind==='rider'&&!x.archived_at).length.toLocaleString()} 名 ／ 馬 {data.entities.filter(x=>x.kind==='horse'&&!x.archived_at).length.toLocaleString()} 頭</p>}
   {busy&&<p role="status" className="rounded-xl bg-blue-50 p-3 text-xl">保存内容を確認しています…（通信が遅い場合は時間切れで操作に戻ります）</p>}{loading&&<p role="status" className="rounded-xl bg-blue-50 p-3 text-xl">{clubs.length?`団体 ${clubs.length}件を読み込みました。選手・馬の名簿を読み込んでいます…`:'共通名簿の団体を読み込んでいます…'}</p>}
   <label className="block text-xl">共通名簿の所属団体<select disabled={!clubs.length} className={field} value={club} onChange={e=>choose(e.target.value)}><option value="">団体を選択</option>{[...clubs].sort(compareWinterOrganizations).map(x=><option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
   <fieldset disabled={!data||loading} className="space-y-4">
   <details><summary className="cursor-pointer py-3 text-2xl font-bold">名簿全体から人馬を探す・所属を追加する</summary><label className="block text-xl">名前・フリガナ・日馬連番号<input className={field} value={search} onChange={e=>setSearch(e.target.value)} placeholder="所属が未登録の人馬も検索できます"/></label>{query&&<p role="status">{matches.length} 件{matches.length>50?'（先頭50件を表示。検索を絞ってください）':''}</p>}{matches.slice(0,50).map(x=><div key={x.id} className="my-2 rounded-xl border p-3"><p className="text-xl">{x.kind==='rider'?'選手':'馬'}：{x.name}</p><p>{x.reading||'読み未登録'} ／ 日馬連 {x.jef_number??'未登録'}</p><p>所属：{data?.affiliations.filter(a=>a.entity_id===x.id&&a.ended_at===null).map(a=>data.clubs.find(c=>c.id===a.club_id)?.name).join(' ／ ')||'未登録'}</p><button type="button" className="mt-2 rounded-lg border-2 p-3 text-lg" onClick={()=>beginEdit(x)}>この人馬を編集・所属追加</button></div>)}</details>
   {data&&data.clubs.length===0&&<p>整理した名簿の一括取込はまだ行っていません。下で個別登録できます。</p>}
   {club&&<>{(['rider','horse'] as const).map(type=><div key={type}><h3 className="text-2xl font-bold">{type==='rider'?'選手':'馬'}：今大会に参加する人馬にチェック</h3>{members.filter(x=>x.kind===type).map(x=><div key={x.id} className="my-2 flex flex-wrap items-center gap-3 rounded-xl border p-3"><label className="flex flex-1 items-center gap-3 text-xl"><input type="checkbox" className="size-7" checked={selected.includes(x.id)} onChange={e=>setSelected(ids=>e.target.checked?[...new Set([...ids,x.id])]:ids.filter(id=>id!==x.id))}/><span>{x.name}<small className="block text-base">{x.reading||'読み未登録'} ／ 日馬連 {x.jef_number??'未登録'}{!currentIds.has(x.id)&&' ／ 所属変更済み・保存時の参加記録'}</small></span></label><button type="button" className="rounded-lg border-2 p-3 text-lg" onClick={()=>beginEdit(x)}>編集・所属変更</button></div>)}</div>)}
    <button type="button" className={button} onClick={()=>operation(async()=>{const v=await verifySession();await saveWinterParticipants(club,selected,expected,v.accessToken);if(!data)throw new Error('名簿を確認できません');const fresh=await refreshRosterParticipants(data,v.accessToken);setData(fresh);choose(club,fresh);onParticipantsSaved();return '参加名簿を保存しました。Winter受付で選べます'})}>参加チェックを保存</button>
   </>}
   <details ref={editorRef} className="scroll-mt-5" open={!!edit||undefined}><summary className="cursor-pointer py-3 text-2xl font-bold">{edit?`${edit.kind==='rider'?'選手':'馬'}「${edit.name}」を編集`:'新しい選手・馬を登録'}</summary><div className="space-y-3">
    <label className="block">種類<select className={field} value={kind} disabled={!!edit} onChange={e=>setKind(e.target.value as 'rider'|'horse')}><option value="rider">選手</option><option value="horse">馬</option></select></label>
    <label className="block">氏名・馬名<input ref={nameRef} className={field} value={name} maxLength={100} onChange={e=>setName(e.target.value)}/></label>
    <label className="block">正式フリガナ・放送用読み<input className={field} value={reading} maxLength={200} onChange={e=>setReading(e.target.value)}/></label>
    <label className="block">確認済みの日馬連番号（未登録は空欄）<input className={field} inputMode="numeric" value={number} onChange={e=>setNumber(e.target.value)}/></label>
    {edit&&<p>登録中の所属：{data?.affiliations.filter(x=>x.entity_id===edit.id&&x.ended_at===null).map(x=>data.clubs.find(c=>c.id===x.club_id)?.name).join(' ／ ')}</p>}
    <label className="block">保存する所属クラブ<input className={field} list="roster-clubs" value={clubName} maxLength={150} onChange={e=>setClubName(e.target.value)}/><datalist id="roster-clubs">{data?.clubs.map(x=><option key={x.id} value={x.name}/>)}</datalist></label>
    {edit&&<label className="flex items-center gap-3 text-xl"><input type="checkbox" className="size-7" checked={replaceAffiliations} onChange={e=>setReplaceAffiliations(e.target.checked)}/>他の所属を終了して、このクラブだけにする</label>}
    {error&&edit&&<p role="alert" className="rounded-xl bg-red-100 p-3 text-xl">{error}</p>}<p>通常の保存は他の所属も残します。保存済みの大会参加時の所属は変更しません。</p>
    <button type="button" className={button} onClick={()=>operation(async()=>{const v=await verifySession();const savedId=await saveRosterEntity({kind,name,reading,jefNumber:number,clubName,id:edit?.id,expectedUpdatedAt:edit?.updated_at,replaceAffiliations},v.accessToken);await updateEntity(savedId,v.accessToken);setEdit(null);setReplaceAffiliations(false);setName('');setReading('');setNumber('');return '人馬名簿を保存しました'})}>名簿に保存</button>
    {edit&&!edit.archived_at&&<button type="button" className="ml-3 rounded-xl border-2 border-red-700 p-3 text-red-800" onClick={()=>{if(!window.confirm(`${edit.name} を名簿から削除しますか？大会記録は残ります。`))return;void operation(async()=>{const v=await verifySession();const savedId=await archiveRosterEntity(edit,v.accessToken);await updateEntity(savedId,v.accessToken);setEdit(null);setName('');setReading('');setNumber('');return '名簿から削除しました。大会記録は保持しています'})}}>この人馬を名簿から削除</button>}
    {edit&&<button type="button" className="ml-3 rounded-xl border-2 p-3" onClick={()=>{setEdit(null);setName('');setReading('');setNumber('')}}>新規登録に戻る</button>}
   </div></details>
   </fieldset>
   <button type="button" className="rounded-xl border-2 p-3 text-xl" onClick={()=>operation(async()=>{await reload();return '再読み込みしました。選択中の参加チェックは保持しています'})}>保存済み名簿を再読み込み</button>
  </fieldset>
 </section>
}
