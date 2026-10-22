"use client"
import {useEffect,useMemo,useState} from 'react'
import type {loadWinterData} from '@/lib/winter-data'
import {winterRegistrationOverview} from '@/lib/winter-registration-overview'
import {MasterRegistrationOverview} from '@/components/master/registration-overview'
import {loadWinterOverviewCredentials,type OverviewCredentials} from '@/lib/winter-overview-credentials'

type Data=Awaited<ReturnType<typeof loadWinterData>>
export function WinterRegistrationOverview({data,token,active=true,loading=false,error=''}:{data:Data|null;token:string;active?:boolean;loading?:boolean;error?:string}){
 const[selectedId,setSelectedId]=useState('')
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
 return <MasterRegistrationOverview groups={view.groups} selectedId={selectedId} onSelect={setSelectedId} loading={loading||!data&&!error} error={error||view.error} credentialNotice={current?.error}/>
}
