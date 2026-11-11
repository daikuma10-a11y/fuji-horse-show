"use client"
import {useEffect,useMemo,useState} from 'react'
import type {loadWinterData} from '@/lib/winter-data'
import {winterRegistrationOverview} from '@/lib/winter-registration-overview'
import {MasterRegistrationOverview} from '@/components/master/registration-overview'
import {loadWinterOverviewCredentials,type OverviewCredentials} from '@/lib/winter-overview-credentials'

import {WINTER_EVENT_ID} from '@/lib/winter-event'
import type {AdminSession} from '@/lib/supabase-rest'
import {GroupRegistrationTools,groupActionClass,type GroupEdit} from './master/group-registration-tools'
import {WinterGroupPerson} from './winter-group-person'
import {WinterEntryCancellation} from './winter-entry-cancellation'
import {WinterHorseSubstitution} from './winter-horse-substitution'
import {horseCancelKey,WinterGroupHorseCancel} from './winter-group-horse-cancel'
import {WinterSettlementPanel} from './winter-settlement-panel'
import {WinterStableInformation} from './winter-stable-information'
import {WinterGroupImportRecords} from './winter-group-import-records'

type Data=Awaited<ReturnType<typeof loadWinterData>>
export function WinterRegistrationOverview({data,session,onSession,onChanged,revision,active=true,loading=false,error=''}:{data:Data|null;session:AdminSession;onSession:(s:AdminSession)=>void;onChanged:()=>void;revision:number;active?:boolean;loading?:boolean;error?:string}){
 const[selectedId,setSelectedId]=useState('')
 const token=session.accessToken
 const [edit,setEdit]=useState<GroupEdit|null>(null),[message,setMessage]=useState('')
 function select(id:string){setEdit(null);setMessage('');setSelectedId(id)}
 function open(task:GroupEdit){
   setMessage('');setEdit(task)
   requestAnimationFrame(()=>document.getElementById('group-registration-editor')?.focus())
 }
 function saved(message:string){setMessage(message);setEdit(null);onChanged()}
 const[credentials,setCredentials]=useState<{data:Data;token:string;values?:OverviewCredentials;error?:string}|null>(null)
 useEffect(()=>{
  if(!active||!data||!token)return
  const controller=new AbortController()
  setCredentials({data,token})
  loadWinterOverviewCredentials(data,token,controller.signal).then(values=>{if(!controller.signal.aborted)setCredentials({data,token,values})}).catch(reason=>{if(!controller.signal.aborted)setCredentials({data,token,error:reason instanceof Error?reason.message:'資格級・グレード宣言を取得できません'})})
  return()=>controller.abort()
 },[active,data,token])
 const current=credentials?.data===data&&credentials?.token===token?credentials:null
 const view=useMemo(()=>{
  try{
   const groups=data?winterRegistrationOverview(data):[]
   const decorate=(rows:typeof groups[number]['riders'])=>rows.map(row=>({...row,credential:current?.values?.[row.id]??{value:current?.error?'取得できません':'照合中',source:'',needsReview:true}}))
   return {groups:groups.map(group=>({...group,riders:decorate(group.riders),horses:decorate(group.horses)})),error:''}
  }
  catch(reason){return {groups:[],error:reason instanceof Error?reason.message:'登録内容を確認できません'}}
 },[data,current])
 const group=view.groups.find(g=>g.id===selectedId)
 const horse=edit&&'id' in edit?data?.horses.find(h=>h.id===edit.id&&h.organization_id===selectedId):undefined
 const person=edit?.kind==='identity'?group?.[edit.type==='horse'?'horses':'riders'].find(p=>p.id===edit.id):undefined
 const shared={session,onSession,onChanged,revision}
 const [pendingSwap,setPendingSwap]=useState<{horseId:string;legacy:boolean}|null>(null)
 useEffect(()=>{
   if(!active||!selectedId||!data)return
   const horses=[...data.horses,...(data.historicalHorses??[])].filter(h=>h.organization_id===selectedId)
   const prefix=WINTER_EVENT_ID+':horse-swap:'+session.email
   const keys=[prefix,...horses.map(h=>prefix+':'+h.id)]
   let found=null
   for(const key of keys){
     const raw=sessionStorage.getItem(key)
     if(!raw)continue
     try{const a=JSON.parse(raw);if(a.id&&horses.some(h=>h.id===a.input?.old)){found={horseId:String(a.input.old),legacy:key===prefix};break}}catch{continue}
   }
   setPendingSwap(found)
 },[active,data,selectedId,session.email,edit])
 const [pendingHorseId,setPendingHorseId]=useState('')
 useEffect(()=>{
   if(!selectedId)return
   const raw=sessionStorage.getItem(horseCancelKey(session.email,selectedId))
   try{setPendingHorseId(raw?JSON.parse(raw)?.quote?.horseId??'':'')}catch{setPendingHorseId('')}
 },[selectedId,session.email,data,edit])
 const cancelTarget=horse??(edit?.kind==='cancelHorse'&&pendingHorseId===edit.id?data?.historicalHorses?.find(h=>h.id===edit.id&&h.organization_id===selectedId):undefined)
 const owned=(kind:'horse'|'rider',id:string)=>data?.[kind==='horse'?'horses':'riders'].some(p=>p.id===id&&p.organization_id===selectedId)
 const eligibleEntry=(id:string)=>data?.entries.some(e=>e.entry_id===id&&e.source==='winter-initial'&&!/^(wd|withdrawn)$/i.test(e.status))
 return <MasterRegistrationOverview groups={view.groups} selectedId={selectedId} onSelect={select} loading={!data&&(loading||!error)} error={error||view.error} credentialNotice={current?.error}
   personAction={(kind,id)=>owned(kind,id)?<div className="flex flex-wrap gap-2">
     <button className={groupActionClass} onClick={()=>open({kind:'identity',type:kind,id})}>編集</button>
     {kind==='horse'&&<><button className={groupActionClass} onClick={()=>open({kind:'cancelHorse',id})}>参加取消</button>
       <button className={groupActionClass} onClick={()=>open({kind:'substitute',id})}>差し替え</button></>}
   </div>:<span>所属団体から編集</span>}
   entryAction={id=>eligibleEntry(id)&&<button className={groupActionClass} onClick={()=>open({kind:'cancelEntry',id})}>この出番を取消</button>}
   tools={group&&data&&<>{pendingHorseId&&<button className={groupActionClass} onClick={()=>open({kind:'cancelHorse',id:pendingHorseId})}>この団体の参加取消の確定結果を再確認</button>}{pendingSwap&&<button className={groupActionClass} onClick={()=>open({kind:'substitute',id:pendingSwap.horseId})}>この団体の差し替えの確定結果を再確認</button>}<GroupRegistrationTools edit={edit} open={open} close={()=>setEdit(null)} message={message}>
     {edit?.kind==='payment'&&<WinterSettlementPanel key={group.id} data={data} organizationId={group.id} {...shared}/>}
     {edit?.kind==='stable'&&<WinterStableInformation key={group.id} data={data} loading={loading} error={error} active={active} organizationId={group.id} {...shared}/>}
     {edit?.kind==='source'&&<WinterGroupImportRecords key={group.id} orgId={group.id}/>}
     {edit?.kind==='identity'&&person&&<WinterGroupPerson key={person.id} kind={edit.type} person={person} orgId={group.id} session={session} onSession={onSession} onSaved={()=>saved(person.name+'の名簿を訂正しました。')}/>}
     {edit?.kind==='cancelHorse'&&cancelTarget&&<WinterGroupHorseCancel key={cancelTarget.id} horse={cancelTarget} data={data} session={session} onSession={onSession} onSaved={()=>saved(cancelTarget.name+'の参加を取り消しました。馬匹登録料を請求から外しました。')}/>}
     {edit?.kind==='substitute'&&(horse||pendingSwap?.horseId===edit.id)&&<WinterHorseSubstitution key={edit.id} data={data} horseId={pendingSwap?.legacy&&pendingSwap.horseId===edit.id?undefined:edit.id} session={session} onSession={onSession} onSaved={()=>saved('馬の差し替えを保存しました。出番表と請求額に反映しました。')}/>}
     {edit?.kind==='cancelEntry'&&<WinterEntryCancellation key={edit.id} data={data} entryId={edit.id} session={session} onSession={onSession} onSaved={onChanged}/>}
   </GroupRegistrationTools></>}/>
}
