'use client'
import {useRef,useState} from 'react'
import type {AdminSession} from '@/lib/supabase-rest'
import {verifyAdminSession} from '@/lib/supabase-rest'
import {loadWinterData,type WinterHorseRow} from '@/lib/winter-data'
import {loadWinterRosterBindings,loadSharedRoster,saveWinterParticipants} from '@/lib/shared-roster'
import {WINTER_HORSE_REGISTRATION_FEE} from '@/lib/winter-horse-registration'
import {groupActionClass} from './master/group-registration-tools'
import {winterCompetitionLabel} from '@/lib/winter-display-order'

type Data=Awaited<ReturnType<typeof loadWinterData>>
export function WinterGroupHorseCancel({horse,data,session,onSession,onSaved}:{horse:WinterHorseRow;data:Data;session:AdminSession;onSession:(s:AdminSession)=>void;onSaved:()=>void}){
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),lock=useRef(false)
 const starts=data.entries.filter(e=>e.horse_id===horse.id&&!/^(wd|withdrawn)$/i.test(e.status))
 async function cancel(){
   if(lock.current||starts.length)return
   lock.current=true;setBusy(true);setError('')
   try{
     const verified=await verifyAdminSession(session);onSession(verified)
     const token=verified.accessToken
     const [bindings,roster,fresh]=await Promise.all([loadWinterRosterBindings(token),loadSharedRoster(token),loadWinterData()])
     const current=fresh.horses.find(h=>h.id===horse.id&&h.organization_id===horse.organization_id&&h.name===horse.name)
     const link=bindings.find(b=>b.horse_id===horse.id)
     if(!current||!link||fresh.entries.some(e=>e.horse_id===horse.id&&!/^(wd|withdrawn)$/i.test(e.status)))throw Error('この馬の参加登録・出番が変わりました。最新の内容を確認してください。')
     const expected=roster.participants.filter(p=>p.club_id===link.club_id).map(p=>p.entity_id)
     if(!expected.includes(link.entity_id))throw Error('この馬の参加登録を確認できません。')
     const keep=expected.filter(id=>id!==link.entity_id)
     let failed:unknown
     try{await saveWinterParticipants(link.club_id,keep,expected,token)}catch(e){failed=e}
     if((await loadWinterData()).horses.some(h=>h.id===horse.id))throw failed??Error('最新の参加名簿で取消を確認できません。')
     onSaved()
   }catch(e){setError(e instanceof Error?e.message:'保存結果を確認できません。')}finally{lock.current=false;setBusy(false)}
 }
 return <section className="space-y-3"><h3 className="text-xl font-bold">{horse.name}の参加取消</h3>
   <p>登録済みの出番 {starts.length}件</p>
   {starts.map(e=><p key={e.entry_id}>{winterCompetitionLabel(data.competitions.find(c=>c.id===e.competition_id)!)}　{e.start_order}番　{data.riders.find(r=>r.id===e.rider_id)?.name}</p>)}
   {starts.length?<p>出番がある馬の参加一括取消は準備中です。競技1件だけの取消は、団体のエントリー一覧から行えます。</p>:<>
     <p>今大会の参加馬と入厩名簿から外し、馬匹登録料 {WINTER_HORSE_REGISTRATION_FEE.toLocaleString('ja-JP')}円を請求から外します。共通名簿と入金記録は保持します。</p>
     <button className={groupActionClass} disabled={busy} onClick={()=>void cancel()}>{busy?'保存結果を確認中…':'この馬の参加取消を確定'}</button>
   </>}{error&&<p role="alert" className="text-red-800">{error}</p>}
 </section>
}
