"use client"
import {inspectionForStart,timetablePhase,type TimetablePhase} from '@/lib/master/timetable'
import {MasterTimetableTimeField} from '@/components/master/timetable-time-field'
import {useRef,useState} from 'react'
import type {WinterTimetableRow} from '@/lib/winter-data'
import {loadWinterData} from '@/lib/winter-data'
import {winterRpc} from '@/lib/winter-reception'
import {verifyAdminSession,type AdminSession} from '@/lib/supabase-rest'
export function WinterTimetableEditor({competitionId,count,showInspection=true,initial,session,onSession,onChanged}:{competitionId:string;count:number;showInspection?:boolean;initial:WinterTimetableRow|null;session:AdminSession;onSession:(value:AdminSession)=>void;onChanged:()=>void}){
 const[expected,setExpected]=useState(initial),[inspection,setInspection]=useState(initial?.inspection_time??''),[start,setStart]=useState(initial?.start_time??''),[phase,setPhase]=useState<TimetablePhase>(timetablePhase(initial)??'provisional'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),lock=useRef(false)
 function updateStart(value:string){
  if(showInspection)setInspection(current=>inspectionForStart(current,start,value))
  setStart(value)
 }
 async function save(){if(lock.current)return;lock.current=true;setBusy(true);setError('');setMessage('');try{const verified=await verifyAdminSession(session);onSession(verified);const row=await winterRpc('save_winter_timetable',{p_competition_id:competitionId,p_inspection:inspection||null,p_start:start||null,p_phase:phase,p_expected:expected},verified.accessToken) as WinterTimetableRow;if(row?.competition_id!==competitionId||timetablePhase(row)!==phase)throw new Error('保存結果を確認できません');setExpected(row);setMessage(phase==='cancelled'?'競技の中止を保存しました':'時間設定を保存しました');onChanged()}catch(reason){setError(reason instanceof Error?reason.message:'保存できません')}finally{lock.current=false;setBusy(false)}}
 async function reload(){if(lock.current||!window.confirm('入力中の時間を破棄して最新の設定を読み込みますか？'))return;lock.current=true;setBusy(true);setError('');try{const data=await loadWinterData();const row=data.timetable.find(t=>t.competition_id===competitionId)??null;setExpected(row);setInspection(row?.inspection_time??'');setStart(row?.start_time??'');setPhase(timetablePhase(row)??'provisional');setMessage('最新の時間設定を読み込みました');onChanged()}catch(reason){setError(reason instanceof Error?reason.message:'読み込めません')}finally{lock.current=false;setBusy(false)}}
 const cancelled=phase==='cancelled'
 return <section className="space-y-3 rounded-xl border-2 bg-blue-50 p-4">
  <h3 className="text-xl font-bold">{showInspection ? '下見時間・開始時間' : '開始時間'}</h3>
  <p>{showInspection && 'コースデザイナー確認後に入力してください。'}未定は空欄にします。オープンチャットへの通知はこれまでどおり本部から行います。</p>
  {!cancelled && <>
   {showInspection && <MasterTimetableTimeField kind="inspection" label="下見時間" value={inspection} disabled={busy} onChange={setInspection}/>}
   <MasterTimetableTimeField kind="start" label="開始時間" value={start} disabled={busy} onChange={updateStart}/>
  </>}
  <label className="block text-xl">表記
   <select className="ml-3 min-h-14 rounded-xl border-2 p-3" disabled={busy} value={phase}
    onChange={e=>setPhase(e.target.value as TimetablePhase)}>
    <option value="provisional">予定</option><option value="final">確定</option>
    {(count===0 || cancelled) && <option value="cancelled">中止</option>}
   </select>
  </label>
  <button className="min-h-14 rounded-xl bg-blue-800 p-3 text-xl font-bold text-white" disabled={busy || (cancelled && count!==0)} onClick={()=>void save()}>
   {busy?'保存中…':cancelled?'中止を保存':'時間を保存'}
  </button>
  <button className="ml-3 min-h-14 rounded-xl border-2 p-3 text-xl" disabled={busy} onClick={()=>void reload()}>最新の時間を読み込む</button>
  {error&&<p role="alert" className="bg-red-100 p-3">{error}</p>}
  {message&&<p role="status">{message}</p>}
 </section>
}
